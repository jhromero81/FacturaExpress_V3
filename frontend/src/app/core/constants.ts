/**
 * core/constants.ts
 * Constantes globales de la aplicacion: datos de empresa, parametros
 * fiscales, rutas y perfiles de usuario.
 */

/** Datos de la empresa por defecto */
export const EMPRESA_DEFAULT = {
  nit: '900.123.456-7',
  razonSocial: 'Industrias Metalurgicas S.A.S',
  emailFacturacion: 'facturacion@industriasm.com',
  telefono: '+57 300 123 4567',
};

/** Tasa de IVA general en Colombia (19%). Cada producto puede definir otra. */
export const IVA_RATE = 0.19;

/** Rutas de la aplicacion */
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  VENTAS: '/ventas',
  FACTURACION: '/facturas',
  CLIENTES: '/clientes',
  PRODUCTOS: '/productos',
  REPORTES: '/reportes',
  USUARIOS: '/usuarios',
  ERRORES: '/errores',
  AUDITORIA: '/auditoria',
  BACKUP: '/backup',
  CONFIGURACION: '/configuracion',
};

/** Tipos de error conocidos por el modulo de errores */
export const ERROR_TIPOS = ['firma', 'dian', 'bd', 'correo', 'otro'];

/** Perfiles de usuario del sistema */
export const PERFILES_USUARIO: Record<string, { nombre: string; rol: string }> = {
  ADMIN: { nombre: 'Administrador', rol: 'admin' },
  VENDEDOR: { nombre: 'Vendedor', rol: 'vendedor' },
  CONTADOR: { nombre: 'Contador/Reportes', rol: 'contador' },
};

/** Meta mensual de ventas en COP */
export const META_VENTAS_MENSUAL = 6400000;
