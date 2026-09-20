# Guía de ejecución de pruebas — FacturaExpress

Complemento práctico de [`docs/Estrategia_Pruebas_FacturaExpress.md`](Estrategia_Pruebas_FacturaExpress.md).
Aquí está el paso a paso para ejecutar cada nivel de la pirámide de pruebas, con los resultados esperados y la solución de los problemas más comunes.

---

## 0. Requisitos previos

| Requisito               | Detalle                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| Node.js 18 o superior   | El backend usa el runner nativo `node --test` y `fetch` globals                   |
| Dependencias instaladas | Desde la raíz: `npm install` y `npm run install:all` (instala backend y frontend) |
| MySQL 8                 | **Solo** para las pruebas de aceptación (niveles 1 y 2 no lo necesitan)           |
| Docker (opcional)       | Alternativa a MySQL local: `docker compose up -d db`                              |

> Todos los comandos se ejecutan desde la **raíz del proyecto** (`/home/jhromeroc/Documentos/Proyectos/FacturaExpress-V3`), salvo donde se indique otro directorio.

### 0.1 Variables de entorno

| Variable                                                        | Uso                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`, `PORT`                                              | Entorno y puerto de la API (por defecto 4000)                                                        |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`       | Conexión a MySQL                                                                                     |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_ISSUER`, `JWT_AUDIENCE`    | Firma del token; en producción el secreto es obligatorio, de mínimo 32 caracteres y distinto del ejemplo |
| `CORS_ORIGIN`                                                   | Origen(es) permitidos; admite varios separados por coma                                              |
| `TRUST_PROXY`                                                   | Confía en `X-Forwarded-*` cuando la API va detrás de nginx                                           |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`      | Envío del correo de la factura                                                                       |
| `BACKUP_DIR`                                                    | **Nueva.** Directorio de respaldos; por defecto `<tmp>/facturaexpress_backups`                        |
| `SEED_ADMIN_PASSWORD`, `SEED_VENDEDOR_PASSWORD`, `SEED_CONTADOR_PASSWORD` | **Nuevas.** Contraseñas del seed; si no se definen, el seed genera aleatorias y las imprime una sola vez |
| `DB_RESTORE_USER`, `DB_RESTORE_PASSWORD`                        | **Ahora sí se usan.** Credenciales DDL solo para restaurar; si quedan vacías se reutilizan las de runtime |
| `E2E_BASE_URL`, `E2E_NIT`                                       | URL de la API y NIT del administrador para la suite de aceptación                                    |
| `E2E_PASSWORD`                                                  | **Obligatoria.** Contraseña del administrador para la suite de aceptación                            |
| `E2E_VENDEDOR_NIT`, `E2E_VENDEDOR_PASSWORD`                     | **Obligatoria** la contraseña del vendedor para el caso de control de acceso (CA‑15)                 |

> Ya **no existen** `SECURITY_CHECK_PORT`, `SECURITY_CHECK_NIT` ni `SECURITY_CHECK_PASSWORD`.

---

## 1. Pruebas unitarias e integración del backend (no requieren MySQL)

```bash
npm test --prefix backend                   # 100 casos: 74 unitarios + 26 de integración
npm run test:unit --prefix backend          # solo unitarios (74 casos)
npm run test:integracion --prefix backend   # solo integración (26 casos)
```

**Salida esperada (final del reporte):**

```
ℹ tests 100
ℹ pass 100
ℹ fail 0
```

Si aparece `fail 0`, los niveles 1 y 2 quedaron en verde. Cada línea `✔` es un caso aprobado y cada `✖` un caso fallido (con su `AssertionError` y la línea exacta del fallo).

Las suites del nivel 1 viven en `backend/test/*.test.js` (`authorize`, `backup`, `cune`, `helpers`, `jwt`, `login`, `validate`, `validators`) y la de integración en `backend/test/integracion/facturas.api.test.js`, que levanta Express en un puerto efímero con un doble de MySQL que registra la traza transaccional.

---

## 2. Pruebas unitarias del frontend (vitest + jsdom)

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

> El flag `--watch=false` evita que la suite quede en modo interactivo escuchando cambios.

---

## 3. Pruebas funcionales y de aceptación (requieren MySQL y la API)

### 3.1 Preparar la base de datos (solo la primera vez)

```bash
npm run db:setup --prefix backend    # crea BD, tablas y datos de ejemplo
npm run db:migrate --prefix backend  # alternativa idempotente si la BD ya existe
npm run db:seed --prefix backend     # datos semilla (usuarios, clientes, productos)
```

El seed crea estos usuarios (ya **no** tienen contraseña fija):

| Usuario  | NIT            | Nombre             |
| -------- | -------------- | ------------------ |
| admin    | `900.123.456-7` | Jhon Henry Romero  |
| vendedor | `80.987.654-3` | Maria Fernanda Lopez |
| contador | `70.555.444-2` | Carlos Andres Ruiz |

Las contraseñas se definen con `SEED_ADMIN_PASSWORD`, `SEED_VENDEDOR_PASSWORD` y `SEED_CONTADOR_PASSWORD` (mínimo 8 caracteres, con minúscula, mayúscula y dígito). Si no se definen, el seed genera contraseñas aleatorias y las **muestra una sola vez** por consola; anótelas, porque no se vuelven a imprimir.

### 3.2 Levantar la API (terminal 1)

```bash
npm run dev --prefix backend     # con recarga automática (nodemon)
# o bien
npm start --prefix backend       # sin recarga
```

Debe mostrar `[server] FacturaExpress API escuchando en http://localhost:4000`. Verifique en el navegador: `http://localhost:4000/api/health`.

### 3.3 Ejecutar la suite de aceptación (terminal 2)

```bash
E2E_PASSWORD=<clave del admin> E2E_VENDEDOR_PASSWORD=<clave del vendedor> npm run test:e2e
```

**Salida esperada:**

```
=== Pruebas de aceptacion FacturaExpress ===
API: http://127.0.0.1:4000
[  OK  ] CA-01 La API responde el endpoint de salud
...
[  OK  ] CA-21 El logout revoca el token (401 en la siguiente peticion)
Casos ejecutados : 21    Exitosos : 21    Fallidos : 0    Resultado : ACEPTADO
```

El script devuelve **código de salida 0** si todos los casos pasan y **1** si alguno falla. Si faltan `E2E_PASSWORD` o `E2E_VENDEDOR_PASSWORD`, falla de inmediato con un mensaje claro, porque el seed ya no crea contraseñas por defecto.

Variables: `E2E_BASE_URL` (URL de la API), `E2E_NIT` (NIT del administrador) y `E2E_VENDEDOR_NIT` (NIT del vendedor). Son **obligatorias** `E2E_PASSWORD` y `E2E_VENDEDOR_PASSWORD`.

---

## 4. Atajos desde la raíz del proyecto

```bash
npm test              # backend (100) + frontend (37)
npm run test:backend  # solo backend
npm run test:frontend # solo frontend
npm run test:e2e      # aceptación E2E (requiere API + MySQL activos)
```

---

## 5. Pruebas manuales y exploratorias con Postman

1. Importe [`postman/collections/FacturaExpress-API-Express.postman_collection.json`](../postman/collections/FacturaExpress-API-Express.postman_collection.json) (47 peticiones en 12 carpetas).
2. Use `http://127.0.0.1:4000` como URL base.
3. Ejecute la carpeta **Autenticación** para obtener el token (el login admite la cabecera `X-Token-Response: true` para devolverlo en el cuerpo).
4. Recorra las carpetas restantes (dashboard, clientes, productos, facturas, ventas POS, reportes, configuración, usuarios, errores, auditoría, backup).

> La colección es de apoyo manual: **no se ejecuta Newman en el pipeline de CI**.

---

## 6. Cómo dejar evidencia de la ejecución

Registre la salida de cada suite en un archivo temporal o directamente en la consola:

```bash
# Backend + integración
npm test --prefix backend 2>&1 | tee /tmp/salida-backend.txt

# Frontend
npm test --prefix frontend -- --watch=false 2>&1 | tee /tmp/salida-frontend.txt

# Aceptación (con la API arriba)
npm run test:e2e 2>&1 | tee /tmp/salida-e2e.txt
```

Las respuestas del E2E (factura emitida, XML, PDF, CSV) provienen de una factura real identificada por su número `FAC-YYYYMM-XXXXX`, lo que permite adjuntarla como evidencia documental.

---

## 7. Solución de problemas frecuentes

| Síntoma                                                                     | Causa                                                                           | Solución                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch failed` en CA-01                                                     | La API no está en ejecución                                                     | Levantar con `npm run dev --prefix backend` o `npm start --prefix backend`                                                                                                   |
| `[e2e] Faltan E2E_PASSWORD y/o E2E_VENDEDOR_PASSWORD`                       | El seed ya no crea contraseñas por defecto                                      | Definir ambas variables (las del seed) al ejecutar `npm run test:e2e`                                                                                                        |
| CA-02 falla con "credenciales invalidas"                                    | Base de datos sin datos semilla o contraseña distinta                           | `npm run db:seed --prefix backend` con `SEED_*_PASSWORD` o usar la contraseña que el seed imprimió                                                                          |
| CA-15 aparece como `OMITIDO`                                                | El usuario vendedor no existe en la base                                        | `npm run db:seed --prefix backend`                                                                                                                                          |
| No se conoce la contraseña del seed                                         | El seed solo la imprime una vez, al crearla                                     | Volver a sembrar definiendo `SEED_ADMIN_PASSWORD`, `SEED_VENDEDOR_PASSWORD` y `SEED_CONTADOR_PASSWORD`                                                                       |
| `You installed esbuild for another platform` o `Cannot find native binding` | El `node_modules` del frontend provino de otro sistema operativo (Linux/Docker) | Ejecutar `npm ci` en este equipo; como alternativa se restauraron los binarios `@esbuild/win32-x64` y `@rolldown/binding-win32-x64-msvc` de forma aditiva en `node_modules` |
| `EADDRINUSE: address already in use :::4000`                                | Hay otra API en el puerto 4000                                                  | Detener el proceso anterior (Ctrl+C) o arrancar con otro puerto y apuntar el E2E: `PORT=4100` y `E2E_BASE_URL=http://127.0.0.1:4100`                                        |
| El comando `node -e` de verificación de BD no termina                       | El pool de MySQL queda abierto (es esperado)                                    | Use los scripts `npm run ...`, que cierran el proceso al terminar; para salir manualmente, Ctrl+C                                                                           |
| Las pruebas del frontend quedan escuchando cambios                          | `ng test` en modo observador                                                    | Añadir `-- --watch=false`                                                                                                                                                   |

---

## 8. Resumen de una línea

```bash
npm test --prefix backend && npm test --prefix frontend -- --watch=false   # niveles 1 y 2
npm run dev --prefix backend                                              # terminal aparte
E2E_PASSWORD=... E2E_VENDEDOR_PASSWORD=... npm run test:e2e               # nivel 3
```
