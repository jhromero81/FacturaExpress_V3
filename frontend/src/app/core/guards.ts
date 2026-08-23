/**
 * core/guards.ts
 * Proteccion de rutas:
 *  - authGuard: exige sesion activa.
 *  - adminGuard: exige ademas rol administrador.
 */

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estaAutenticado()) return true;
  return router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.estaAutenticado()) return router.createUrlTree(['/login']);
  if (auth.esAdmin()) return true;
  return router.createUrlTree(['/dashboard']);
};
