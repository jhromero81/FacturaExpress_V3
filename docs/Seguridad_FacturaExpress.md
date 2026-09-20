# Seguridad de FacturaExpress — Modelo de amenazas y controles

Documento complementario de la auditoría registrada en [`plans/auditoria-seguridad-backend.md`](../plans/auditoria-seguridad-backend.md).
Describe los activos protegidos, las amenazas consideradas, los controles implementados y la configuración recomendada de producción.

---

## 1. Alcance y activos protegidos

| Activo                    | Descripción                               | Impacto si se compromete                        |
| ------------------------- | ----------------------------------------- | ----------------------------------------------- |
| Credenciales de usuario   | NIT + contraseña (hash bcrypt)            | Suplantación de identidad, acceso a facturación |
| Sesiones JWT              | Token firmado en cookie httpOnly          | Acceso no autorizado a la API                   |
| Datos de facturación      | Facturas, ítems, clientes, productos      | Alteración de registros fiscales                |
| Configuración fiscal DIAN | Resolución, certificado, datos de empresa | Emisión irregular de documentos                 |
| Respaldos SQL             | Volcados completos de la base             | Divulgación total de datos                      |
| Bitácoras                 | Auditoría y errores del sistema           | Pérdida de trazabilidad forense                 |

---

## 2. Amenazas consideradas y controles

| Amenaza (OWASP)                  | Control implementado                                                                                                            | Evidencia                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A01 Control de acceso            | Matriz de permisos por rol aplicada en las rutas; el rol efectivo y el estado `activo` se releen de la base de datos con caché de 60 s (invalidada al cambiar rol, activar/desactivar o eliminar la cuenta) | `backend/routes/*.routes.js`, `backend/middleware/auth.js`                         |
| A02 Fallos criptográficos        | bcrypt con coste 12 y política de contraseñas; JWT HS256 con emisor y audiencia exigidos; secreto obligatorio en producción, de mínimo 32 caracteres y distinto del valor de ejemplo | `backend/config/jwt.js`, `backend/config/password.js`, `backend/controllers/usuarios.controller.js` |
| A03 Inyección                    | Consultas parametrizadas en todos los módulos; `extended: false` en el parseo de formularios                                    | `backend/controllers/*.controller.js`, `backend/server.js`                          |
| A04 diseño insegura              | Endurecimiento en capas: contenido, sesión, autorización y red                                                                  | `backend/middleware/auth.js`, `backend/middleware/security.js`, `backend/middleware/errorHandler.js`, `backend/middleware/validate.js`, `backend/config/jwt.js`, `backend/config/password.js` |
| A05 Configuración insegura       | Helmet, CSP en nginx (con excepción para `fonts.googleapis.com` y `fonts.gstatic.com`), HSTS con TLS y una sola puerta de entrada (nginx); la API no publica el puerto 4000 | `backend/server.js`, `frontend/nginx.conf`, `frontend/nginx-ssl.conf`, `backend/Dockerfile`, `docker-compose.yml` |
| A06 Componentes vulnerables      | Auditoría de dependencias de producción en el pipeline de integración continua                                                  | `.github/workflows/ci.yml` (`npm audit --omit=dev`)                                 |
| A07 Fallos de identificación     | Límite de 5 intentos/15 min por IP en el login y bloqueo de la cuenta tras 5 fallos (HTTP 423); cupo anónimo de 120/min y autenticado de 600/min que solo se aplica con firma JWT válida; política de contraseñas | `backend/middleware/security.js`, `backend/config/password.js`                     |
| A08 Integridad de datos/software | Checksum SHA-256 registrado en la tabla `backups` y verificado al restaurar; respaldos en directorio 0700 y archivos 0600; auditoría de operaciones críticas; neutralización de inyección CSV y escape de HTML en el correo de la factura | `backend/services/backup.service.js`, `backend/utils/auditoria.js`                  |
| A09 Registro y monitoreo         | Auditoría de negocio y eventos de seguridad con IP real; manejo centralizado de errores                                          | `backend/utils/auditoria.js`, `backend/middleware/security.js`, `backend/middleware/errorHandler.js` |
| A10 SSRF                         | La API no realiza peticiones salientes a URLs indicadas por el usuario                                                          | —                                                                                   |

### 2.1 Controles verificados ejecutando la API contra MySQL 8.4

| #  | Control                                                                                                                                                          | Evidencia                                                       |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1  | Numeración de facturas con la tabla `secuencias_facturas` (`INSERT ... ON DUPLICATE KEY UPDATE`) bajo _advisory lock_ y transacción. Antes, `COUNT(*)+1`: eliminar una factura provocaba clave duplicada (HTTP 500) y podía reutilizar números fiscales | `backend/controllers/facturas.controller.js`, `backend/scripts/migrate.js` |
| 2  | `PUT /api/facturas/:id/estado` funcionaba solo para `enviada`; `pendiente` y `rechazada` devolvían 500. Corregido, y `intentos_dian` se acumula                       | `backend/controllers/facturas.controller.js`, `backend/test/integracion/facturas.api.test.js` |
| 3  | IVA por tarifa del producto (0, 0,05 y 0,19) y detalle que cuadra con la cabecera aunque exista descuento                                                         | `backend/utils/helpers.js`, `backend/test/integracion/facturas.api.test.js` |
| 4  | Límite de peticiones: el cupo autenticado (600/min) solo se aplica si la **firma** del JWT es válida; antes bastaba un `Authorization: Bearer x` inventado para saltar el límite anónimo de 120/min. El login mantiene 5 intentos/15 min por IP y bloqueo de la cuenta tras 5 fallos (`usuarios.bloqueado_hasta`, respuesta 423) | `backend/middleware/security.js`, `backend/test/login.test.js`  |
| 5  | JWT: se firman y se **exigen** emisor (`JWT_ISSUER`) y audiencia (`JWT_AUDIENCE`); el secreto es obligatorio en producción, de mínimo 32 caracteres y distinto del valor de ejemplo | `backend/config/jwt.js`, `backend/test/jwt.test.js`             |
| 6  | El rol **no** se toma del token: se relee de la base de datos junto con `activo` (caché de 60 s, invalidada al cambiar rol, activar/desactivar o eliminar una cuenta). Una cuenta inactiva o eliminada responde 401 (antes 403, que dejaba la sesión atascada en el cliente) | `backend/middleware/auth.js`                                    |
| 7  | Contraseñas: bcrypt con coste 12, mínimo 8 caracteres con minúscula, mayúscula y dígito; el login compara siempre contra un hash señuelo cuando el NIT no existe (evita enumeración por tiempo) y devuelve el mismo mensaje para credenciales inválidas, cuenta inactiva o inexistente | `backend/config/password.js`, `backend/controllers/auth.controller.js`, `backend/test/login.test.js` |
| 8  | El token del login solo viaja en el cuerpo si el cliente envía `X-Token-Response: true`; el frontend usa la cookie `httpOnly` (`SameSite=Lax`, `Secure` en producción) | `backend/controllers/auth.controller.js`, `frontend/src/app/core/*` |
| 9  | Respaldos: directorio 0700 y archivos 0600, huella SHA-256 registrada en la tabla `backups` y verificada al restaurar (rechaza archivos alterados o no registrados), credenciales DDL separadas con `DB_RESTORE_USER`/`DB_RESTORE_PASSWORD` y vaciado de `tokens_revocados` tras restaurar para forzar un nuevo inicio de sesión | `backend/services/backup.service.js`, `backend/test/backup.test.js` |
| 10 | Endurecimiento de datos: ENUM para rol y firma_estado, `CHECK (stock >= 0)`, `UNIQUE` en `backups.archivo`, índices `reportes.created_at` y `tokens_revocados.expira_en`, charset utf8mb4 explícito | `backend/scripts/migrate.js`                                    |
| 11 | Inyección CSV neutralizada en las exportaciones (una celda que no es un número y empieza por `=`, `+`, `@`, tabulador o menos se prefija con comilla simple) y escape de HTML en el cuerpo del correo de la factura | `backend/utils/helpers.js`, `backend/controllers/facturas.controller.js` |
| 12 | CSP de nginx: autoriza `fonts.googleapis.com` y `fonts.gstatic.com` (el `index.html` carga de allí Roboto, Space Mono y Material Icons); sin esas excepciones el navegador bloqueaba los iconos y las tipografías en el despliegue con Docker. **No se autoalojan las fuentes** | `frontend/nginx.conf`, `frontend/nginx-ssl.conf`, `frontend/src/index.html` |
| 13 | La API no publica el puerto 4000 en Docker Compose (solo nginx es punto de entrada) para que no se pueda saltar el proxy y falsificar `X-Forwarded-For` con `TRUST_PROXY=1` | `docker-compose.yml`                                            |

---

## 3. Ciclo de vida de la sesión

1. **Inicio de sesión**: `POST /api/auth/login` valida NIT y contraseña; si el NIT no existe compara contra un hash señuelo y responde el mismo mensaje que ante credenciales inválidas. Tras 5 fallos bloquea la cuenta (`usuarios.bloqueado_hasta`) y responde 423. Registra el evento (éxito, fallo o cuenta inactiva) y emite un JWT con `jti`.
2. **Entrega del token**: la cookie `httpOnly` (`SameSite=Lax`, `Secure` en producción) es el mecanismo principal. El token solo se incluye en el cuerpo si el cliente lo pide con `X-Token-Response: true` (clientes externos como Postman o integraciones).
3. **Validación**: en cada petición se verifica firma (HS256), emisor, audiencia, vigencia, `jti` no revocado, y el rol y el estado `activo` releídos de la base de datos (caché de 60 s).
4. **Invalidación**:
   - _Individual_: el logout registra el `jti` en `tokens_revocados`.
   - _Masiva_: cambiar el rol, activar/desactivar o eliminar una cuenta invalida la caché de autorización. Una cuenta inactiva o eliminada responde 401.
   - _Tras restaurar un respaldo_: se vacía `tokens_revocados`, lo que fuerza un nuevo inicio de sesión.
5. **Cierre**: `POST /api/auth/logout` revoca el token y limpia la cookie.

---

## 4. Matriz de permisos por rol

| Recurso                             | admin | vendedor | contador |
| ----------------------------------- | ----- | -------- | -------- |
| Clientes (lectura)                  | Sí    | Sí       | Sí       |
| Clientes (alta/edición)             | Sí    | Sí       | No       |
| Clientes (eliminación)              | Sí    | No       | No       |
| Productos (lectura)                 | Sí    | Sí       | Sí       |
| Productos (alta/edición/stock/baja) | Sí    | No       | No       |
| Facturas (consulta y descargas)     | Sí    | Sí       | Sí       |
| Facturas (emisión)                  | Sí    | Sí       | No       |
| Facturas (cambio de estado DIAN)    | Sí    | No       | Sí       |
| Facturas (eliminación)              | Sí    | No       | No       |
| Reportes y dashboard                | Sí    | Sí       | Sí       |
| Configuración (escritura)           | Sí    | No       | No       |
| Usuarios, errores, logs, respaldos  | Sí    | No       | No       |

---

## 5. Configuración recomendada de producción

### 5.1 Variables de entorno obligatorias

```env
NODE_ENV=production
JWT_SECRET=<cadena aleatoria de al menos 32 caracteres, distinta del ejemplo>
JWT_ISSUER=facturaexpress-api
JWT_AUDIENCE=facturaexpress-web
CORS_ORIGIN=https://facturacion.midominio.com,https://app.midominio.com
TRUST_PROXY=1
BACKUP_DIR=/var/backups/facturaexpress
DB_RESTORE_USER=<usuario con privilegios DDL solo para restauracion>
DB_RESTORE_PASSWORD=<clave fuerte>
SEED_ADMIN_PASSWORD=<clave del seed para el administrador>
SEED_VENDEDOR_PASSWORD=<clave del seed para el vendedor>
SEED_CONTADOR_PASSWORD=<clave del seed para el contador>
```

Notas:

- `CORS_ORIGIN` admite varios orígenes separados por coma.
- `BACKUP_DIR` define el directorio de respaldos (por defecto `<tmp>/facturaexpress_backups`).
- Si `DB_RESTORE_USER`/`DB_RESTORE_PASSWORD` se dejan vacías, la restauración reutiliza las credenciales de runtime.
- Las variables `SEED_*_PASSWORD` solo se usan al ejecutar el seed; si no se definen, el seed genera contraseñas aleatorias (mínimo 8 caracteres con minúscula, mayúscula y dígito) y las muestra **una sola vez**.

### 5.2 TLS

Active [`frontend/nginx-ssl.conf`](../frontend/nginx-ssl.conf) montándola sobre `/etc/nginx/conf.d/default.conf` con los certificados en `/etc/nginx/certs`. La variante incluye HSTS y redirección de 80 → 443. Con HTTPS activo, la cookie `Secure` viaja correctamente y la API recibe `X-Forwarded-Proto: https`.

### 5.3 Base de datos con privilegios mínimos

- Usuario de runtime: `SELECT, INSERT, UPDATE, DELETE` sobre la base de la aplicación.
- Usuario de restauración (`DB_RESTORE_USER`): privilegios DDL, usado solo por el módulo de respaldos.
- No existe un servicio de inicialización separado: las migraciones se ejecutan en el propio servicio `api` de Docker Compose con `command: sh -c "node scripts/seed.js && node scripts/migrate.js && node server.js"`.

### 5.4 Escalado horizontal

`express-rate-limit` usa almacén en memoria: con varias réplicas debe configurarse un almacén compartido (Redis mediante `rate-limit-redis`) para que los límites sean globales.

---

## 6. Operación y verificación continua

| Actividad                          | Comando / procedimiento                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Pruebas del backend                | `npm test --prefix backend` (100 casos: 74 unitarios + 26 de integración)                                   |
| Pruebas del frontend               | `npm test --prefix frontend -- --watch=false` (37 casos)                                                   |
| Pruebas de aceptación              | `npm run test:e2e` (21 casos; requiere API + MySQL y `E2E_PASSWORD`/`E2E_VENDEDOR_PASSWORD`)               |
| Auditoría de dependencias          | `npm audit --omit=dev` en `backend/` y `frontend/` (ejecutada en el pipeline)                              |
| Integración continua               | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): pruebas backend, auditoría, pruebas y build del frontend y aceptación contra MySQL 8.4 |
| Revisión de eventos de seguridad   | Filtrar `logs_auditoria` por `tabla_afectada = 'seguridad'`                                                |

---

## 7. Riesgos aceptados

| Riesgo                                                  | Justificación                                                                        | Mitigación adicional sugerida                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Sin pentest dinámico ni análisis OWASP ZAP              | No se ejecutó análisis dinámico tipo pentest; queda fuera del alcance actual          | Ejecutar OWASP ZAP contra un entorno de pruebas                   |
| Rate limit en memoria                                   | Suficiente para una sola instancia                                                   | Almacén compartido si se escala                                   |
| Sin flujo de autorestablecimiento de contraseña         | No está implementado; las contraseñas se definen en el seed o las administra un admin | Implementar flujo con token de un solo uso                        |
| Protección CSRF apoyada solo en `SameSite=Lax`          | No hay token CSRF de doble envío                                                     | Añadir doble envío de token si se requieren cookies _cross-site_  |
