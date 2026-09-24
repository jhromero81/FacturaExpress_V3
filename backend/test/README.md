# Guía de ejecución de pruebas — FacturaExpress

Complemento práctico de [`docs/Estrategia_Pruebas_FacturaExpress.md`](../../docs/Estrategia_Pruebas_FacturaExpress.md).
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
npm test --prefix backend                   # 100 casos: 74 unitarios + 26 de integración
npm run test:unit --prefix backend          # solo unitarios (74)
npm run test:integracion --prefix backend   # solo integración (26)
```

**Salida esperada (final del reporte):**

```
ℹ tests 100
ℹ pass 100
ℹ fail 0
```

Cada línea `✔` es un caso aprobado; las líneas `✖` muestran el `AssertionError` y la línea exacta del fallo.

Las suites del nivel 1 viven en `backend/test/*.test.js` (`authorize`, `backup`, `cune`, `helpers`, `jwt`, `login`, `validate`, `validators`) y la de integración en `backend/test/integracion/facturas.api.test.js`, que levanta Express en un puerto efímero con un doble de MySQL que registra la traza transaccional.

Suites destacadas:

- `login.test.js` (10 casos): el login no expone el token en el cuerpo, lo entrega con `X-Token-Response`, reinicia el contador de intentos, bloquea temporalmente la cuenta (423) incluso con la contraseña correcta, calcula el bloqueo dentro de SQL (evita el desfase de zona horaria), acumula intentos fallidos y no enumera usuarios, y responde 401 (no 500) ante una contraseña no textual (por ejemplo un número, que haría lanzar una excepción a `bcrypt.compare`).
- `backup.test.js` (8 casos): determinismo del checksum SHA‑256, rechazo de *path traversal*, rechazo de archivos que no son respaldos, rechazo de cabecera alterada, rechazo de huella que no coincide y 404 si el respaldo no existe.

---

## 2. Unitarias del frontend (vitest + jsdom)

```bash
npm test --prefix frontend -- --watch=false
```

**Salida esperada:**

```
✓ src/app/core/validators.spec.ts (13 tests)
✓ src/app/core/formatters.spec.ts (23 tests)
✓ src/app/app.spec.ts (1 test)
Test Files  3 passed (3)
Tests       37 passed (37)
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

El seed crea los usuarios `900.123.456-7` (admin, Jhon Henry Romero), `80.987.654-3` (vendedor, Maria Fernanda Lopez) y `70.555.444-2` (contador, Carlos Andres Ruiz). Ya **no** tienen contraseña fija: se definen con `SEED_ADMIN_PASSWORD`, `SEED_VENDEDOR_PASSWORD` y `SEED_CONTADOR_PASSWORD`, o el seed genera contraseñas aleatorias y las muestra **una sola vez** por consola.

### 3.2 Levantar la API (terminal 1)

```bash
npm run dev --prefix backend     # con recarga automática (nodemon)
# o bien
npm start --prefix backend       # sin recarga
```

Debe indicar `[server] FacturaExpress API escuchando en http://localhost:4000`; verifique `http://localhost:4000/api/health`.

### 3.3 Ejecutar la suite de aceptación (terminal 2)

```bash
E2E_PASSWORD=<clave del admin> E2E_VENDEDOR_PASSWORD=<clave del vendedor> npm run test:e2e
```

**Salida esperada:**

```
=== Pruebas de aceptacion FacturaExpress ===
API: http://127.0.0.1:4000
[  OK  ] CA-01 ... CA-21   (21 casos)
Casos ejecutados : 21    Exitosos : 21    Fallidos : 0    Resultado : ACEPTADO
```

Los 21 casos recorren: salud del servicio, login con cookie `httpOnly`, alta de cliente y producto, **emisión de factura con descuento del 10 %**, descuento de inventario, consulta del detalle, descargas PDF/XML/CSV, cambio de estado a `enviada`, rechazo de eliminación de una factura enviada, reportes, control de acceso por rol, regresiones del ciclo DIAN (estado `rechazada` y regreso a `pendiente`, acumulación de intentos, numeración tras eliminar), IVA por tarifa del producto, coherencia detalle/cabecera y revocación del token en el logout.

El script devuelve **código de salida 0** si todo pasa y **1** si algo falla, por lo que puede usarse en integración continua. Si faltan `E2E_PASSWORD` o `E2E_VENDEDOR_PASSWORD`, falla de inmediato con un mensaje claro. Variables opcionales: `E2E_BASE_URL`, `E2E_NIT`, `E2E_VENDEDOR_NIT`.

---

## 4. Atajos desde la raíz

```bash
npm test               # backend (100) + frontend (37)
npm run test:backend
npm run test:frontend
npm run test:e2e       # aceptación (requiere API + MySQL)
```

---

## 5. Pruebas manuales con Postman

1. Importe [`postman/collections/FacturaExpress-API-Express.postman_collection.json`](../../postman/collections/FacturaExpress-API-Express.postman_collection.json) (47 peticiones en 12 carpetas).
2. URL base: `http://127.0.0.1:4000`.
3. Ejecute la carpeta **Autenticación** para obtener el token (el login admite `X-Token-Response: true` para devolverlo en el cuerpo).
4. Recorra las carpetas restantes (dashboard, clientes, productos, facturas, ventas POS, reportes, configuración, usuarios, errores, auditoría y backup).

> La colección es de apoyo manual: **no se ejecuta Newman en el pipeline de CI**.

---

## 6. Evidencia de la ejecución

Guarde la salida de cada suite en un archivo temporal (o cópiela desde la consola):

```bash
npm test --prefix backend 2>&1 | tee /tmp/salida-backend.txt
npm test --prefix frontend -- --watch=false 2>&1 | tee /tmp/salida-frontend.txt
npm run test:e2e 2>&1 | tee /tmp/salida-e2e.txt
```

Las facturas generadas por el E2E quedan identificadas con su número `FAC-YYYYMM-XXXXX`, lo que permite adjuntarlas como evidencia documental.

---

## 7. Problemas frecuentes

| Síntoma                                                                     | Causa                                                            | Solución                                                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fetch failed` en CA-01                                                     | La API no está en ejecución                                      | `npm run dev --prefix backend` o `npm start --prefix backend`                            |
| `[e2e] Faltan E2E_PASSWORD y/o E2E_VENDEDOR_PASSWORD`                       | El seed ya no crea contraseñas por defecto                       | Definir ambas variables con las claves del seed antes de ejecutar `npm run test:e2e`     |
| CA-02 falla por credenciales                                                | Base de datos sin semilla o contraseña distinta                  | `npm run db:seed --prefix backend` con `SEED_*_PASSWORD`                                 |
| CA-15 aparece como `OMITIDO`                                                | El usuario vendedor no existe                                    | `npm run db:seed --prefix backend`                                                      |
| No se conoce la contraseña del seed                                         | El seed solo la imprime una vez                                  | Volver a sembrar definiendo `SEED_*_PASSWORD`                                            |
| `You installed esbuild for another platform` / `Cannot find native binding` | `node_modules` proviene de otro sistema operativo (Linux/Docker) | Ejecutar `npm ci` en este equipo                                                        |
| `EADDRINUSE :::4000`                                                        | Otra API ocupa el puerto                                         | Detener el proceso (Ctrl+C) o usar `PORT=4100` con `E2E_BASE_URL=http://127.0.0.1:4100` |
| Las pruebas del frontend se quedan escuchando                               | `ng test` en modo observador                                     | Añadir `-- --watch=false`                                                               |

---

## 8. Resumen de una línea

```bash
npm test --prefix backend && npm test --prefix frontend -- --watch=false   # niveles 1 y 2
npm run dev --prefix backend                                              # terminal aparte
E2E_PASSWORD=... E2E_VENDEDOR_PASSWORD=... npm run test:e2e               # nivel 3
```
