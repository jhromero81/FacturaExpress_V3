/**
 * core/interceptors.ts
 * Interceptor HTTP funcional:
 *  - Adjunta la cabecera Authorization: Bearer <token> si existe una
 *    sesion guardada (ademas de la cookie httpOnly).
 *  - Ante un 401 (sesion expirada o invalida) limpia el estado local
 *    y redirige al login, excepto cuando la peticion es el propio
 *    intento de inicio de sesion.
 *  - Tras cada respuesta (o error) programa un ciclo de deteccion de
 *    cambios via ServicioRender; sin esto, los datos actualizados en
 *    los callbacks pueden quedar sin renderizar hasta que el usuario
 *    interactua con la pagina.
 */

import { HttpErrorResponse, HttpResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { ServicioRender } from './render.service';

const CLAVE_TOKEN = 'fx_token';
const CLAVE_USUARIO = 'fx_usuario';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const render = inject(ServicioRender);
  const token = sessionStorage.getItem(CLAVE_TOKEN);

  let peticion = req.clone({ withCredentials: true });
  if (token) {
    peticion = peticion.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

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
        sessionStorage.removeItem(CLAVE_TOKEN);
        sessionStorage.removeItem(CLAVE_USUARIO);
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
