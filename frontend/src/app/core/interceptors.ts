/**
 * core/interceptors.ts
 * Interceptor HTTP funcional:
 *  - Envia todas las peticiones con credenciales (cookie httpOnly de
 *    sesion); no replica el token en JS.
 *  - Ante un 401 (sesion expirada o invalida) limpia la sesion local
 *    (señal de AuthService + sessionStorage) y redirige al login,
 *    excepto cuando la peticion es el propio intento de inicio de sesion.
 *  - Tras cada respuesta (o error) programa un ciclo de deteccion de
 *    cambios via ServicioRender; sin esto, los datos actualizados en
 *    los callbacks pueden quedar sin renderizar hasta que el usuario
 *    interactua con la pagina.
 */

import { HttpErrorResponse, HttpResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { ServicioRender } from './render.service';
import { AuthService } from './auth.service';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const render = inject(ServicioRender);
  const auth = inject(AuthService);

  const peticion = req.clone({ withCredentials: true });

  return next(peticion).pipe(
    tap({
      next: (evento) => {
        if (evento instanceof HttpResponse) {
          render.notificar();
        }
      },
      error: () => render.notificar(),
    }),
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !peticion.url.includes('/auth/login')
      ) {
        auth.limpiarSesion();
      }
      return throwError(() => error);
    })
  );
};