/**
 * app.ts
 * Componente raiz. Monta el router; toda la interfaz vive en las rutas
 * (login o layout autenticado). La deteccion de cambios la gestiona
 * Zone.js (ver app.config.ts), por lo que no hace falta ningun puente
 * manual entre el ciclo de vida de los componentes y el renderizado.
 */

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {}
