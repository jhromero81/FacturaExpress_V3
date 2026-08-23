/**
 * features/ventas/nueva-venta.component.ts
 * Punto de venta (POS) de FacturaExpress: busqueda de cliente con
 * autocompletado, seleccion por modal, carrito con controles de
 * cantidad y panel de pago oscuro con descuento e IVA.
 */

import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Cliente, Producto } from '../../core/models';
import { formatMoney } from '../../core/formatters';
import { ROUTES } from '../../core/constants';

interface ItemCarrito extends Producto {
  cantidad: number;
}

const CLAVE_PRESELECCION = 'cliente_seleccionado';

@Component({
  selector: 'app-nueva-venta',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './nueva-venta.component.html',
  styleUrls: ['./nueva-venta.component.css'],
})
export class NuevaVentaComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  productos: Producto[] = [];
  clientes: Cliente[] = [];
  cart: ItemCarrito[] = [];
  cliente: Cliente | null = null;

  loading = true;
  errorCatalogo = false;
  isFinalizing = false;
  showClientModal = false;

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

  /** Carga clientes y productos; en error muestra estado con reintento. */
  cargarCatalogo(): void {
    this.loading = true;
    this.errorCatalogo = false;

    this.api.get<{ success: boolean; clientes: Cliente[] }>('/clientes').subscribe({
      next: (res) => {
        this.clientes = res.clientes ?? [];
        this.restaurarPreseleccion();
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.errorCatalogo = true;
        this.loading = false;
      },
    });

    this.api.get<{ success: boolean; productos: Producto[] }>('/productos').subscribe({
      next: (res) => {
        this.productos = res.productos ?? [];
        this.loading = false;
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.errorCatalogo = true;
        this.loading = false;
      },
    });
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

  get iva(): number {
    return Math.round(this.baseGravable * 0.19);
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

          setTimeout(() => {
            if (window.confirm('Venta registrada. Desea ver el historial de facturacion?')) {
              this.router.navigate([ROUTES.FACTURACION]);
            }
          }, 500);
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        complete: () => (this.isFinalizing = false),
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
