/**
 * features/clientes/clientes.component.ts
 * Directorio de clientes: tarjetas con busqueda debounced, modal
 * de creacion/edicion con validaciones y navegacion cruzada al
 * modulo de ventas preseleccionando el cliente.
 */

import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Cliente } from '../../core/models';
import { validateCliente, Errores } from '../../core/validators';
import { ROUTES } from '../../core/constants';

const CLAVE_PRESELECCION = 'cliente_seleccionado';

/** Filas por pagina (la API admite hasta 200) */
const LIMITE_PAGINA = 24;

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
export class ClientesComponent implements OnDestroy {

  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /**
   * Estado de la vista como senales. Angular marca la vista cuando una senal
   * cambia, incluso dentro de un callback HTTP; con propiedades planas el
   * ciclo de deteccion de Angular 22 no recompone la vista y el listado se
   * quedaba en "Cargando..." con los datos ya en memoria.
   */
  readonly clientes = signal<Cliente[]>([]);
  readonly loading = signal(true);

  /** Paginacion resuelta por el servidor */
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly totalPaginas = signal(1);

  /** Texto de busqueda (lo actualiza la plantilla, nunca un callback HTTP) */
  searchTerm = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly showModal = signal(false);
  editingId: number | null = null;
  formData: FormCliente = { ...FORM_VACIO };
  errors: Errores = {};

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
   * Carga la pagina actual desde el servidor. La busqueda y la paginacion
   * se resuelven en la API: antes se filtraba en el navegador sobre la
   * primera pagina (50 registros) y los clientes restantes no aparecian
   * nunca en los resultados.
   */
  cargar(): void {
    this.loading.set(true);
    const params = new URLSearchParams({
      pagina: String(this.pagina()),
      limite: String(LIMITE_PAGINA),
    });
    const termino = this.searchTerm.trim();
    if (termino) params.set('q', termino);

    this.api
      .get<{ success: boolean; clientes: Cliente[]; total: number; totalPaginas: number }>(
        `/clientes?${params.toString()}`
      )
      .subscribe({
        next: (res) => {
          this.clientes.set(res.clientes ?? []);
          this.total.set(Number(res.total) || 0);
          this.totalPaginas.set(Math.max(Number(res.totalPaginas) || 1, 1));
          // Si la pagina solicitada quedo fuera de rango (por ejemplo tras
          // eliminar el ultimo registro), retroceder a la ultima existente.
          if (this.pagina() > this.totalPaginas()) {
            this.pagina.set(this.totalPaginas());
            this.cargar();
            return;
          }
          this.loading.set(false);
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.loading.set(false);
        },
      });
  }

  /** Busqueda con debounce de 300ms resuelta en el servidor. */
  onSearch(valor: string): void {
    this.searchTerm = valor;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.pagina.set(1);
      this.cargar();
    }, 300);
  }

  /** Navega a una pagina concreta. */
  irAPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas() || pagina === this.pagina()) return;
    this.pagina.set(pagina);
    this.cargar();
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
          next: () => {
            this.toast.mostrar('Cliente actualizado correctamente', 'success');
            this.cerrarModal();
            this.cargar();
          },
          error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        });
    } else {
      this.api.post<{ success: boolean; cliente: Cliente }>('/clientes', this.formData).subscribe({
        next: () => {
          this.toast.mostrar('Cliente registrado correctamente', 'success');
          this.cerrarModal();
          this.pagina.set(1);
          this.cargar();
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
    this.showModal.set(true);
  }

  /** Abre el modal en modo creacion (desde la plantilla). */
  openCreate(): void {
    this.editingId = null;
    this.formData = { ...FORM_VACIO };
    this.errors = {};
    this.showModal.set(true);
  }

  cerrarModal(): void {
    this.showModal.set(false);
    this.editingId = null;
    this.formData = { ...FORM_VACIO };
    this.errors = {};
  }

  /** Elimina un cliente con confirmacion. */
  handleDelete(cliente: Cliente): void {
    if (!window.confirm(`Desea eliminar el cliente "${cliente.nombre}"?`)) return;

    this.api.delete<{ success: boolean; message: string }>(`/clientes/${cliente.id}`).subscribe({
      next: (res) => {
        this.toast.mostrar(res.message || 'Cliente eliminado', 'success');
        this.cargar();
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
