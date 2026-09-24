/**
 * features/admin/backup.component.ts (solo admin)
 * Gestion de respaldos SQL de la base de datos: crear, descargar,
 * restaurar y eliminar. Consume /api/backup.
 */

import { Component, inject, signal } from '@angular/core';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { formatDate } from '../../core/formatters';

interface Respaldo {
  archivo: string;
  tamano: number;
  fecha: string;
}

/** Formatea un tamano en bytes a B/KB/MB. */
function formatSize(bytes: number | null | undefined): string {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

@Component({
  selector: 'app-backup',
  standalone: true,
  templateUrl: './backup.component.html',
  styleUrls: ['./backup.component.css'],
})
export class BackupComponent {

  private api = inject(ApiService);
  private toast = inject(ToastService);

  backups: Respaldo[] = [];
  loading = signal(true);
  isWorking = signal(false);

  constructor() {
    this.loadBackups();
  }

  /** Carga la lista de respaldos disponibles en el servidor. */
  loadBackups(): void {
    this.api.get<{ success: boolean; backups: Respaldo[] }>('/backup').subscribe({
      next: (res) => {
        this.backups = res.backups ?? [];
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading.set(false);
      },
    });
  }

  /** Crea un nuevo respaldo completo de la base de datos. */
  handleCrear(): void {
    this.isWorking.set(true);
    this.api.post<{ success: boolean; backup: Respaldo }>('/backup', {}).subscribe({
      next: (res) => {
        this.toast.mostrar(`Respaldo creado: ${res.backup.archivo}`, 'success');
        this.loadBackups();
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      complete: () => this.isWorking.set(false),
    });
  }

  tamano(bytes: number): string {
    return formatSize(bytes);
  }

  fecha(valor: string): string {
    return formatDate(valor);
  }

  /** Descarga el archivo .sql del respaldo. */
  async handleDescargar(backup: Respaldo): Promise<void> {
    try {
      await this.api.descargar(`/backup/${encodeURIComponent(backup.archivo)}/download`);
      this.toast.mostrar(`Respaldo descargado: ${backup.archivo}`, 'success');
    } catch (err) {
      // Se muestra el motivo real (401, 404, red) en lugar de un texto fijo.
      this.toast.mostrar(mensajeError(err), 'error');
    }
  }

  /** Restaura la base de datos desde un respaldo (confirmado). */
  handleRestaurar(backup: Respaldo): void {
    if (
      !window.confirm(
        `Restaurara la base de datos completa desde "${backup.archivo}".\nLos datos actuales seran reemplazados. Continuar?`
      )
    ) {
      return;
    }
    this.isWorking.set(true);
    this.api.post<{ success: boolean; message: string }>('/backup/restaurar', { archivo: backup.archivo }).subscribe({
      next: (res) => {
        this.toast.mostrar(res.message, 'success');
        this.loadBackups();
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      complete: () => this.isWorking.set(false),
    });
  }

  /** Elimina un respaldo del servidor (confirmado). */
  handleEliminar(backup: Respaldo): void {
    if (!window.confirm(`Desea eliminar el respaldo "${backup.archivo}"?`)) return;
    this.api.delete<{ success: boolean; message: string }>(`/backup/${encodeURIComponent(backup.archivo)}`).subscribe({
      next: (res) => {
        this.toast.mostrar(res.message, 'success');
        this.backups = this.backups.filter((b) => b.archivo !== backup.archivo);
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }
}
