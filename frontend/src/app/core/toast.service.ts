/**
 * core/toast.service.ts
 * Sistema de notificaciones emergentes (toast). Muestra mensajes
 * temporales de exito, error, info o advertencia en la esquina
 * inferior derecha, replicando el ToastProvider de la version React.
 */

import { Injectable, signal } from '@angular/core';

export type ToastTipo = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  mensaje: string;
  tipo: ToastTipo;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Toasts visibles actualmente. */
  readonly toasts = signal<Toast[]>([]);

  private contador = 0;

  /**
   * Muestra un toast con los parametros indicados.
   * @param mensaje Texto a mostrar.
   * @param tipo Tipo: 'success' | 'error' | 'info' | 'warning'.
   * @param duracion Duracion en milisegundos.
   */
  mostrar(mensaje: string, tipo: ToastTipo = 'info', duracion = 3000): void {
    const id = ++this.contador;
    this.toasts.update((lista) => [...lista, { id, mensaje, tipo }]);
    setTimeout(() => this.cerrar(id), duracion);
  }

  /** Elimina un toast por id. */
  cerrar(id: number): void {
    this.toasts.update((lista) => lista.filter((t) => t.id !== id));
  }
}
