/**
 * app.routes.ts
 * Definicion de rutas de la aplicacion. El layout protege todas las
 * vistas con el guard de autenticacion; las rutas administrativas
 * exigen ademas el rol admin.
 */

import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards';
import { LayoutComponent } from './features/layout/layout.component';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'ventas',
        loadComponent: () =>
          import('./features/ventas/nueva-venta.component').then((m) => m.NuevaVentaComponent),
      },
      {
        path: 'facturas',
        loadComponent: () => import('./features/facturas/facturas.component').then((m) => m.FacturasComponent),
      },
      {
        path: 'clientes',
        loadComponent: () => import('./features/clientes/clientes.component').then((m) => m.ClientesComponent),
      },
      {
        path: 'productos',
        loadComponent: () => import('./features/productos/productos.component').then((m) => m.ProductosComponent),
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/configuracion/configuracion.component').then((m) => m.ConfiguracionComponent),
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/usuarios.component').then((m) => m.UsuariosComponent),
      },
      {
        path: 'errores',
        loadComponent: () => import('./features/admin/errores.component').then((m) => m.ErroresComponent),
      },
      {
        path: 'auditoria',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/auditoria.component').then((m) => m.AuditoriaComponent),
      },
      {
        path: 'backup',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/backup.component').then((m) => m.BackupComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
