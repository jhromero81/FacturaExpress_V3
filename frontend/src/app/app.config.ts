/**
 * app.config.ts
 * Configuracion global de la aplicacion (providers de raiz):
 *  - Deteccion de cambios basada en Zone.js.
 *  - Router con carga diferida por modulo (ver app.routes.ts).
 *  - HttpClient con interceptor de sesion y backend XHR; las respuestas
 *    se entregan dentro de la zona angular para mantener el renderizado
 *    reactivo (complementado por core/render.service.ts).
 */

import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { tokenInterceptor } from './core/interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection(),
    provideRouter(routes),
    // withXhr(): usa XMLHttpRequest en lugar de fetch; las tareas XHR se
    // registran en la zona angular, lo que mantiene estables las senales
    // de estado (NgZone.isStable) durante las peticiones.
    provideHttpClient(withInterceptors([tokenInterceptor]), withXhr()),
  ],
};
