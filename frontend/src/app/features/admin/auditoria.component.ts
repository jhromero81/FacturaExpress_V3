/**
 * features/admin/auditoria.component.ts (solo admin)
 * Bitacora de operaciones criticas: filtros por tabla y busqueda
 * por accion/usuario. Consume GET /api/logs.
 */

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { formatDate, timeAgo } from '../../core/formatters';

interface LogAuditoria {
  id: number;
  usuarioId: number | null;
  usuarioNombre: string;
  accion: string;
  tabla: string;
  registroId: number | null;
  ip: string;
  fecha: string;
}

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auditoria.component.html',
  styleUrls: ['./auditoria.component.css'],
})
export class AuditoriaComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  private api = inject(ApiService);
  private toast = inject(ToastService);

  logs: LogAuditoria[] = [];
  tablas: string[] = [];
  loading = signal(true);

  tablaFilter = '';
  searchTerm = '';

  /** Al montar el modulo se cargan los ultimos registros de auditoria. */
  constructor() {
    this.loadLogs();
  }

  /** Funciones de formato expuestas para la plantilla. */
  readonly formatDate = formatDate;
  readonly timeAgo = timeAgo;

  /** Carga los registros de auditoria con el filtro de tabla. */
  loadLogs(): void {
    this.loading.set(true);
    const params = new URLSearchParams({ limite: '300' });
    if (this.tablaFilter) params.set('tabla', this.tablaFilter);

    this.api
      .get<{ success: boolean; logs: LogAuditoria[]; tablas: string[] }>(`/logs?${params.toString()}`)
      .subscribe({
        next: (res) => {
          this.logs = res.logs ?? [];
          this.tablas = res.tablas ?? [];
          this.loading.set(false);
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.loading.set(false);
        },
      });
  }

  /** Registros filtrados por texto de accion o usuario. */
  get visibleLogs(): LogAuditoria[] {
    if (!this.searchTerm.trim()) return this.logs;
    const term = this.searchTerm.toLowerCase();
    return this.logs.filter(
      (l) =>
        l.accion.toLowerCase().includes(term) ||
        (l.usuarioNombre && l.usuarioNombre.toLowerCase().includes(term))
    );
  }

  claseAccion(accion: string): string {
    if (accion.startsWith('DELETE')) return 'del';
    if (accion.startsWith('INSERT')) return 'ins';
    return 'upd';
  }
}
