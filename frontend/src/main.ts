/**
 * main.ts
 * Punto de entrada: arranca el componente raiz (App) con la
 * configuracion global definida en app/app.config.ts.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
