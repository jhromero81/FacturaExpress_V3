/**
 * app.ts
 * Componente raiz. Monta el router y registra la vista activa en el
 * ServicioRender; toda la interfaz vive en las rutas (login o layout
 * autenticado).
 */

import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServicioRender } from './core/render.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet (activate)="componenteActivado($event)" />',
})
export class App {
  private readonly render = inject(ServicioRender);

  componenteActivado(instancia: { cdr?: ChangeDetectorRef } | null): void {
    this.render.establecerActivo(instancia?.cdr ?? null);
  }
}
