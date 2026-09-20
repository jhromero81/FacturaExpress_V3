# Guía de ejecución de pruebas — FacturaExpress

Complemento práctico de [`plans/estrategia-pruebas.md`](../../plans/estrategia-pruebas.md).
Pasos para ejecutar cada nivel de la pirámide, resultados esperados y solución de problemas frecuentes.

---

## 0. Requisitos previos

| Requisito               | Detalle                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| Node.js 18 o superior   | El backend usa `node --test` y `fetch` globales                             |
| Dependencias instaladas | Desde la raíz: `npm install` y `npm run install:all`                        |
| MySQL 8                 | **Solo** para las pruebas de aceptación (los niveles 1 y 2 no lo necesitan) |
| Docker (opcional)       | Alternativa a MySQL local: `docker compose up -d db`                        |

Los comandos se ejecutan desde la **raíz del repositorio**, salvo donde se indique otro directorio.

---

## 1. Unitarias e integración del backend (sin MySQL)

```bash
npm test --prefix backend                   # 65 casos: 47 unitarios + 18 de integración
npm run test:unit --prefix backend          # solo unitarios (47)
npm run test:integracion --prefix backend   # solo integración (18)
```

**Salida esperada (final del reporte):**

```
ℹ tests 65
ℹ pass 65
ℹ fail 0
```

Cada línea `✔` es un caso aprobado; las líneas `✖` muestran el `AssertionError` y la línea exacta del fallo.

Las suites del nivel 1 viven en `backend/test/*.test.js` (validación de entrada, utilidades de negocio, CUNE, JWT, middleware de validación y matriz de autorización) y la de integración en `backend/test/integracion/facturas.api.test.js`, que levanta Express en un puerto efímero con un doble de MySQL que registra la traza transaccional.

---

## 2. Unitarias del frontend (vitest + jsdom)

```bash
npm test --prefix frontend -- --watch=false
```

**Salida esperada:**

```
✓ src/app/core/validators.spec.ts (10 tests)
✓ src/app/core/formatters.spec.ts (14 tests)
✓ src/app/app.spec.ts (1 test)
Test Files  3 passed (3)
Tests       25 passed (25)
```

El flag `--watch=false` evita que la suite quede escuchando cambios.

---

## 3. Funcionales y de aceptación (requieren MySQL y la API)

### 3.1 Preparar la base de datos

```bash
npm run db:setup --prefix backend    # crea BD, tablas y datos de ejemplo
npm run db:migrate --prefix backend  # alternativa idempotente
npm run db:seed --prefix backend     # datos semilla
```

Usuarios del seed: `900.123.456-7` (admin, `admin123`), `80.987.654-3` (vendedor, `vendedor123`) y `70.555.444-2` (contador, `contador123`).

### 3.2 Levantar la API (terminal 1)

```bash
npm start --prefix backend
```

Debe indicar `[server] FacturaExpress API escuchando en http://localhost:4000`; verifique `http://localhost:4000/api/health`.

### 3.3 Ejecutar la suite de aceptación (terminal 2)

```bash
npm run test:e2e
```

**Salida esperada:**

```
=== Pruebas de aceptacion FacturaExpress ===
API: http://127.0.0.1:4000
[  OK  ] CA-01 ... CA-16   (16 casos)
Casos ejecutados : 16    Exitosos : 16    Fallidos : 0    Resultado : ACEPTADO
```

Los 16 casos recorren: salud del servicio, login con cookie `httpOnly`, alta de cliente y producto, **emisión de factura con descuento del 10 %**, descuento de inventario, consulta del detalle, descargas PDF/XML/CSV, cambio de estado a `enviada`, rechazo de eliminación de una factura enviada, reportes, control de acceso por rol y revocación del token en el logout.

El script devuelve **código de salida 0** si todo pasa y **1** si algo falla, por lo que puede usarse en integración continua. Variables opcionales: `E2E_BASE_URL`, `E2E_NIT`, `E2E_PASSWORD`.

---

## 4. Atajos desde la raíz

```bash
npm test               # backend (65) + frontend (25)
npm run test:backend
npm run test:frontend
npm run test:e2e       # aceptación (requiere API + MySQL)
```

---

## 5. Pruebas manuales con Postman

1. Importe [`postman/collections/FacturaExpress-API-Express.postman_collection.json`](../../postman/collections/FacturaExpress-API-Express.postman_collection.json).
2. URL base: `http://127.0.0.1:4000`.
3. Ejecute la carpeta **1. Autenticación** para obtener el token (el login admite `X-Token-Response: true` para devolverlo en el cuerpo).
4. Recorra las carpetas 2 a 12 (dashboard, clientes, productos, facturas, ventas POS, reportes, configuración, usuarios, errores, auditoría y backup).

---

## 6. Evidencia de la ejecución

Guarde la salida de cada suite en la carpeta local de evidencias (no versionada):

```bash
npm test --prefix backend > plans/evidencia-backend.txt
npm test --prefix frontend -- --watch=false > plans/evidencia-frontend.txt
npm run test:e2e > plans/evidencia-e2e.txt
```

Las facturas generadas por el E2E quedan identificadas con su número `FAC-YYYYMM-XXXXX`, lo que permite adjuntarlas como evidencia documental.

---

## 7. Problemas frecuentes

| Síntoma                                                                     | Causa                                                            | Solución                                                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fetch failed` en CA-01                                                     | La API no está en ejecución                                      | `npm start --prefix backend`                                                            |
| CA-02 falla por credenciales                                                | Base de datos sin semilla                                        | `npm run db:seed --prefix backend`                                                      |
| CA-15 aparece como `OMITIDO`                                                | El usuario vendedor no existe                                    | `npm run db:seed --prefix backend`                                                      |
| `You installed esbuild for another platform` / `Cannot find native binding` | `node_modules` proviene de otro sistema operativo (Linux/Docker) | Ejecutar `npm ci` en este equipo                                                        |
| `EADDRINUSE :::4000`                                                        | Otra API ocupa el puerto                                         | Detener el proceso (Ctrl+C) o usar `PORT=4100` con `E2E_BASE_URL=http://127.0.0.1:4100` |
| Las pruebas del frontend se quedan escuchando                               | `ng test` en modo observador                                     | Añadir `-- --watch=false`                                                               |

---

## 8. Resumen de una línea

```bash
npm test --prefix backend && npm test --prefix frontend -- --watch=false   # niveles 1 y 2
npm start --prefix backend                                                # terminal aparte
npm run test:e2e                                                          # nivel 3
```
