/**
 * features/clientes/clientes.component.ts
 * Directorio de clientes: tarjetas con busqueda debounced, modal
 * de creacion/edicion con validaciones y navegacion cruzada al
 * modulo de ventas preseleccionando el cliente.
 */

import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Cliente } from '../../core/models';
import { validateCliente, Errores } from '../../core/validators';
import { ROUTES } from '../../core/constants';

const CLAVE_PRESELECCION = 'cliente_seleccionado';

interface FormCliente {
  identificacion: string;
  nombre: string;
  email: string;
  telefono: string;
}

const FORM_VACIO: FormCliente = { identificacion: '', nombre: '', email: '', telefono: '' };

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [],
  templateUrl: './clientes.component.html',
  styleUrls: ['./clientes.component.css'],
})
export class ClientesComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  clientes: Cliente[] = [];
  loading = true;

  searchTerm = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private terminoEfectivo = '';

  showModal = false;
  editingId: number | null = null;
  formData: FormCliente = { ...FORM_VACIO };
  errors: Errores = {};

  constructor() {
    this.api.get<{ success: boolean; clientes: Cliente[] }>('/clientes').subscribe({
      next: (res) => {
        this.clientes = res.clientes ?? [];
        this.loading = false;
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading = false;
      },
    });
  }

  /** Busqueda con debounce de 300ms (replica useDebounce de React). */
  onSearch(valor: string): void {
    this.searchTerm = valor;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.terminoEfectivo = valor;
    }, 300);
  }

  get filteredClientes(): Cliente[] {
    const term = this.terminoEfectivo.trim().toLowerCase();
    if (!term) return this.clientes;
    return this.clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(term) ||
        c.identificacion.toLowerCase().includes(term) ||
        (!!c.email && c.email.toLowerCase().includes(term))
    );
  }

  handleChange(campo: keyof FormCliente, valor: string): void {
    this.formData = { ...this.formData, [campo]: valor };
    this.errors = { ...this.errors, [campo]: undefined };
  }

  /** Valida y guarda un cliente (crear o actualizar). */
  handleSave(): void {
    const validation = validateCliente(this.formData);
    if (!validation.valid) {
      this.errors = validation.errors;
      return;
    }

    if (this.editingId) {
      this.api
        .put<{ success: boolean; cliente: Cliente }>(`/clientes/${this.editingId}`, this.formData)
        .subscribe({
          next: (res) => {
            this.clientes = this.clientes.map((c) => (c.id === this.editingId ? res.cliente : c));
            this.toast.mostrar('Cliente actualizado correctamente', 'success');
            this.cerrarModal();
          },
          error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        });
    } else {
      this.api.post<{ success: boolean; cliente: Cliente }>('/clientes', this.formData).subscribe({
        next: (res) => {
          this.clientes = [res.cliente, ...this.clientes];
          this.toast.mostrar('Cliente registrado correctamente', 'success');
          this.cerrarModal();
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      });
    }
  }

  openEdit(cliente: Cliente): void {
    this.editingId = cliente.id;
    this.formData = {
      identificacion: cliente.identificacion,
      nombre: cliente.nombre,
      email: cliente.email || '',
      telefono: cliente.telefono || '',
    };
    this.errors = {};
    this.showModal = true;
  }

  cerrarModal(): void {
    this.showModal = false;
    this.editingId = null;
    this.formData = { ...FORM_VACIO };
    this.errors = {};
  }

  /** Elimina un cliente con confirmacion. */
  handleDelete(cliente: Cliente): void {
    if (!window.confirm(`Desea eliminar el cliente "${cliente.nombre}"?`)) return;

    this.api.delete<{ success: boolean; message: string }>(`/clientes/${cliente.id}`).subscribe({
      next: (res) => {
        this.clientes = this.clientes.filter((c) => c.id !== cliente.id);
        this.toast.mostrar(res.message || 'Cliente eliminado', 'success');
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }

  /** Navega al modulo de ventas con el cliente preseleccionado. */
  goToSale(cliente: Cliente): void {
    sessionStorage.setItem(CLAVE_PRESELECCION, JSON.stringify(cliente));
    this.router.navigate([ROUTES.VENTAS]);
  }
}
