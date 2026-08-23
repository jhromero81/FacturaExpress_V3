/**
 * environment.development.ts
 * Configuracion de desarrollo (ng serve): el dev-server proxifica
 * /api hacia el backend local (puerto 4000) via proxy.conf.json.
 */
export const environment = {
  production: false,
  apiUrl: '/api',
};
