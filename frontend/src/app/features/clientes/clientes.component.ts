/**
 * features/clientes/clientes.component.ts
 * Directorio de clientes: tarjetas con busqueda debounced, modal
 * de creacion/edicion con validaciones y navegacion cruzada al
 * modulo de ventas preseleccionando el cliente.
 */

import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
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
   * Marca la vista tras las respuestas HTTP. En Angular 22 el ciclo de
   * deteccion solo revisa las vistas marcadas como sucias: mutar propiedades
   * planas en un callback asincrono no marca la vista y el listado se quedaba
   * en "Cargando..." con los datos ya en memoria. markForCheck() marca la
   * vista y ademas programa el ciclo de deteccion.
   */
  private cdr = inject(ChangeDetectorRef);

  clientes: Cliente[] = [];
  loading = true;

  /** Paginacion resuelta por el servidor */
  total = 0;
  pagina = 1;
  totalPaginas = 1;

  searchTerm = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  showModal = false;
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
    this.loading = true;
    const params = new URLSearchParams({
      pagina: String(this.pagina),
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
          this.clientes = res.clientes ?? [];
          this.total = Number(res.total) || 0;
          this.totalPaginas = Math.max(Number(res.totalPaginas) || 1, 1);
          // Si la pagina solicitada quedo fuera de rango (por ejemplo tras
          // eliminar el ultimo registro), retroceder a la ultima existente.
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
          this.pagina = 1;
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
