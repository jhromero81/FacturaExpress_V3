/**
 * core/render.service.ts
 *
 * En Angular 22 el HttpClient entrega las respuestas fuera del ciclo
 * automatico de deteccion de cambios (backend fetch/XHR zoneless-hibrido),
 * por lo que los campos simples actualizados en los callbacks HTTP pueden
 * quedar sin renderizar hasta que el usuario interactua.
 *
 * Este servicio guarda el ChangeDetectorRef del componente enrutado activo
 * (registrado por LayoutComponent via el evento `activate` del router-outlet)
 * y, tras cada respuesta HTTP, marca esa vista para verificacion y ejecuta
 * un ciclo de deteccion de cambios.
 */

import { ApplicationRef, ChangeDetectorRef, Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ServicioRender {
  private readonly appRef = inject(ApplicationRef);
  private cdrActivo: ChangeDetectorRef | null = null;

  /** Registra la vista del componente enrutado activo. */
  establecerActivo(cdr: ChangeDetectorRef | null): void {
    this.cdrActivo = cdr;
  }

  /**
   * Programa (diferido) un ciclo de deteccion de cambios tras una
   * respuesta HTTP, marcando antes la vista activa con markForCheck().
   */
  notificar(): void {
    queueMicrotask(() => {
      try {
        this.cdrActivo?.markForCheck();
        this.appRef.tick();
      } catch {
        /* ciclo ya en curso */
      }
    });
  }
}
