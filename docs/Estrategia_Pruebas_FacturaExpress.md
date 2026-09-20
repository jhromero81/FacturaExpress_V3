# Estrategia de Pruebas — FacturaExpress V3

**Proyecto:** FacturaExpress — solución web de gestión y procesamiento de facturación electrónica e inventarios (API REST + SPA Angular)
**Evidencia asociada:** GA7-220501096-AA5-EV03 (Diseño y desarrollo de servicios web)
**Autor:** Jhon Henry Romero
**Fecha de elaboración:** 2026-09-20
**Última ejecución de la suite:** Backend 100/100 pruebas OK · Frontend 37/37 pruebas OK · Aceptación 21/21 casos OK

---

## 1. Objetivo y alcance

Definir el modelo de aseguramiento de calidad del proyecto **FacturaExpress**, articulado mediante la **pirámide de pruebas de Mike Cohn**, de forma que el esfuerzo de verificación se concentre en la base (reglas de negocio financieras de bajo costo y alta velocidad) y se reduzca en la cúspide (flujos extremo a extremo, costosos y lentos pero indispensables para la aceptación).

El alcance cubre:

| Componente            | Stack                                     | Objeto de prueba                                             |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| API REST              | Node.js + Express 5 + MySQL 8 (`mysql2`)  | Reglas de negocio, validación, seguridad, transacciones, DAO |
| SPA Web               | Angular 22 + TypeScript (vitest + jsdom)  | Validación de formularios, formateo, componentes             |
| Documento electrónico | PDFKit, generador XML/CSV, CUNE (SHA‑256) | Integridad del documento y del código único DIAN             |
| Infraestructura       | Docker Compose (MySQL + API + nginx)      | Configuración de entornos y pruebas de aceptación            |

Fuera del alcance inicial: pruebas de carga masiva, pruebas de penetración formales, certificación real ante la DIAN (el envío se simula), pruebas de accesibilidad WCAG completas y las **retenciones de impuestos** (ReteFuente/ReteIVA), que no forman parte del modelo de datos actual (`IVA` y descuento porcentual sí lo están).

---

## 2. Enfoque: la pirámide aplicada a FacturaExpress

```
                    ▲  10%  Pruebas funcionales y de aceptación (E2E)
                   ███      Certifican el flujo de emisión de la factura
                  █████
                 ███████   20%  Pruebas de integración
                █████████      API ↔ DAO ↔ MySQL, transacciones ACID, middleware
               ███████████
              █████████████  70%  Pruebas unitarias
             ███████████████     Reglas de negocio financieras y estructuras de datos
```

| Nivel                                        | Propósito en el proyecto                                                                                                                                                                      | Cobertura objetivo | Herramienta                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| **1. Unitarias** (base)                      | Auditar las reglas de negocio financieras: cálculo de subtotal, descuento, IVA por tarifa del producto (0, 0,05 y 0,19), CUNE, validación de estructuras (identificación NIT, esquemas XML/JSON), utilidades de seguridad, login/bloqueo de cuenta e integridad de respaldos | **70 %**           | `node:test` (backend) · `vitest` (frontend)                |
| **2. Integración** (capa intermedia)         | Verificar la capa DAO/Controladores contra la base de datos relacional (transacciones ACID al insertar facturas y actualizar stock), el consumo de la API REST y los middlewares de seguridad | **20 %**           | `node:test` + doble de MySQL · Postman                     |
| **3. Funcionales y de aceptación** (cúspide) | Certificar el flujo extremo a extremo: emisión de la factura desde el portal web hasta el registro final, descargas PDF/XML/CSV, cambio de estado DIAN y reportes                             | **10 %**           | Script de aceptación en Node (`fetch`) · colección Postman |

**Distribución real alcanzada hoy:** 111 casos unitarios (70 %), 26 de integración (16 %) y 21 de aceptación (13 %) sobre un total de **158 casos automatizados**.

---

## 3. Nivel 1 — Pruebas unitarias (70 %)

### 3.1 Objetivo

Aislar las reglas de negocio y las funciones puras, sustituyendo la base de datos por dobles (stubs) para que la ejecución sea determinista, sin red ni MySQL.

### 3.2 Inventario actual de suites (backend)

| Suite                             | Archivo                                                                 | Casos  | Qué audita                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Reglas de validación de entrada   | [`backend/test/validators.test.js`](../backend/test/validators.test.js) | 9      | NIT, identificación, nombre, email, teléfono, precio, IVA, stock, items y descuentos de factura          |
| Utilidades de negocio             | [`backend/test/helpers.test.js`](../backend/test/helpers.test.js)       | 23     | `calcularIVA` (tarifas 0, 0,05 y 0,19), numeración `FAC-YYYYMM-XXXXX`, `escapeXML`, `escapeCSV`, mapeo de filas SQL → JSON |
| CUNE (código único DIAN)          | [`backend/test/cune.test.js`](../backend/test/cune.test.js)             | 6      | Determinismo del hash SHA‑256, formato, sensibilidad al número y al total                                |
| Seguridad JWT                     | [`backend/test/jwt.test.js`](../backend/test/jwt.test.js)               | 7      | Firma, expiración, emisor y audiencia exigidos, `jti` obligatorio (revocación), algoritmos no permitidos |
| Login y bloqueo de cuenta         | [`backend/test/login.test.js`](../backend/test/login.test.js)           | 10     | Éxito del login sin exponer el token en el cuerpo, entrega con `X-Token-Response`, reinicio del contador de intentos, bloqueo temporal (423) incluso con la contraseña correcta, cálculo del bloqueo dentro de SQL (evita el desfase de zona horaria), acumulación de intentos fallidos, no enumeración de usuarios y respuesta 401 (no 500) ante una contraseña no textual (por ejemplo un número, que haría lanzar una excepción a `bcrypt.compare`) |
| Middleware de validación          | [`backend/test/validate.test.js`](../backend/test/validate.test.js)     | 2      | Respuesta 400 con campos señalados y continuidad cuando la petición es válida                            |
| Autorización y matriz de permisos | [`backend/test/authorize.test.js`](../backend/test/authorize.test.js)   | 9      | Rol permitido/denegado (403) y verificación estática de la matriz de permisos por ruta                   |
| Integridad de respaldos           | [`backend/test/backup.test.js`](../backend/test/backup.test.js)         | 8      | Determinismo del checksum SHA‑256, rechazo de *path traversal*, rechazo de archivos que no son respaldos, rechazo de cabecera alterada, rechazo de huella que no coincide y 404 si el respaldo no existe |
| **Total backend**                 | 8 suites                                                                | **74** | —                                                                                                        |

### 3.3 Inventario de suites (frontend)

| Suite                      | Archivo                                                                                   | Casos  | Qué audita                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Validadores de formularios | [`frontend/src/app/core/validators.spec.ts`](../frontend/src/app/core/validators.spec.ts) | 13     | Formato NIT `000000000-0`, email, teléfono, cliente, producto y usuario (con y sin contraseña)                   |
| Formateo y cálculo         | [`frontend/src/app/core/formatters.spec.ts`](../frontend/src/app/core/formatters.spec.ts) | 23     | Moneda COP, formato corto de gráficos, fechas `dd/mm/yyyy`, tiempo relativo, `calcularIVA`, variación porcentual |
| Componente raíz            | [`frontend/src/app/app.spec.ts`](../frontend/src/app/app.spec.ts)                         | 1      | Instanciación del componente raíz con el router                                                                  |
| **Total frontend**         | 3 suites                                                                                  | **37** | —                                                                                                                |

La SPA compila con TypeScript en modo estricto (`strict` y `strictTemplates` activados en [`frontend/tsconfig.json`](../frontend/tsconfig.json)). Se eliminó `core/render.service.ts` (`ServicioRender`) y sus llamadas manuales a `ApplicationRef.tick()`; la detección de cambios la gestiona Zone.js con `provideZoneChangeDetection` y `withXhr`. La búsqueda y la paginación de clientes, productos y facturas se resuelven en el servidor con los parámetros `q`, `estado`, `pagina` y `limite`, y los campos `total`/`totalPaginas` que devuelve la API; el punto de venta usa el IVA de cada producto y recarga el catálogo tras la venta. El repositorio incluye `frontend/.prettierrc.json`.

### 3.4 Criterios de diseño de los casos unitarios

- **Regla financiera primero:** todo cálculo monetario se prueba con valores frontera (0, 1, 53, 95.000, 1.500.000) y se verifica la identidad contable `total = subtotal − descuento + IVA`.
- **Redondeo explícito:** se exige el uso de `Math.round` (IVA y descuento se persisten como enteros en pesos), evitando descuadres por decimales flotantes.
- **Estructuras de datos:** se validan esquemas de entrada (JSON del API), formato del NIT y del número de factura, y el escapado de XML/CSV para que un nombre con `&`, `<` o comillas no corrompa el documento electrónico.
- **Aislamiento:** `config/db` se reemplaza por un stub mediante `require.cache`, patrón replicable en cualquier máquina o pipeline.

### 3.5 Ejecución

```bash
npm run test:unit --prefix backend     # solo unitarias (74 casos)
npm test --prefix backend              # unitarias + integración (100 casos)
npm test --prefix frontend -- --watch=false   # vitest + jsdom (37 casos)
```

---

## 4. Nivel 2 — Pruebas de integración (20 %)

### 4.1 Objetivo

Comprobar que las piezas ya probadas por separado funcionan juntas: **router → middlewares (autenticación, autorización, validación) → controlador → utilidades de negocio → capa DAO (MySQL) → manejador central de errores**.

### 4.2 Suite implementada: módulo de facturación extremo a API

Archivo: [`backend/test/integracion/facturas.api.test.js`](../backend/test/integracion/facturas.api.test.js) — **26 casos**.

Técnica: se levanta una instancia real de Express en un puerto efímero y se ejercita por HTTP con `fetch`; `config/db` se sustituye por un **doble de MySQL** que reproduce el contrato de `mysql2` (`pool.query`, `getConnection`, `beginTransaction`, `commit`, `rollback`) y **registra la traza de sentencias**, lo que permite auditar la transacción sin depender del servidor de base de datos.

| Grupo                        | Verificación                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seguridad de acceso          | 401 sin token (sin tocar la base), 403 por rol no autorizado, 400 por validación de entrada                                                        |
| Emisión y cálculo financiero | Subtotal, descuento en pesos, IVA con la tarifa del producto sobre la base gravable, total y número consecutivo generado con la tabla `secuencias_facturas` bajo _advisory lock_ y transacción |
| Inventario y atomicidad      | 409 por stock insuficiente sin abrir transacción, **rollback** cuando otra venta consumió el stock, rechazo de productos repetidos, 404 de cliente |
| Ciclo de vida DIAN           | Cambio de estado a `enviada`/`rechazada` y regreso a `pendiente`, acumulación de `intentos_dian`, 403 con vendedor, 404 de factura inexistente      |
| Numeración                   | Eliminar una factura no rompe la numeración consecutiva (no se produce clave duplicada ni reutilización de números fiscales)                        |
| Eliminación y reversión      | Restitución de stock en factura `pendiente`, 409 al intentar eliminar una factura ya enviada                                                        |
| Trazabilidad                 | Registro de auditoría por operación y ausencia de efectos colaterales                                                                              |

**Resultado de la última ejecución:** 26/26 casos aprobados.

### 4.3 Integración contra MySQL real

La suite E2E (sección 5) valida la misma lógica contra el motor real (MySQL 8.4): la creación/actualización de inventario se verifica leyendo el stock del producto después de la venta, lo que confirma la transacción ACID extremo a extremo.

### 4.4 Pruebas de API con Postman

Se conserva la colección [`postman/collections/FacturaExpress-API-Express.postman_collection.json`](../postman/collections/FacturaExpress-API-Express.postman_collection.json) (12 carpetas y **47 peticiones** en formato `.request.yaml`) para exploración manual y regresión rápida de contratos REST. **No hay ejecución de Newman en el pipeline de CI**; la colección es una herramienta de apoyo local.

### 4.5 Ejecución

```bash
npm run test:integracion --prefix backend
```

### 4.6 Cobertura pendiente (plan de mejora)

Módulos por cubrir con pruebas de integración análogas: `clientes`, `productos` (ajuste de stock), `usuarios` (cambio de rol e invalidación de sesión), `reportes` (KPIs y exportación PDF) y `backup`/restauración (hoy cubierto a nivel unitario en `backup.test.js`).

---

## 5. Nivel 3 — Pruebas funcionales y de aceptación (10 %)

### 5.1 Objetivo

Certificar el flujo extremo a extremo del negocio: desde el inicio de sesión en el portal web, pasando por la venta en el POS y el registro de la factura, hasta el cambio de estado ante la DIAN, las descargas del documento electrónico y la actualización de los reportes.

### 5.2 Suite implementada

Archivo: [`backend/scripts/pruebas-aceptacion.js`](../backend/scripts/pruebas-aceptacion.js) — **21 casos (CA‑01 a CA‑21)**, sin dependencias externas (`fetch` nativo), con código de salida 1 si algún caso falla (apto para CI).

| Caso  | Escenario funcional                                              | Criterio de aceptación                                                                                           |
| ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| CA‑01 | Disponibilidad del servicio                                      | `GET /api/health` responde 200                                                                                   |
| CA‑02 | Inicio de sesión del administrador                               | 200 + cookie `httpOnly`; el token no se expone en el cuerpo salvo con `X-Token-Response`                          |
| CA‑03 | Identidad del usuario autenticado                                | `GET /api/auth/me` con el rol `admin`                                                                            |
| CA‑04 | Alta de cliente                                                  | 201 y `clienteId` asignado                                                                                       |
| CA‑05 | Alta de producto con stock inicial                               | 201 y `productoId` asignado                                                                                      |
| CA‑06 | **Emisión de factura con descuento del 10 %**                    | Subtotal, descuento en pesos, IVA según la tarifa del producto y total; número `FAC-YYYYMM-XXXXX`, estado `pendiente` |
| CA‑07 | Descuento de inventario                                          | El stock del producto se reduce tras la venta (transacción ACID)                                                 |
| CA‑08 | Consulta del detalle                                             | 200 con items y total coincidente                                                                                |
| CA‑09 | Descarga del PDF                                                 | 200 y firma `%PDF`                                                                                               |
| CA‑10 | Descarga del XML DIAN                                            | 200 con `<?xml`, número y total de la factura                                                                    |
| CA‑11 | Descarga del CSV                                                 | 200 con el número de factura                                                                                     |
| CA‑12 | Cambio de estado a `enviada`                                     | 200, firma `firmada`, intentos DIAN registrados                                                                  |
| CA‑13 | Integridad del documento electrónico                             | 409 al intentar eliminar una factura enviada a la DIAN                                                           |
| CA‑14 | Reportes del negocio                                             | `ventasMes > 0`, facturas y productos vendidos contabilizados                                                    |
| CA‑15 | Control de acceso por rol                                        | 403 cuando el rol `vendedor` intenta cambiar el estado DIAN                                                      |
| CA‑16 | Regresión: estado `rechazada` y regreso a `pendiente`            | Ambos cambios de estado responden sin error                                                                      |
| CA‑17 | Regresión: acumulación de intentos DIAN                          | Los intentos de envío se acumulan en cada cambio de estado                                                       |
| CA‑18 | Regresión: eliminación y numeración                              | Eliminar una factura no rompe la numeración consecutiva                                                          |
| CA‑19 | Regresión: IVA por tarifa del producto                           | El IVA se calcula con la tarifa configurada del producto (0, 0,05 o 0,19)                                        |
| CA‑20 | Regresión: coherencia detalle/cabecera                           | El detalle de la factura cuadra con la cabecera                                                                  |
| CA‑21 | Cierre de sesión                                                 | 200 y 401 en la petición siguiente (token revocado)                                                              |

### 5.3 Salida de la suite de aceptación

```
=== Pruebas de aceptacion FacturaExpress ===
API: http://127.0.0.1:4000
[  OK  ] CA-01 ... CA-21   (21 casos)
Casos ejecutados : 21    Exitosos : 21    Fallidos : 0    Resultado : ACEPTADO
```

El script devuelve **código de salida 0** si todos los casos pasan y **1** si alguno falla. Resumen consolidado de las suites:

| Suite                                       | Comando                                       | Resultado                          |
| ------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| Unitarias backend                           | `npm run test:unit --prefix backend`          | 74/74 OK                           |
| Integración backend                         | `npm run test:integracion --prefix backend`   | 26/26 OK                           |
| Unitarias frontend (vitest + jsdom)         | `npm test --prefix frontend -- --watch=false` | 37/37 OK (3 archivos)              |
| **Total backend (unitarias + integración)** | `npm test --prefix backend`                   | **100/100 OK, 0 fallos**             |
| Aceptación extremo a extremo                | `npm run test:e2e`                            | 21/21 OK contra API + MySQL reales |

### 5.4 Ejecución

```bash
npm run dev --prefix backend            # terminal 1: API en http://127.0.0.1:4000
npm run test:e2e                        # terminal 2: suite de aceptación
```

Prerrequisitos: MySQL 8 disponible, esquema migrado (`npm run db:migrate --prefix backend`) y datos semilla cargados (`npm run db:seed --prefix backend`), que crean el administrador `900.123.456-7` (Jhon Henry Romero), el vendedor `80.987.654-3` (Maria Fernanda Lopez) y el contador `70.555.444-2` (Carlos Andres Ruiz). Las contraseñas se definen con `SEED_ADMIN_PASSWORD`, `SEED_VENDEDOR_PASSWORD` y `SEED_CONTADOR_PASSWORD`, o las imprime el propio seed una única vez si no se definen. La suite de aceptación exige `E2E_PASSWORD` y `E2E_VENDEDOR_PASSWORD` y falla con un mensaje claro si faltan.

---

## 6. Matriz de trazabilidad (regla de negocio → prueba)

| Regla de negocio / requisito                                                                                               | Módulo                  | Nivel                        | Casos                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------- | --------------------------------------------------------------------- |
| El subtotal de la factura se calcula en el servidor con el precio del catálogo, ignorando el precio enviado por el cliente | Facturación             | Unitario + Integración + E2E | `helpers.test.js`, `facturas.api.test.js` (cálculo), CA‑06            |
| El descuento es un porcentaje 0–100 y se persiste en pesos sobre el subtotal                                               | Facturación             | Unitario + Integración       | `validators.test.js`, `facturas.api.test.js` (100 % y fuera de rango) |
| El IVA se aplica según la tarifa del producto (0, 0,05 o 0,19) sobre la base gravable, con redondeo a enteros              | Facturación / Impuestos | Unitario + Integración + E2E | `helpers.test.js`, `formatters.spec.ts`, `facturas.api.test.js`, CA‑19 |
| La numeración `FAC-YYYYMM-XXXXX` es única y consecutiva, protegida por `secuencias_facturas` bajo _advisory lock_           | Facturación             | Unitario + Integración + E2E | `helpers.test.js`, `facturas.api.test.js`, CA‑18                       |
| El CUNE es determinista y depende de número, cliente, NIT, total y fecha                                                   | Documento electrónico   | Unitario                     | `cune.test.js`                                                        |
| Un producto no puede repetirse en la misma venta (evita doble descuento de stock)                                          | Inventario              | Integración                  | `facturas.api.test.js`                                                |
| El stock no puede quedar negativo: ante fallo se revierte la transacción                                                   | Inventario              | Integración + E2E            | `facturas.api.test.js` (rollback), CA‑07                              |
| Al eliminar una factura pendiente se restituye el stock                                                                    | Inventario              | Integración                  | `facturas.api.test.js`                                                |
| El detalle de la factura cuadra con la cabecera                                                                            | Facturación             | Integración + E2E            | `facturas.api.test.js`, CA‑20                                         |
| Una factura enviada a la DIAN no puede eliminarse                                                                          | Cumplimiento DIAN       | Integración + E2E            | `facturas.api.test.js`, CA‑13                                         |
| El cambio de estado DIAN admite `enviada`, `rechazada` y el regreso a `pendiente`, acumulando intentos                     | Cumplimiento DIAN       | Integración + E2E            | `facturas.api.test.js`, CA‑16, CA‑17                                  |
| Solo `admin` y `contador` cambian el estado DIAN; `admin` y `vendedor` emiten                                              | Seguridad / RBAC        | Unitario + Integración + E2E | `authorize.test.js`, `facturas.api.test.js`, CA‑15                    |
| El token JWT no es reutilizable tras el _logout_ (lista de revocación por `jti`)                                           | Seguridad               | Unitario + E2E               | `jwt.test.js`, CA‑21                                                  |
| El login no expone el token en el cuerpo y bloquea temporalmente la cuenta tras varios fallos                              | Seguridad               | Unitario                     | `login.test.js`                                                       |
| Los respaldos se validan por checksum SHA‑256 antes de restaurar (rechaza archivos alterados o no registrados)             | Respaldos               | Unitario                     | `backup.test.js`                                                      |
| El NIT/identificación y los correos se validan antes de llegar a la base                                                   | Validación de datos     | Unitario + Integración       | `validators.test.js`, `validators.spec.ts`, `facturas.api.test.js`    |
| El XML/CSV del documento es válido ante caracteres especiales (`&`, `<`, `"`)                                              | Documento electrónico   | Unitario + E2E               | `helpers.test.js`, CA‑10, CA‑11                                       |
| Los reportes acumulan las ventas del mes, facturas y productos vendidos                                                    | Reportería              | E2E                          | CA‑14                                                                 |

---

## 7. Entornos y datos de prueba

| Entorno                         | Base de datos                            | Datos                                                   | Uso                               |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| Unitario                        | No requiere (stubs)                      | Fijos en el código                                      | Cada cambio de código, local y CI |
| Integración (API + doble de BD) | No requiere                              | Fijos en el código                                      | Cada _push_                       |
| Aceptación / E2E                | MySQL 8 real (Docker Compose o local)    | Semilla `db:seed` + datos generados con marca de tiempo | Antes de cada entrega             |
| CI (GitHub Actions)             | MySQL 8.4 como servicio del job `e2e`    | Semilla con contraseñas `SEED_*_PASSWORD` deterministas | En cada _push_ y _pull request_   |
| Producción simulada             | Contenedores `docker compose up --build` | Semilla opcional                                        | Verificación de despliegue        |

Los casos E2E crean datos con identificadores únicos (marca de tiempo) para ser **repetibles sin limpiar la base**, y validan valores relativos (stock esperado, acumulados > 0) en lugar de totales absolutos.

---

## 8. Criterios de calidad

### 8.1 Criterios de entrada (Definition of Ready)

1. Historia/regla de negocio con criterios de aceptación explícitos.
2. Código compilable y dependencias instaladas (`npm install`).
3. Datos semilla disponibles para los niveles 2 y 3.
4. API en ejecución con `/api/health` en 200 para las pruebas de aceptación.

### 8.2 Criterios de salida (Definition of Done)

1. **100 % de las pruebas automatizadas en verde** (hoy: 100/100 backend, 37/37 frontend y 21/21 casos de aceptación).
2. Sin defectos de severidad crítica o alta abiertos.
3. Regla financiera nueva o modificada acompañada de su prueba unitaria y su caso E2E.
4. Cobertura por nivel alineada con la pirámide (≈70/20/10; actual 70/17/13).
5. Evidencia adjunta: salida de consola de las suites y, cuando aplique, PDF/XML/CSV de la factura generada.

### 8.3 Criterios de suspensión

Fallo de infraestructura (MySQL inaccesible, contenedor caído), defecto bloqueante en un caso crítico (emisión, inventario o seguridad) o entorno con dependencias incompletas: se detiene la ejecución, se documenta el bloqueo y se reanuda tras corregirlo.

---

## 9. Gestión de defectos

| Severidad | Descripción                                | Ejemplo en el proyecto                                               | Tratamiento                                            |
| --------- | ------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ |
| Crítica   | Afecta integridad financiera o fiscal      | Total de factura mal calculado, stock negativo, CUNE no determinista | Corrección inmediata + prueba de regresión obligatoria |
| Alta      | Afecta seguridad o disponibilidad          | Endpoint sin autorización, token reutilizable tras logout            | Corrección en el ciclo, prueba unitaria + integración  |
| Media     | Degrada funcionalidad sin pérdida de datos | Formato de fecha o moneda incorrecto                                 | Programada con prueba unitaria                         |
| Baja      | Cosmético o de usabilidad                  | Mensaje con texto impreciso                                          | Se acumula para el siguiente ciclo                     |

Los errores del sistema se centralizan en la tabla `errores_sistema` (módulo _Errores_, visible desde el panel administrativo), y cada operación queda auditada en `logs_auditoria`, lo que facilita reconstruir el contexto de un fallo.

---

## 10. Métricas y evidencias

| Métrica                        | Valor actual                                                                  | Objetivo           |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| Casos automatizados totales    | **158** (74 unitarios backend + 37 frontend + 26 integración + 21 aceptación) | ≥ 160              |
| Pruebas del backend aprobadas  | **100/100** (0 fallos)                                                          | 100 %              |
| Pruebas del frontend aprobadas | **37/37** (0 fallos)                                                          | 100 %              |
| Casos de aceptación aprobados  | **21/21** contra API + MySQL reales                                           | 100 %              |
| Distribución por nivel         | 70 % / 16 % / 13 %                                                            | 70 % / 20 % / 10 % |
| Defectos críticos abiertos     | 0                                                                             | 0                  |

**Brechas identificadas y acciones de mejora**

| Brecha                                                                                                                                 | Acción propuesta                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sin medición de cobertura de código                                                                                                    | Incorporar `c8` (Node) y `--coverage` de vitest; meta: 70 % en `utils/`, `middlewares/` y `validators/`                                          |
| Integración limitada al módulo de facturación                                                                                          | Extender a `clientes`, `productos`, `usuarios`, `reportes` y `backup`                                                                            |
| Sin pruebas de rendimiento                                                                                                             | Añadir `k6` (umbral de latencia en `POST /api/facturas`)                                                                                         |
| Sin análisis dinámico de seguridad (pentest/OWASP ZAP)                                                                                 | El pipeline solo ejecuta `npm audit --omit=dev`; un análisis dinámico queda fuera del alcance actual                                              |
| Binarios nativos de esbuild/rolldown ausentes cuando `node_modules` proviene de otra plataforma (Linux de Docker)                      | Ejecutar `npm ci` en el host; se documentó el procedimiento de restauración aditiva de `@esbuild/win32-x64` y `@rolldown/binding-win32-x64-msvc` |
| Inconsistencia cosmética: `formatMoney` devuelve `$ 0` (con espacio de `Intl`) para el cero y `$0` sin espacio en el valor de respaldo | Unificar el espaciado en `formatMoney` (severidad baja, detectada por la prueba `formatMoney tolera valores nulos o no numericos`)               |

---

## 11. Herramientas

| Herramienta                                     | Uso en FacturaExpress                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `node:test` + `node:assert/strict`              | Runner nativo del backend: 100 casos (74 unitarios + 26 de integración)         |
| Doble de MySQL (`require.cache` + traza SQL)    | Integración sin servidor de base de datos                                      |
| `vitest` + `jsdom` (`@angular/build:unit-test`) | Pruebas unitarias de la SPA Angular (37 casos)                                  |
| Script `pruebas-aceptacion.js` (`fetch` nativo) | Certificación funcional E2E (21 casos) con código de salida para CI             |
| Postman                                         | Colección de 47 peticiones para contratos REST y regresión manual (sin Newman en CI) |
| Docker Compose                                  | Entorno reproducible (MySQL 8 + API + nginx)                                   |
| GitHub Actions                                  | Pipeline [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): pruebas del backend, `npm audit --omit=dev`, pruebas y build del frontend y suite de aceptación contra MySQL 8.4 |

---

## 12. Comandos de referencia

```bash
# Todo el proyecto (backend + frontend)
npm test

# Backend (74 unitarias + 26 integración = 100 casos)
npm test --prefix backend
npm run test:unit --prefix backend
npm run test:integracion --prefix backend

# Frontend (vitest: 37 casos)
npm test --prefix frontend -- --watch=false

# Aceptación extremo a extremo (requiere API y MySQL en ejecución)
npm run db:migrate --prefix backend && npm run db:seed --prefix backend
npm run dev --prefix backend        # terminal 1
npm run test:e2e                    # terminal 2

# Entorno completo en contenedores
docker compose up --build
```

---

## 13. Conclusión

La estrategia implementada concentra el esfuerzo en la base de la pirámide (reglas de negocio financieras, validación de estructuras, utilidades de seguridad, login/bloqueo de cuenta e integridad de respaldos con 111 casos automatizados) y reserva la cúspide para 21 casos de aceptación que certifican el flujo completo de emisión de la factura electrónica, incluyendo el cálculo de subtotal, descuento e IVA por tarifa del producto, la atomicidad del inventario, la numeración consecutiva, la generación del CUNE y las descargas XML/PDF/CSV. Con las suites en verde (100/100 en el backend, 37/37 en el frontend y 21/21 en aceptación contra la base de datos real), el proyecto cuenta con una red de seguridad verificable, reproducible y lista para integrarse en un pipeline de integración continua.
