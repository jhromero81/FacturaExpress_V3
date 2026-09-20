/**
 * core/interceptors.ts
 * Interceptor HTTP funcional:
 *  - Envia todas las peticiones con credenciales (cookie httpOnly de
 *    sesion); no replica el token en JS.
 *  - Ante un 401 (sesion expirada, revocada o cuenta inactiva) limpia la
 *    sesion local y redirige al login, excepto cuando la peticion es el
 *    propio intento de inicio de sesion.
 */

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // withCredentials garantiza que la cookie httpOnly viaje en cada
  // peticion, incluso si el componente olvida solicitarlo.
  const peticion = req.clone({ withCredentials: true });

  return next(peticion).pipe(
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
