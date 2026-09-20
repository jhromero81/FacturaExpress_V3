# FacturaExpress — Frontend

Aplicación web **Angular 22** (componentes standalone, sin NgModules) para el
sistema de facturación electrónica FacturaExpress. Consume la API REST del
backend (`http://localhost:4000`) a través del proxy `/api` del dev-server.

> **Monorepositorio:** normalmente no necesita ejecutar nada aquí directamente.
> Desde la raíz del repositorio use `npm run dev` para levantar backend y
> frontend juntos (ver README raíz, sección 7).

## Requisitos

- Node.js ≥ 20 y npm ≥ 10
- Backend en marcha en `http://localhost:4000` (o Docker Compose)

## Instalación

```bash
npm install
```

> El `package.json` declara la sección `allowScripts` con los binarios nativos
> de esbuild/rollup/lmdb/etc. para **Windows y Linux**, requerida por la
> política de scripts de instalación de npm 11.

## Servidor de desarrollo

```bash
npm start        # equivalente a: ng serve --proxy-config proxy.conf.json
```

Abra `http://localhost:4200`. El proxy redirige `/api` → `http://localhost:4000`
(`proxy.conf.json`), por lo que no hay CORS en desarrollo. La aplicación se
recarga automáticamente al editar los archivos fuente.

## Build de producción

```bash
npm run build
# → dist/facturaexpress-frontend/browser (estático listo para publicar)
```

Para publicarlo, sirva esa carpeta con cualquier servidor estático que
redirija `/api` hacia la API en el mismo origen (en Docker lo hace nginx,
ver `nginx.conf`).

## Pruebas unitarias

```bash
npm test         # Vitest con navegador jsdom
```

## Estructura relevante

| Ruta                          | Contenido                                        |
| ----------------------------- | ------------------------------------------------ |
| `src/app/core/`               | `api.service`, `auth.service`, guards, interceptors, formatters, modelos |
| `src/app/features/layout/`    | Shell (sidebar + topbar + router-outlet)          |
| `src/app/features/…`          | Módulos funcionales standalone con carga diferida (login, dashboard, ventas, facturas, clientes, productos, reportes, configuración y administración) |
| `src/environments/`           | Configuración por entorno                         |
| `proxy.conf.json`             | Proxy `/api` → backend en desarrollo              |

Más detalles de arquitectura, rutas y sistema de diseño en el
[README raíz](../README.md), sección 5.
