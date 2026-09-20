# Estrategia de pruebas — FacturaExpress V3

**Proyecto:** FacturaExpress — solución web de gestión y procesamiento de facturación electrónica e inventarios (API REST + SPA Angular)
**Evidencia asociada:** GA7-220501096-AA5-EV03 (Diseño y desarrollo de servicios web)
**Autor:** Jhon Henry Romero
**Última ejecución:** 2026-09-20 — Backend 65/65 · Frontend 25/25 · Aceptación 16/16

> Este documento se ubica en `plans/` porque el repositorio excluye `docs/` por política (`.gitignore`), reservándolo para evidencias locales.
> Guía operativa: [`backend/test/README.md`](../backend/test/README.md).

---

## 1. Objetivo y alcance

Definir el aseguramiento de calidad de FacturaExpress mediante la **pirámide de pruebas de Mike Cohn**, concentrando el esfuerzo en la base (reglas de negocio financieras, rápidas y baratas) y reservando la cúspide para los flujos extremo a extremo.

| Componente            | Stack                                     | Objeto de prueba                                                |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| API REST              | Node.js + Express 5 + MySQL 8 (`mysql2`)  | Reglas de negocio, validación, autorización, transacciones, DAO |
| SPA Web               | Angular 22 + TypeScript (vitest + jsdom)  | Validación de formularios, formateo y cálculo en el cliente     |
| Documento electrónico | PDFKit, generador XML/CSV, CUNE (SHA‑256) | Integridad del documento y del código único DIAN                |
| Infraestructura       | Docker Compose (MySQL + API + nginx)      | Configuración de entornos y despliegue                          |

**Fuera de alcance:** pruebas de carga masiva, penetración formal, certificación real ante la DIAN (el envío se simula), accesibilidad WCAG completa y retenciones de impuestos (ReteFuente/ReteIVA), que no forman parte del modelo de datos actual; sí lo están el IVA del 19 % y el descuento porcentual.

---

## 2. La pirámide aplicada al proyecto

```
                    ▲  10%  Funcionales y de aceptación (E2E)
                   ███      Certifican la emisión de la factura
                  █████
                 ███████   20%  Integración
                █████████      HTTP → middleware → controlador → DAO (ACID)
               ███████████
              █████████████  70%  Unitarias
             ███████████████     Reglas financieras y estructuras de datos
```

| Nivel              | Propósito                                                                                                                                  | Cobertura objetivo | Herramienta                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------- |
| **1. Unitarias**   | Subtotal, descuento, IVA del 19 %, CUNE, numeración, validación de entrada (identificación, NIT, esquemas JSON) y utilidades puras         | **70 %**           | `node:test` (backend) · `vitest` (frontend) |
| **2. Integración** | Capa DAO/controladores contra la base relacional (transacciones ACID al insertar facturas y actualizar stock), contrato HTTP y middlewares | **20 %**           | `node:test` + doble de MySQL · Postman      |
| **3. Aceptación**  | Flujo extremo a extremo: emisión de la factura, descargas PDF/XML/CSV, cambio de estado DIAN y reportes                                    | **10 %**           | Script de aceptación en Node (`fetch`)      |

**Distribución real:** 72 casos unitarios (68 %), 18 de integración (17 %) y 16 de aceptación (15 %) sobre **106 casos automatizados**.

---

## 3. Nivel 1 — Pruebas unitarias (70 %)

Ejecutan sin MySQL, sin red y en menos de un segundo: la base de datos se sustituye por dobles (`require.cache`) o por valores fijos.

### 3.1 Inventario backend

| Suite                             | Archivo                                                                 | Casos  | Qué audita                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Reglas de validación              | [`backend/test/validators.test.js`](../backend/test/validators.test.js) | 9      | Identificación, nombre, email, teléfono, precio, IVA, stock, items y descuento (0–100 %)                                  |
| Utilidades de negocio             | [`backend/test/helpers.test.js`](../backend/test/helpers.test.js)       | 16     | `calcularIVA` (19 %), numeración `FAC-YYYYMM-XXXXX` con _advisory lock_, `escapeXML`, `escapeCSV`, mapeo filas SQL → JSON |
| CUNE (DIAN)                       | [`backend/test/cune.test.js`](../backend/test/cune.test.js)             | 6      | Determinismo del SHA‑256, formato, sensibilidad al número y al total                                                      |
| Seguridad JWT                     | [`backend/test/jwt.test.js`](../backend/test/jwt.test.js)               | 8      | Firma, expiración, algoritmo, `jti` obligatorio (revocación)                                                              |
| Middleware de validación          | [`backend/test/validate.test.js`](../backend/test/validate.test.js)     | 2      | 400 con campos señalados y continuidad cuando la petición es válida                                                       |
| Autorización y matriz de permisos | [`backend/test/authorize.test.js`](../backend/test/authorize.test.js)   | 7      | Rol permitido/denegado (403) y verificación estática de la matriz de rutas                                                |
| **Total**                         | 6 suites                                                                | **47** | —                                                                                                                         |

### 3.2 Inventario frontend

| Suite              | Archivo                                                                                   | Casos  | Qué audita                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Validadores        | [`frontend/src/app/core/validators.spec.ts`](../frontend/src/app/core/validators.spec.ts) | 10     | Formato NIT `000000000-0`, email, teléfono, cliente, producto y usuario                                          |
| Formateo y cálculo | [`frontend/src/app/core/formatters.spec.ts`](../frontend/src/app/core/formatters.spec.ts) | 14     | Moneda COP, formato corto de gráficos, fechas `dd/mm/yyyy`, tiempo relativo, `calcularIVA`, variación porcentual |
| Componente raíz    | [`frontend/src/app/app.spec.ts`](../frontend/src/app/app.spec.ts)                         | 1      | Instanciación con el router de la aplicación                                                                     |
| **Total**          | 3 suites                                                                                  | **25** | —                                                                                                                |

### 3.3 Criterios de diseño

- **Regla financiera primero:** valores frontera (0, 1, 53, 95.000, 1.500.000) y verificación de la identidad contable `total = subtotal − descuento + IVA`.
- **Redondeo explícito:** IVA y descuento se persisten como enteros en pesos (`Math.round`), evitando descuadres por coma flotante.
- **Estructuras de datos:** se validan esquemas de entrada del API, formato del NIT y del número de factura, y escapado XML/CSV para que un nombre con `&`, `<` o comillas no corrompa el documento electrónico.
- **Aislamiento:** `config/db` se sustituye por un stub inyectado en `require.cache`, patrón replicable en cualquier equipo o pipeline.

---

## 4. Nivel 2 — Pruebas de integración (20 %)

### 4.1 Suite del módulo de facturación

Archivo: [`backend/test/integracion/facturas.api.test.js`](../backend/test/integracion/facturas.api.test.js) — **18 casos**.

Técnica: se levanta una instancia real de Express en un puerto efímero y se ejercita por HTTP con `fetch`; `config/db` se reemplaza por un **doble de MySQL** que reproduce el contrato de `mysql2` (`pool.query`, `getConnection`, `beginTransaction`, `commit`, `rollback`) y **registra la traza de sentencias**, de modo que la transacción se audita sin depender del motor.

| Grupo                                 | Casos           | Verificación                                                                                                                                                 |
| ------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Autenticación y validación de entrada | 4               | 401 sin token (sin tocar la base), 400 por items vacíos y por descuento fuera de rango, 400 por `clienteId` no numérico                                      |
| Emisión y cálculo financiero          | 3               | Subtotal, descuento en pesos, IVA sobre la base gravable, total, número consecutivo bajo _advisory lock_ y emisión con cualquier rol autenticado             |
| Inventario y atomicidad               | 4               | 409 por stock insuficiente sin abrir transacción, **rollback** cuando otra venta consumió el stock, rechazo de producto repetido, 404 de cliente inexistente |
| Ciclo de vida DIAN                    | 4               | Cambio de estado (firma `firmada`, intentos +1), 401 sin credenciales, cambio con rol vendedor, 404 de factura inexistente                                   |
| Eliminación y reversión               | 2               | Restitución de stock en factura `pendiente`, 409 al eliminar una factura enviada                                                                             |
| Trazabilidad                          | 1 (transversal) | Registro de auditoría de la operación                                                                                                                        |

**Última ejecución:** 18/18 aprobados; traza confirmada de `GET_LOCK`/`RELEASE_LOCK`, un único `commit` en éxito y un único `rollback` en el escenario de concurrencia.

### 4.2 Integración contra MySQL real

La suite de aceptación valida el mismo flujo contra el motor real: el inventario se comprueba leyendo el stock después de la venta (`20 → 17`), lo que confirma la transacción ACID extremo a extremo.

### 4.3 Pruebas de API con Postman

Colección [`postman/collections/FacturaExpress-API-Express.postman_collection.json`](../postman/collections/FacturaExpress-API-Express.postman_collection.json) (12 carpetas, más de 40 peticiones) para exploración y regresión de contratos REST; ejecutable de forma desatendida con `newman`.

### 4.4 Cobertura pendiente

Extender la integración a `clientes`, `productos` (ajuste de stock), `usuarios` (cambio de rol e invalidación de sesión), `reportes` (KPIs y PDF) y `backup`/restauración.

---

## 5. Nivel 3 — Funcionales y de aceptación (10 %)

### 5.1 Suite implementada

Archivo: [`backend/scripts/pruebas-aceptacion.js`](../backend/scripts/pruebas-aceptacion.js) — **16 casos (CA‑01 a CA‑16)**, sin dependencias externas (`fetch` nativo), con código de salida 1 si algún caso falla (apto para CI).

| Caso  | Escenario                          | Criterio de aceptación                                                                                           |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| CA‑01 | Disponibilidad                     | `GET /api/health` responde 200                                                                                   |
| CA‑02 | Login del administrador            | 200 + cookie `httpOnly` y token                                                                                  |
| CA‑03 | Identidad del usuario              | `GET /api/auth/me` con rol `admin`                                                                               |
| CA‑04 | Alta de cliente                    | 201 y `clienteId`                                                                                                |
| CA‑05 | Alta de producto (stock 20)        | 201 y `productoId`                                                                                               |
| CA‑06 | **Emisión con descuento del 10 %** | Subtotal $150.000, descuento $15.000, IVA $25.650, total $160.650, número `FAC-YYYYMM-XXXXX`, estado `pendiente` |
| CA‑07 | Inventario                         | Stock 20 → 17 (transacción ACID)                                                                                 |
| CA‑08 | Detalle de la factura              | 200 con items y total coincidente                                                                                |
| CA‑09 | Descarga PDF                       | 200 y firma `%PDF`                                                                                               |
| CA‑10 | Descarga XML DIAN                  | 200 con `<?xml`, número y total                                                                                  |
| CA‑11 | Descarga CSV                       | 200 con el número de factura                                                                                     |
| CA‑12 | Estado `enviada`                   | 200, firma `firmada`, intentos DIAN = 1                                                                          |
| CA‑13 | Integridad del documento           | 409 al eliminar una factura enviada a la DIAN                                                                    |
| CA‑14 | Reportes                           | `ventasMes > 0`, facturas y productos vendidos contabilizados                                                    |
| CA‑15 | Control de acceso por rol          | 403 cuando el rol `vendedor` consulta un módulo administrativo                                                   |
| CA‑16 | Cierre de sesión                   | 200 y 401 en la petición siguiente (token revocado)                                                              |

### 5.2 Evidencia de la última ejecución (2026-09-20)

```
=== Pruebas de aceptacion FacturaExpress ===
[  OK  ] CA-01 ... CA-16
Casos ejecutados : 16    Exitosos : 16    Fallidos : 0    Resultado : ACEPTADO
```

| Suite                     | Comando                                       | Resultado                              |
| ------------------------- | --------------------------------------------- | -------------------------------------- |
| Unitarias backend         | `npm run test:unit --prefix backend`          | 47/47 OK                               |
| Integración backend       | `npm run test:integracion --prefix backend`   | 18/18 OK                               |
| Backend completo          | `npm test --prefix backend`                   | **65/65 OK, 0 fallos (~0,4 s)**        |
| Frontend (vitest + jsdom) | `npm test --prefix frontend -- --watch=false` | **25/25 OK (3 archivos, ~0,7 s)**      |
| Aceptación E2E            | `npm run test:e2e`                            | **16/16 OK contra API + MySQL reales** |

Valores reales registrados: factura `FAC-202609-00005`, subtotal `$150.000`, descuento `$15.000`, IVA `$25.650`, total `$160.650`; stock `20 → 17`; `ventasMes = $6.586.650` con 27 facturas y 71 productos vendidos.

### 5.3 Prerrequisitos

MySQL disponible, esquema migrado (`npm run db:migrate --prefix backend`), datos semilla (`npm run db:seed --prefix backend`) y API en ejecución (`npm start --prefix backend`). El seed crea `900.123.456-7` (admin), `80.987.654-3` (vendedor) y `70.555.444-2` (contador).

---

## 6. Matriz de trazabilidad (regla de negocio → prueba)

| Regla / requisito                                                                                                | Módulo                  | Nivel                        | Casos                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------- | ---------------------------------------------------------- |
| El subtotal se calcula con el precio del catálogo, ignorando el precio enviado por el cliente                    | Facturación             | Unitario + Integración + E2E | `helpers.test.js`, integración (cálculo), CA‑06            |
| El descuento es un porcentaje 0–100 y se persiste en pesos sobre el subtotal                                     | Facturación             | Unitario + Integración       | `validators.test.js`, integración (100 % y fuera de rango) |
| El IVA del 19 % se aplica sobre la base gravable (subtotal − descuento) con redondeo a enteros                   | Facturación / Impuestos | Unitario + E2E               | `helpers.test.js`, `formatters.spec.ts`, CA‑06             |
| La numeración `FAC-YYYYMM-XXXXX` es única y consecutiva bajo _advisory lock_                                     | Facturación             | Unitario + Integración       | `helpers.test.js`, integración                             |
| El CUNE es determinista y depende de número, cliente, NIT, total y fecha                                         | Documento electrónico   | Unitario                     | `cune.test.js`                                             |
| Un producto no puede repetirse en la misma venta (evita doble descuento de stock)                                | Inventario              | Integración                  | integración (`facturas.api.test.js`)                       |
| El stock no puede quedar negativo: ante fallo se revierte la transacción                                         | Inventario              | Integración + E2E            | integración (rollback), CA‑07                              |
| Al eliminar una factura pendiente se restituye el stock                                                          | Inventario              | Integración                  | integración                                                |
| Una factura enviada a la DIAN no puede eliminarse                                                                | Cumplimiento DIAN       | Integración + E2E            | integración, CA‑13                                         |
| Los módulos administrativos (usuarios, errores, logs, backup) y la escritura de configuración exigen rol `admin` | Seguridad / RBAC        | Unitario + E2E               | `authorize.test.js`, CA‑15                                 |
| Los módulos de operación (clientes, productos, facturas, reportes) exigen autenticación                          | Seguridad               | Unitario + Integración       | `authorize.test.js`, integración (401)                     |
| El token JWT no es reutilizable tras el _logout_ (revocación por `jti`)                                          | Seguridad               | Unitario + E2E               | `jwt.test.js`, CA‑16                                       |
| La identificación y los correos se validan antes de llegar a la base                                             | Validación de datos     | Unitario + Integración       | `validators.test.js`, `validators.spec.ts`, integración    |
| El XML/CSV del documento es válido ante caracteres especiales (`&`, `<`, `"`)                                    | Documento electrónico   | Unitario + E2E               | `helpers.test.js`, CA‑10, CA‑11                            |
| Los reportes acumulan ventas del mes, facturas y productos vendidos                                              | Reportería              | E2E                          | CA‑14                                                      |

---

## 7. Entornos y datos de prueba

| Entorno                         | Base de datos                         | Datos                               | Uso                        |
| ------------------------------- | ------------------------------------- | ----------------------------------- | -------------------------- |
| Unitario                        | No requiere (stubs)                   | Fijos en el código                  | Cada cambio, local y CI    |
| Integración (API + doble de BD) | No requiere                           | Fijos en el código                  | Cada _push_                |
| Aceptación / E2E                | MySQL 8 real (Docker Compose o local) | Semilla + datos con marca de tiempo | Antes de cada entrega      |
| Despliegue                      | `docker compose up --build`           | Semilla opcional                    | Verificación de despliegue |

Los casos E2E generan identificadores únicos (marca de tiempo) para ser **repetibles sin limpiar la base** y validan valores relativos (stock esperado, acumulados > 0) en lugar de totales absolutos.

---

## 8. Criterios de calidad

**Entrada (Definition of Ready):** regla de negocio con criterios de aceptación explícitos; dependencias instaladas; datos semilla para los niveles 2 y 3; API con `/api/health` en 200.

**Salida (Definition of Done):** 100 % de las pruebas en verde (hoy 65/65 backend, 25/25 frontend, 16/16 aceptación); sin defectos críticos o altos abiertos; toda regla financiera nueva con su prueba unitaria y su caso E2E; distribución alineada con la pirámide (≈70/20/10; actual 68/17/15); evidencia de ejecución adjunta.

**Suspensión:** fallo de infraestructura (MySQL inaccesible, contenedor caído), defecto bloqueante en emisión, inventario o seguridad, o entorno con dependencias incompletas.

---

## 9. Gestión de defectos

| Severidad | Descripción                                | Ejemplo                                                    | Tratamiento                                     |
| --------- | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Crítica   | Afecta integridad financiera o fiscal      | Total mal calculado, stock negativo, CUNE no determinista  | Corrección inmediata + prueba de regresión      |
| Alta      | Afecta seguridad o disponibilidad          | Endpoint sin autenticación, token reutilizable tras logout | Corrección en el ciclo + unitaria e integración |
| Media     | Degrada funcionalidad sin pérdida de datos | Formato de fecha o moneda incorrecto                       | Programada con prueba unitaria                  |
| Baja      | Cosmético                                  | Mensaje impreciso                                          | Se acumula para el siguiente ciclo              |

Los errores del sistema se centralizan en `errores_sistema` (módulo _Errores_ del panel) y cada operación queda auditada en `logs_auditoria`, lo que permite reconstruir el contexto de un fallo.

---

## 10. Métricas y brechas

| Métrica                    | Valor actual                                                                  | Objetivo           |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| Casos automatizados        | **106** (47 unitarios backend + 25 frontend + 18 integración + 16 aceptación) | ≥ 115              |
| Backend aprobado           | **65/65** (0 fallos)                                                          | 100 %              |
| Frontend aprobado          | **25/25** (0 fallos)                                                          | 100 %              |
| Aceptación aprobada        | **16/16** contra API + MySQL reales                                           | 100 %              |
| Distribución por nivel     | 68 % / 17 % / 15 %                                                            | 70 % / 20 % / 10 % |
| Defectos críticos abiertos | 0                                                                             | 0                  |

| Brecha                                                                                                       | Acción propuesta                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Sin medición de cobertura de código                                                                          | Incorporar `c8` (Node) y `--coverage` de vitest; meta: 70 % en `utils/`, `middleware/` y `validators/` |
| Integración limitada a facturación                                                                           | Extender a `clientes`, `productos`, `usuarios`, `reportes` y `backup`                                  |
| Ejecución E2E manual                                                                                         | Automatizar en CI: MySQL con `docker compose`, migrar, sembrar y ejecutar `test:e2e`                   |
| Sin pruebas de rendimiento ni seguridad automatizadas                                                        | Añadir `k6` (latencia de `POST /api/facturas`) y `npm audit` + OWASP ZAP                               |
| `formatMoney` devuelve `$ 0` (con espacio de `Intl`) para el cero y `$0` sin espacio en el valor de respaldo | Unificar el espaciado (severidad baja, detectada por la prueba correspondiente)                        |
| Binarios nativos (`esbuild`, `rolldown`) ausentes si `node_modules` proviene de otra plataforma              | Ejecutar `npm ci` en el equipo o trabajar dentro del contenedor Linux                                  |

---

## 11. Herramientas

| Herramienta                                      | Uso                                                       |
| ------------------------------------------------ | --------------------------------------------------------- |
| `node:test` + `node:assert/strict`               | Runner nativo del backend (sin dependencias añadidas)     |
| Doble de MySQL (`require.cache` + traza SQL)     | Integración sin servidor de base de datos                 |
| `vitest` + `jsdom` (`@angular/build:unit-test`)  | Pruebas unitarias de la SPA Angular                       |
| `scripts/pruebas-aceptacion.js` (`fetch` nativo) | Aceptación extremo a extremo con código de salida para CI |
| Postman / `newman`                               | Contratos REST y regresión desatendida                    |
| Docker Compose                                   | Entorno reproducible (MySQL 8 + API + nginx)              |
| GitHub Actions (propuesto)                       | Ejecución automática en cada _push_                       |

---

## 12. Comandos de referencia

```bash
# Backend: 47 unitarias + 18 integración = 65 casos
npm test --prefix backend
npm run test:unit --prefix backend
npm run test:integracion --prefix backend

# Frontend: 25 casos (vitest + jsdom)
npm test --prefix frontend -- --watch=false

# Aceptación extremo a extremo (requiere API y MySQL en ejecución)
npm run db:migrate --prefix backend && npm run db:seed --prefix backend
npm start --prefix backend     # terminal 1
npm run test:e2e               # terminal 2

# Todo el proyecto
npm test
```

---

## 13. Conclusión

La estrategia concentra el esfuerzo en la base de la pirámide (72 casos unitarios sobre reglas de negocio financieras, validación de estructuras y autorización) y reserva 18 casos de integración para verificar la pila HTTP–DAO con transacciones ACID, más 16 casos de aceptación que certifican el flujo completo de emisión de la factura electrónica, el inventario, el ciclo DIAN y las descargas XML/PDF/CSV. Con las suites en verde (65/65 backend, 25/25 frontend y 16/16 aceptación contra la base real), el proyecto dispone de una red de seguridad verificable y reproducible, lista para un pipeline de integración continua.
