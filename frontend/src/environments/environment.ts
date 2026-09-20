/**
 * environment.ts
 * Configuracion de produccion: la API se consume bajo el mismo origen
 * (el servidor estatico que publica dist/ proxifica /api al backend).
 */
export const environment = {
  production: true,
  apiUrl: '/api',
};
