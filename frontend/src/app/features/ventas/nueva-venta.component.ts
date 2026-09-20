/**
 * features/ventas/nueva-venta.component.ts
 * Punto de venta (POS) de FacturaExpress: busqueda de cliente con
 * autocompletado, seleccion por modal, carrito con controles de
 * cantidad y panel de pago oscuro con descuento e IVA.
 */

import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Cliente, Producto } from '../../core/models';
import { calcularIVA, formatMoney } from '../../core/formatters';
import { ROUTES } from '../../core/constants';

interface ItemCarrito extends Producto {
  cantidad: number;
}

const CLAVE_PRESELECCION = 'cliente_seleccionado';

/** Maximo de filas que la API devuelve en un listado */
const LIMITE_CATALOGO = 200;

@Component({
  selector: 'app-nueva-venta',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './nueva-venta.component.html',
  styleUrls: ['./nueva-venta.component.css'],
})
export class NuevaVentaComponent implements OnDestroy {

  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /**
   * Marca la vista tras las respuestas HTTP. En Angular 22 el ciclo de
   * deteccion solo revisa las vistas marcadas como sucias: mutar propiedades
   * planas en un callback asincrono no marca la vista, de modo que el
   * catalogo se quedaba en "Cargando..." con los datos ya en memoria.
   * markForCheck() marca la vista y ademas programa el ciclo de deteccion.
   */
  private cdr = inject(ChangeDetectorRef);

  productos: Producto[] = [];
  clientes: Cliente[] = [];
  cart: ItemCarrito[] = [];
  cliente: Cliente | null = null;

  loading = true;
  errorCatalogo = false;
  isFinalizing = false;
  showClientModal = false;
  private pendienteCatalogo = 0;
  private falloCatalogo = false;

  /** Temporizador del aviso posterior a la venta, cancelable al destruir. */
  private temporizadorAviso: ReturnType<typeof setTimeout> | null = null;

  searchTerm = '';
  clientNitSearch = '';
  clientNameSearch = '';
  clientModalSearch = '';
  descuentoPct = 0;

  // Formateador expuesto a la plantilla
  money = formatMoney;

  /** Referencia a Math para uso en la plantilla. */
  readonly Math = Math;

  constructor() {
    this.cargarCatalogo();
  }

  ngOnDestroy(): void {
    if (this.temporizadorAviso !== null) {
      clearTimeout(this.temporizadorAviso);
      this.temporizadorAviso = null;
    }
  }

  /** Carga clientes y productos de forma independiente; el flag de
   *  carga solo se apaga cuando ambas peticiones completan. */
  cargarCatalogo(): void {
    this.loading = true;
    this.errorCatalogo = false;
    this.pendienteCatalogo = 2;
    this.falloCatalogo = false;

    // Se pide el maximo que admite la API. Si el catalogo real es mayor,
    // avisar: antes se cargaban 50 registros en silencio y el punto de
    // venta no encontraba los productos ni los clientes restantes.
    this.api
      .get<{ success: boolean; clientes: Cliente[]; total: number }>(
        `/clientes?limite=${LIMITE_CATALOGO}`
      )
      .subscribe({
        next: (res) => {
          this.clientes = res.clientes ?? [];
          if (Number(res.total) > this.clientes.length) {
            this.avisarTruncado('clientes', this.clientes.length, Number(res.total));
          }
          this.restaurarPreseleccion();
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.falloCatalogo = true;
          // RxJS no invoca complete despues de un error: sin esta llamada el
          // indicador de carga del catalogo se quedaba activo indefinidamente.
          this.cerrarCargarCatalogo();
        },
        complete: () => this.cerrarCargarCatalogo(),
      });

    this.api
      .get<{ success: boolean; productos: Producto[]; total: number }>(
        `/productos?limite=${LIMITE_CATALOGO}`
      )
      .subscribe({
        next: (res) => {
          this.productos = res.productos ?? [];
          if (Number(res.total) > this.productos.length) {
            this.avisarTruncado('productos', this.productos.length, Number(res.total));
          }
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.falloCatalogo = true;
          // Ver nota del catalogo de clientes: complete no se ejecuta tras
          // un error y el indicador de carga quedaba activo para siempre.
          this.cerrarCargarCatalogo();
        },
        complete: () => this.cerrarCargarCatalogo(),
      });
  }

  /** Avisa de que el catalogo cargado esta incompleto. */
  private avisarTruncado(recurso: string, cargados: number, total: number): void {
    this.toast.mostrar(
      `Se cargaron ${cargados} de ${total} ${recurso}. Refine la busqueda para encontrar el resto.`,
      'warning'
    );
  }

  /** Apaga el estado de carga cuando ambas peticiones del catalogo terminaron. */
  private cerrarCargarCatalogo(): void {
    this.pendienteCatalogo -= 1;
    if (this.pendienteCatalogo > 0) return;
    this.errorCatalogo = this.falloCatalogo;
    this.loading = false;
    this.cdr.markForCheck();
  }

  /** Restaura el cliente preseleccionado desde el modulo de clientes (un solo uso). */
  private restaurarPreseleccion(): void {
    try {
      const crudo = sessionStorage.getItem(CLAVE_PRESELECCION);
      if (!crudo) return;
      const preseleccionado = JSON.parse(crudo) as Pick<Cliente, 'id'>;
      const match = this.clientes.find((c) => c.id === preseleccionado.id);
      if (match) this.cliente = match;
      sessionStorage.removeItem(CLAVE_PRESELECCION);
    } catch {
      /* preseleccion invalida: se ignora */
    }
  }

  /** Totales de la venta */
  get subtotal(): number {
    return this.cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  }

  get montoDescuento(): number {
    const pct = Math.min(Math.max(this.descuentoPct || 0, 0), 100);
    return Math.round(this.subtotal * (pct / 100));
  }

  get baseGravable(): number {
    return this.subtotal - this.montoDescuento;
  }

  /**
   * IVA de la venta: se calcula por linea con la tarifa de cada producto
   * sobre la base ya descontada, igual que el servidor. Antes se aplicaba
   * siempre el 19% a toda la venta, de modo que un producto exento o al 5%
   * se cobraba de mas y el total mostrado no coincidia con la factura.
   */
  get iva(): number {
    const factor = 1 - Math.min(Math.max(this.descuentoPct || 0, 0), 100) / 100;
    return this.cart.reduce((sum, item) => {
      const baseLinea = Math.round(item.precio * item.cantidad * factor);
      return sum + calcularIVA(baseLinea, Number(item.iva));
    }, 0);
  }

  /** Tarifas de IVA presentes en el carrito, para la etiqueta del panel. */
  get tarifasIva(): string {
    const tarifas = [...new Set(this.cart.map((i) => Number(i.iva)))].sort((a, b) => a - b);
    return tarifas.map((t) => `${Math.round(t * 100)}%`).join(' / ');
  }

  get total(): number {
    return this.baseGravable + this.iva;
  }

  /** Agrega un producto al carrito respetando el stock disponible. */
  addToCart(producto: Producto): void {
    if (producto.stock <= 0) {
      this.toast.mostrar('Stock insuficiente para agregar este producto', 'warning');
      return;
    }
    const existing = this.cart.find((item) => item.id === producto.id);
    if (existing) {
      if (existing.cantidad >= producto.stock) {
        this.toast.mostrar('Stock insuficiente para agregar mas unidades', 'warning');
        return;
      }
      existing.cantidad += 1;
      return;
    }
    this.cart.push({ ...producto, cantidad: 1 });
  }

  incrementQty(id: number): void {
    const item = this.cart.find((i) => i.id === id);
    if (!item) return;
    if (item.cantidad >= item.stock) {
      this.toast.mostrar('Stock insuficiente para agregar mas unidades', 'warning');
      return;
    }
    item.cantidad += 1;
  }

  decrementQty(id: number): void {
    const item = this.cart.find((i) => i.id === id);
    if (item && item.cantidad > 1) item.cantidad -= 1;
  }

  removeFromCart(id: number): void {
    this.cart = this.cart.filter((item) => item.id !== id);
  }

  /** Limpia la venta actual (carrito, cliente y descuento). */
  nuevaVenta(): void {
    this.cart = [];
    this.cliente = null;
    this.descuentoPct = 0;
  }

  /**
   * Recarga el catalogo de productos para reflejar el stock real. Sin
   * esto el carrito seguia validando contra el stock anterior a la venta
   * y permitia armar una venta que el servidor rechazaba con 409.
   */
  private refrescarStock(): void {
    this.api
      .get<{ success: boolean; productos: Producto[] }>(`/productos?limite=${LIMITE_CATALOGO}`)
      .subscribe({
        next: (res) => {
          this.productos = res.productos ?? [];
          this.cdr.markForCheck();
        },
        // El refresco es best-effort: si falla, la venta ya esta registrada.
        error: () => undefined,
      });
  }

  /** Finaliza la venta generando la factura electronica en el backend. */
  finalizeSale(): void {
    if (this.cart.length === 0) {
      this.toast.mostrar('Agregue al menos un producto para finalizar la venta', 'warning');
      return;
    }
    if (!this.cliente) {
      this.toast.mostrar('Seleccione un cliente para la venta', 'warning');
      return;
    }

    this.isFinalizing = true;
    this.api
      .post<{ success: boolean; factura: { numero: string } }>('/facturas', {
        clienteId: this.cliente.id,
        items: this.cart.map((item) => ({
          productoId: item.id,
          cantidad: item.cantidad,
        })),
        descuento: this.descuentoPct || 0,
      })
      .subscribe({
        next: (res) => {
          this.toast.mostrar(`Venta finalizada: ${res.factura.numero}`, 'success');
          this.nuevaVenta();
          this.refrescarStock();
          this.cdr.markForCheck();

          if (this.temporizadorAviso !== null) clearTimeout(this.temporizadorAviso);
          this.temporizadorAviso = setTimeout(() => {
            this.temporizadorAviso = null;
            if (window.confirm('Venta registrada. Desea ver el historial de facturacion?')) {
              this.router.navigate([ROUTES.FACTURACION]);
            }
          }, 500);
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        complete: () => {
          this.isFinalizing = false;
          this.cdr.markForCheck();
        },
      });
  }

  /** Productos filtrados por termino de busqueda. */
  get filteredProducts(): Producto[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return [];
    return this.productos.filter(
      (p) => p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term)
    );
  }

  /** Clientes filtrados por NIT (autocompletado). */
  get filteredClientesNit(): Cliente[] {
    const term = this.clientNitSearch.trim().toLowerCase();
    if (!term) return [];
    return this.clientes.filter((c) => c.identificacion.toLowerCase().includes(term));
  }

  /** Clientes filtrados por nombre (autocompletado). */
  get filteredClientesNombre(): Cliente[] {
    const term = this.clientNameSearch.trim().toLowerCase();
    if (!term) return [];
    return this.clientes.filter((c) => c.nombre.toLowerCase().includes(term));
  }

  /** Clientes del modal de seleccion (lista completa si no hay filtro). */
  get filteredModalClientes(): Cliente[] {
    const term = this.clientModalSearch.trim().toLowerCase();
    if (!term) return this.clientes;
    return this.clientes.filter(
      (c) => c.nombre.toLowerCase().includes(term) || c.identificacion.toLowerCase().includes(term)
    );
  }

  selectClient(c: Cliente): void {
    this.cliente = c;
    this.showClientModal = false;
  }
}
