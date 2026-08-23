/**
 * features/admin/errores.component.ts
 * Bitacora de errores de procesos internos (firma, DIAN, bd,
 * correo): KPIs, filtros por tipo/estado y marcado como resuelto.
 */

import { Component, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { formatDate } from '../../core/formatters';
import { ERROR_TIPOS } from '../../core/constants';

interface ErrorSistema {
  id: number;
  mensaje: string;
  tipo: string;
  facturaId: number | null;
  facturaNumero: string | null;
  resuelto: boolean;
  fechaResolucion: string | null;
  createdAt: string;
}

interface ErroresKPIs {
  total: number;
  resueltos: number;
  noResueltos: number;
}

@Component({
  selector: 'app-errores',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './errores.component.html',
  styleUrls: ['./errores.component.css'],
})
export class ErroresComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  errores: ErrorSistema[] = [];
  kpis: ErroresKPIs = { total: 0, resueltos: 0, noResueltos: 0 };
  loading = signal(true);

  tipoFilter = '';
  resueltoFilter = '';

  /** Al montar el modulo se carga la bitacora con los filtros por defecto. */
  constructor() {
    this.loadErrores();
  }

  readonly tipos = ERROR_TIPOS;

  /** Etiqueta legible de un tipo de error. */
  tipoLabel(tipo: string): string {
    return tipo.charAt(0).toUpperCase() + tipo.slice(1);
  }

  fecha(valor: string | null): string {
    return valor ? formatDate(valor) : '--';
  }

  /** Carga los errores con los filtros activos. */
  loadErrores(): void {
    this.loading.set(true);
    const params = new URLSearchParams();
    if (this.tipoFilter) params.set('tipo', this.tipoFilter);
    if (this.resueltoFilter !== '') params.set('resuelto', this.resueltoFilter);

    this.api
      .get<{
        success: boolean;
        total: number;
        resueltos: number;
        noResueltos: number;
        errores: ErrorSistema[];
      }>(`/errores?${params.toString()}`)
      .subscribe({
        next: (res) => {
          this.errores = res.errores ?? [];
          this.kpis = { total: res.total, resueltos: res.resueltos, noResueltos: res.noResueltos };
          this.loading.set(false);
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.loading.set(false);
        },
      });
  }

  /** Marca un error como resuelto y recarga la lista. */
  handleResolver(error: ErrorSistema): void {
    this.api.patch<{ success: boolean }>(`/errores/${error.id}/resolver`, {}).subscribe({
      next: () => {
        this.toast.mostrar('Error marcado como resuelto', 'success');
        this.loadErrores();
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }
}
