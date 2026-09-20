/**
 * features/productos/productos.component.ts
 * Inventario de productos: tabla con busqueda debounced, CRUD con
 * validaciones y ajuste de stock (suma/resta) via modal.
 */

import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Producto } from '../../core/models';
import { formatMoney } from '../../core/formatters';
import { validateProducto, Errores } from '../../core/validators';

/** Filas por pagina (la API admite hasta 200) */
const LIMITE_PAGINA = 20;

interface FormProducto {
  codigo: string;
  nombre: string;
  precio: number | string;
  iva: number;
  stock: number | string;
}

const EMPTY_FORM: FormProducto = {
  codigo: '',
  nombre: '',
  precio: '',
  iva: 0.19,
  stock: '',
};

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './productos.component.html',
  styleUrls: ['./productos.component.css'],
})
export class ProductosComponent implements OnDestroy {

  private api = inject(ApiService);
  private toast = inject(ToastService);

  /**
   * Marca la vista tras las respuestas HTTP. En Angular 22 el ciclo de
   * deteccion solo revisa las vistas marcadas como sucias: mutar propiedades
   * planas en un callback asincrono no marca la vista y la tabla se quedaba
   * en "Cargando..." con los datos ya en memoria. markForCheck() marca la
   * vista y ademas programa el ciclo de deteccion.
   */
  private cdr = inject(ChangeDetectorRef);

  productos: Producto[] = [];
  loading = true;

  /** Paginacion resuelta por el servidor */
  total = 0;
  pagina = 1;
  totalPaginas = 1;

  searchTerm = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  showModal = false;
  editingId: number | null = null;
  formData: FormProducto = { ...EMPTY_FORM };
  errors: Errores = {};

  stockTarget: Producto | null = null;
  stockCantidad = 1;

  // Formateador expuesto a la plantilla
  money = formatMoney;

  /** Referencia a Math para uso en la plantilla. */
  readonly Math = Math;

  constructor() {
    this.cargar();
  }

  /** Cancela el temporizador de busqueda pendiente al salir de la vista. */
  ngOnDestroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Carga la pagina actual desde el servidor. Antes se traian 200 filas y
   * se filtraba en el navegador: con un catalogo mayor, los productos
   * restantes no aparecian ni en la tabla ni en la busqueda.
   */
  cargar(): void {
    this.loading = true;
    const params = new URLSearchParams({
      pagina: String(this.pagina),
      limite: String(LIMITE_PAGINA),
    });
    const termino = this.searchTerm.trim();
    if (termino) params.set('q', termino);

    this.api
      .get<{ success: boolean; productos: Producto[]; total: number; totalPaginas: number }>(
        `/productos?${params.toString()}`
      )
      .subscribe({
        next: (res) => {
          this.productos = res.productos ?? [];
          this.total = Number(res.total) || 0;
          this.totalPaginas = Math.max(Number(res.totalPaginas) || 1, 1);
          if (this.pagina > this.totalPaginas) {
            this.pagina = this.totalPaginas;
            this.cargar();
            return;
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  /** Busqueda con debounce de 300ms resuelta en el servidor. */
  onSearch(valor: string): void {
    this.searchTerm = valor;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.pagina = 1;
      this.cargar();
    }, 300);
  }

  /** Navega a una pagina concreta. */
  irAPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas || pagina === this.pagina) return;
    this.pagina = pagina;
    this.cargar();
  }

  handleChange(campo: keyof FormProducto, valor: string): void {
    this.formData = { ...this.formData, [campo]: valor };
    this.errors = { ...this.errors, [campo]: undefined };
  }

  openCreate(): void {
    this.editingId = null;
    this.formData = { ...EMPTY_FORM };
    this.errors = {};
    this.showModal = true;
  }

  openEdit(producto: Producto): void {
    this.editingId = producto.id;
    this.formData = {
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: producto.precio,
      iva: producto.iva,
      stock: producto.stock,
    };
    this.errors = {};
    this.showModal = true;
  }

  cerrarModal(): void {
    this.showModal = false;
  }

  /** Guarda (crea o actualiza) un producto tras validar el formulario. */
  handleSave(): void {
    const validation = validateProducto(this.formData);
    if (!validation.valid) {
      this.errors = validation.errors;
      return;
    }

    const payload = {
      codigo: String(this.formData.codigo).trim(),
      nombre: String(this.formData.nombre).trim(),
      precio: Number(this.formData.precio),
      iva: Number(this.formData.iva),
      stock: Number(this.formData.stock),
    };

    if (this.editingId) {
      this.api
        .put<{ success: boolean; producto: Producto }>(`/productos/${this.editingId}`, payload)
        .subscribe({
          next: () => {
            this.toast.mostrar('Producto actualizado correctamente', 'success');
            this.showModal = false;
            this.cargar();
          },
          error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        });
    } else {
      this.api.post<{ success: boolean; producto: Producto }>('/productos', payload).subscribe({
        next: () => {
          this.toast.mostrar('Producto registrado correctamente', 'success');
          this.showModal = false;
          this.pagina = 1;
          this.cargar();
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      });
    }
  }

  /** Confirma la eliminacion de un producto. */
  handleDelete(producto: Producto): void {
    if (!window.confirm(`Desea eliminar el producto "${producto.nombre}"?`)) return;

    this.api.delete<{ success: boolean; message: string }>(`/productos/${producto.id}`).subscribe({
      next: () => {
        this.toast.mostrar('Producto eliminado correctamente', 'success');
        this.cargar();
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }

  /** Aplica el ajuste de stock (positivo suma, negativo resta). */
  handleAdjustStock(): void {
    if (!this.stockTarget) return;
    const cantidad = Number(this.stockCantidad);
    if (!Number.isInteger(cantidad) || cantidad === 0) {
      this.toast.mostrar('La cantidad debe ser un entero distinto de cero', 'warning');
      return;
    }

    const objetivo = this.stockTarget;
    this.api
      .patch<{ success: boolean; producto: Producto }>(`/productos/${objetivo.id}/stock`, { cantidad })
      .subscribe({
        next: (res) => {
          this.productos = this.productos.map((p) => (p.id === objetivo.id ? res.producto : p));
          this.cerrarStock();
          this.toast.mostrar(`Stock de "${objetivo.nombre}" ajustado`, 'success');
          this.cdr.markForCheck();
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      });
  }

  abrirStock(producto: Producto): void {
    this.stockTarget = producto;
    this.stockCantidad = 1;
  }

  cerrarStock(): void {
    this.stockTarget = null;
    this.stockCantidad = 1;
  }
}
