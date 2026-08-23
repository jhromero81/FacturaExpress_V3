/**
 * core/constants.ts
 * Constantes globales de la aplicacion: version, datos de empresa,
 * parametros fiscales, rutas y perfiles de usuario.
 */

/** Version de la aplicacion */
export const APP_VERSION = '2.1.0';

/** Datos de la empresa por defecto */
export const EMPRESA_DEFAULT = {
  nit: '900.123.456-7',
  razonSocial: 'Industrias Metalurgicas S.A.S',
  emailFacturacion: 'facturacion@industriasm.com',
  telefono: '+57 300 123 4567',
};

/** Tasa de IVA en Colombia (19%) */
export const IVA_RATE = 0.19;

/** Prefijo para claves en almacenamiento local */
export const STORAGE_PREFIX = 'facturaexpress_';

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

/** Estados posibles de una factura ante la DIAN */
export const FACTURA_ESTADOS = {
  PENDIENTE: 'pendiente',
  ENVIADA: 'enviada',
  RECHAZADA: 'rechazada',
} as const;

/** Catalogo de colores para los estados de factura */
export const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#f39c12',
  enviada: '#27ae60',
  rechazada: '#e74c3c',
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
