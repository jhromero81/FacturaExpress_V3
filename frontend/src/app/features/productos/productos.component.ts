/**
 * features/productos/productos.component.ts
 * Inventario de productos: tabla con busqueda debounced, CRUD con
 * validaciones y ajuste de stock (suma/resta) via modal.
 */

import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Producto } from '../../core/models';
import { formatMoney } from '../../core/formatters';
import { validateProducto, Errores } from '../../core/validators';

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
export class ProductosComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  productos: Producto[] = [];
  loading = true;

  searchTerm = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private terminoEfectivo = '';

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
    this.api.get<{ success: boolean; productos: Producto[] }>('/productos?limite=200').subscribe({
      next: (res) => {
        this.productos = res.productos ?? [];
        this.loading = false;
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading = false;
      },
    });
  }

  /** Busqueda con debounce de 300ms. */
  onSearch(valor: string): void {
    this.searchTerm = valor;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.terminoEfectivo = valor;
    }, 300);
  }

  get filteredProductos(): Producto[] {
    const term = this.terminoEfectivo.trim().toLowerCase();
    if (!term) return this.productos;
    return this.productos.filter(
      (p) => p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term)
    );
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
          next: (res) => {
            this.productos = this.productos.map((p) => (p.id === this.editingId ? res.producto : p));
            this.toast.mostrar('Producto actualizado correctamente', 'success');
            this.showModal = false;
          },
          error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        });
    } else {
      this.api.post<{ success: boolean; producto: Producto }>('/productos', payload).subscribe({
        next: (res) => {
          this.productos = [res.producto, ...this.productos];
          this.toast.mostrar('Producto registrado correctamente', 'success');
          this.showModal = false;
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
        this.productos = this.productos.filter((p) => p.id !== producto.id);
        this.toast.mostrar('Producto eliminado correctamente', 'success');
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
