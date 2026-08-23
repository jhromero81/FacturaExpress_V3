/**
 * docs/generar-evidencia.js
 * Genera la evidencia EV02 en PDF (SENA - GA8-220501096).
 * Reproduce la estructura del informe tecnico: portada, enlace del
 * repositorio, documentacion por modulo, informe de pruebas, manual
 * de instalacion y conclusiones.
 *
 * Uso:   node docs/generar-evidencia.js
 * Salida: docs/Evidencia_EV02_Modulos_Integrados_FacturaExpress.pdf
 *
 * Requiere pdfkit (instalado como dependencia del backend).
 */

const path = require('path');
const fs = require('fs');
const PDFDocument = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pdfkit'));

const SALIDA = path.join(__dirname, 'Evidencia_EV02_Modulos_Integrados_FacturaExpress.pdf');

/* ------------------------------------------------------------------ */
/* Paleta y tipografia                                                 */
/* ------------------------------------------------------------------ */
const COLOR_BANDA = '#1A2335';      // banda superior oscura
const COLOR_ACENTO = '#7FD8C8';     // teal institucional
const_COLOR_PLACEHOLDER = null;
const COLOR_SUBTITULO = '#C9D4DE';
const COLOR_TEXTO = '#242930';
const COLOR_GRIS = '#8A94A0';
const COLOR_LINEA = '#DDE3EA';
const COLOR_FONDO_CODIGO = '#F4F6F8';

const MARGEN = 58;
const ANCHO_UTIL = 595.28 - MARGEN * 2;

/* ------------------------------------------------------------------ */
/* Utilidades de composicion                                           */
/* ------------------------------------------------------------------ */
let paginaActual = 0;

function pieDePagina(doc) {
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(COLOR_GRIS).font('Helvetica')
      .text('FacturaExpress V3 - Evidencia EV02', MARGEN, 812, { width: 250, continued: false })
      .text(`Pagina ${i + 1}`, 380, 812, { width: ANCHO_UTIL - 320, align: 'right' });
  }
}

function nuevaPagina(doc) {
  doc.addPage();
}

function asegurarEspacio(doc, alto) {
  if (doc.y + alto > 795) nuevaPagina(doc);
}

function tituloSeccion(doc, texto) {
  asegurarEspacio(doc, 46);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR_BANDA).text(texto, {
    characterSpacing: 0.2,
  });
  doc.moveDown(0.15);
  doc.rect(MARGEN, doc.y, ANCHO_UTIL, 2.2).fill(COLOR_ACENTO);
  doc.moveDown(0.55);
}

function subtitulo(doc, texto) {
  asegurarEspacio(doc, 34);
  doc.moveDown(0.35);
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(COLOR_BANDA).text(texto);
  doc.moveDown(0.28);
}

function parrafo(doc, texto) {
  asegurarEspacio(doc, 40);
  doc.font('Helvetica').fontSize(9.8).fillColor(COLOR_TEXTO).text(texto, { lineGap: 2.4 });
  doc.moveDown(0.32);
}

function vineta(doc, texto) {
  asegurarEspacio(doc, 34);
  doc.font('Helvetica').fontSize(9.8).fillColor(COLOR_TEXTO)
    .text(texto, MARGEN + 12, doc.y, { width: ANCHO_UTIL - 12, lineGap: 2.2 });
  // punto de vineta a la izquierda
  const y = doc.y - doc.heightOfString(texto, { width: ANCHO_UTIL - 12 }) / 2;
  doc.circle(MARGEN + 4, y + 3.4, 1.6).fill(COLOR_ACENTO);
  doc.moveDown(0.18);
}

function bloqueCodigo(doc, lineas) {
  const texto = Array.isArray(lineas) ? lineas.join('\n') : lineas;
  const alto = doc.heightOfString(texto, { width: ANCHO_UTIL - 20, lineGap: 1.2 }) + 16;
  asegurarEspacio(doc, alto + 10);
  const y = doc.y;
  doc.rect(MARGEN, y, ANCHO_UTIL, alto).fill(COLOR_FONDO_CODIGO);
  doc.font('Courier').fontSize(8.6).fillColor('#333B45')
    .text(texto, MARGEN + 10, y + 8, { width: ANCHO_UTIL - 20, lineGap: 1.2 });
  doc.y = y + alto + 10;
}

/** Tabla simple de dos columnas con encabezado y lineas separadoras. */
function tablaDosColumnas(doc, encabezados, filas, anchos) {
  const dibujarFila = (celdas, esEncabezado) => {
    const alturas = celdas.map((c, i) =>
      doc.heightOfString(c, { width: anchos[i] - 8, lineGap: 1.4 }));
    const altoFila = Math.max(...alturas) + (esEncabezado ? 10 : 12);
    asegurarEspacio(doc, altoFila + 4);
    let x = MARGEN;
    celdas.forEach((celda, i) => {
      doc.font(esEncabezado ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(esEncabezado ? 9 : 8.8)
        .fillColor(esEncabezado ? COLOR_BANDA : COLOR_TEXTO)
        .text(celda, x + 4, doc.y, { width: anchos[i] - 8, lineGap: 1.4 });
      x += anchos[i];
    });
    doc.y += altoFila;
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_UTIL, doc.y)
      .lineWidth(0.6).strokeColor(COLOR_LINEA).stroke();
    doc.moveDown(0.12);
  };

  doc.moveDown(0.25);
  doc.rect(MARGEN, doc.y, ANCHO_UTIL, 0).lineWidth(0.6).strokeColor(COLOR_LINEA)
    .moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_UTIL, doc.y).stroke();
  dibujarFila(encabezados, true);
  filas.forEach((fila) => dibujarFila(fila, false));
  doc.moveDown(0.35);
}

/** Bloque [CAPTURA] resaltado para insertar pantallazos. */
function captura(doc, descripcion) {
  const alto = 52;
  asegurarEspacio(doc, alto + 12);
  const y = doc.y;
  doc.rect(MARGEN, y, ANCHO_UTIL, alto).fill('#EEF6F4');
  doc.rect(MARGEN, y, 3, alto).fill(COLOR_ACENTO);
  doc.font('Helvetica-Bold').fontSize(8.8).fillColor(COLOR_BANDA)
    .text('[CAPTURA]', MARGEN + 14, y + 8);
  doc.font('Helvetica-Oblique').fontSize(8.6).fillColor('#5A6672')
    .text(descripcion, MARGEN + 14, y + 24, { width: ANCHO_UTIL - 26 });
  doc.y = y + alto + 12;
}

function parrafoClaveValor(doc, etiqueta, valor) {
  asegurarEspacio(doc, 30);
  const xValor = MARGEN + 110;
  doc.font('Helvetica-Bold').fontSize(9.8).fillColor(COLOR_TEXTO)
    .text(etiqueta, MARGEN, doc.y, { width: 105 });
  doc.font('Helvetica').fontSize(9.8).fillColor(COLOR_TEXTO)
    .text(valor, xValor, doc.y, { width: ANCHO_UTIL - 115, lineGap: 2 });
  doc.moveDown(0.28);
}

/* ------------------------------------------------------------------ */
/* Construcion del documento                                           */
/* ------------------------------------------------------------------ */
const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 54, left: MARGEN, right: MARGEN }, info: { Title: 'FacturaExpress V3 - Evidencia EV02' } });
doc.pipe(fs.createWriteStream(SALIDA));

/* ---------------------------- Portada ----------------------------- */
doc.rect(0, 0, 595.28, 118).fill(COLOR_BANDA);
doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_ACENTO)
  .text('SERVICIO NACIONAL DE APRENDIZAJE - SENA', MARGEN, 24, { characterSpacing: 1.2 });
doc.font('Helvetica-Bold').fontSize(24).fillColor('#FFFFFF')
  .text('FacturaExpress V3', MARGEN, 48);
doc.font('Helvetica').fontSize(11).fillColor(COLOR_SUBTITULO)
  .text('Sistema de facturacion electronica con Angular y Node.js', MARGEN, 84);

doc.y = 140;
doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR_ACENTO)
  .text('GA8-220501096 - AA1 - EV02: Modulos integrados para la construccion del software', {
    width: ANCHO_UTIL,
  });

doc.moveDown(0.9);
parrafoClaveValor(doc, 'Aprendiz:', 'Jhon Henry Romero');
parrafoClaveValor(doc, 'Programa:', 'Analisis y Desarrollo de Software');
parrafoClaveValor(doc, 'Evidencia:', 'EV02 - Aplicacion web integrada (frontend + backend) y documentacion');
parrafoClaveValor(doc, 'Fecha:', 'Agosto de 2026');

doc.moveDown(0.4);
bloqueCodigo(doc, [
  'Repositorio del proyecto',
  'https://github.com/jhromero81/FacturaExpress_V3.git',
]);
captura(doc, 'Pantallazo sugerido: pagina principal del repositorio en GitHub mostrando el nombre, la descripcion y las carpetas del proyecto.');

/* --------------------- 1. Repositorio GitHub ---------------------- */
tituloSeccion(doc, '1. Enlace del repositorio GitHub');

subtitulo(doc, '1.1 Repositorio remoto');
parrafoClaveValor(doc, 'URL de clonacion:', 'https://github.com/jhromero81/FacturaExpress_V3.git');
parrafoClaveValor(doc, 'Rama principal:', 'main');
parrafoClaveValor(doc, 'Control de versiones:', 'Git con historial de commits por funcionalidad');
parrafo(doc, 'El proyecto se gestiona con Git desde la fase inicial de codificacion. Cada modulo se integro mediante commits descriptivos y el repositorio remoto en GitHub sirve como respaldo central y mecanismo de entrega continua.');

subtitulo(doc, '1.2 Estructura del repositorio');
bloqueCodigo(doc, [
  'FacturaExpress_V3/',
  '|-- backend/                 API REST Node.js + Express + MySQL',
  '|   |-- routes/ controllers/ services/ middleware/ validators/',
  '|   |-- config/ scripts/ test/ utils/        (setup DB, migraciones, seed)',
  '|   `-- package.json                         (scripts start/dev/test/db:*)',
  '|-- frontend/                Aplicacion web Angular 22 (standalone)',
  '|   |-- src/app/core/                        (API, auth, guards, interceptor, render)',
  '|   |-- src/app/features/                    (12 modulos funcionales)',
  '|   |-- proxy.conf.json                      (/api -> http://localhost:4000)',
  '|   `-- dist/                                paquete de compilacion',
  '|-- postman/collections/     Coleccion Postman v2.1 (56 peticiones)',
  '|-- docs/                    Documentacion y evidencias',
  '`-- README.md                Documentacion tecnica general',
]);
captura(doc, 'Pantallazo sugerido: vista del explorador de archivos o de GitHub mostrando el arbol de carpetas del repositorio.');

subtitulo(doc, '1.3 Instrucciones de clonado y ejecucion rapida');
bloqueCodigo(doc, [
  'git clone https://github.com/jhromero81/FacturaExpress_V3.git',
  '',
  '# Backend (puerto 4000)',
  'cd FacturaExpress_V3/backend',
  'npm install',
  'copy .env.example .env      (y completar credenciales MySQL)',
  'npm run db:setup            (crea la base de datos)',
  'npm run db:migrate          (crea tablas)',
  'npm run db:seed             (datos iniciales de prueba)',
  'npm run dev                 (API en http://localhost:4000)',
  '',
  '# Frontend (puerto 4200, proxia /api hacia 4000)',
  'cd ../frontend',
  'npm install',
  'npm start                   (http://localhost:4200)',
]);
captura(doc, 'Pantallazo sugerido: terminal con la salida de git clone y npm install exitosos en ambas carpetas.');

/* --------------- 2. Documentacion tecnica por modulo --------------- */
tituloSeccion(doc, '2. Documentacion tecnica por modulo implementado');

subtitulo(doc, '2.1 Arquitectura general de la solucion');
bloqueCodigo(doc, [
  '+----------------------+       +-----------------------+       +-----------+',
  '|  FRONTEND Angular 22 |  /api |  BACKEND Express 4    |  SQL  |  MySQL 8  |',
  '|  SPA standalone      | ----> |  API REST + JWT       | ----> |  10+ tablas|',
  '|  http://localhost:4200| proxy|  http://localhost:4000|       |           |',
  '+----------------------+       +-----------------------+       +-----------+',
]);
parrafo(doc, 'La aplicacion web completa integra un frontend Angular 22 (componentes standalone, signals, router con lazy loading) con el backend REST Express ya desarrollado. En desarrollo, el dev-server de Angular redirige las peticiones /api al puerto 4000 mediante proxy.conf.json, lo que mantiene todo bajo el mismo origen y evita configuraciones CORS adicionales.');
vineta(doc, 'Autenticacion: POST /api/auth/login devuelve un JWT que el backend fija como cookie httpOnly; ademas el interceptor HTTP del frontend adjunta la cabecera Authorization: Bearer cuando existe token guardado.');
vineta(doc, 'Autorizacion por roles: guards de ruta (authGuard y adminGuard) en el frontend y middleware authorize("admin") en el backend para los modulos administrativos.');
vineta(doc, 'Renderizado reactivo: el servicio ServicioRender (core/render.service.ts) registra la vista del modulo activo y, tras cada respuesta HTTP, ejecuta markForCheck() mas un ciclo de deteccion de cambios, garantizando que los datos aparezcan sin requerir interaccion del usuario.');
vineta(doc, 'Persistencia: transacciones atomicas para ventas (factura + items + descuento de stock), CUNE SHA-256 por factura y bitacora de auditoria de cada operacion.');

subtitulo(doc, '2.2 Mapa de modulos de la aplicacion integrada');
tablaDosColumnas(
  doc,
  ['Modulo (ruta Angular)', 'Funcionalidad principal', 'Endpoints consumidos'],
  [
    ['/login', 'Inicio de sesion con validacion y manejo de errores', 'POST /auth/login'],
    ['/dashboard', 'KPIs, grafico semanal y ultimas transacciones', '/reportes/kpis, /ventas-semanales, /ultimas-transacciones'],
    ['/ventas', 'Punto de venta: carrito, descuento y finalizacion', 'GET clientes-productos, POST /facturas'],
    ['/facturas', 'Listado con filtros, paginacion y descargas', 'GET /facturas, GET /facturas/:id/{pdf,xml,csv}'],
    ['/facturas/:id', 'Detalle, flujo DIAN (estado/firma/CUNE)', 'GET /facturas/:id, PUT /facturas/:id/estado'],
    ['/clientes', 'CRUD de clientes con busqueda', 'GET/POST/PUT/DELETE /clientes'],
    ['/productos', 'CRUD de productos y ajuste de inventario', 'GET/POST/PUT/DELETE/PATCH /productos'],
    ['/reportes', 'Comparativo periodos, top productos e historial', '/reportes/ventas-periodo, productos-top, historial, pdf'],
    ['/configuracion', 'Empresa emisora, resolucion DIAN y sincronizacion', 'GET/PUT /configuracion, POST /configuracion/dian/sync'],
    ['/usuarios (admin)', 'Gestion de cuentas y roles del sistema', 'GET/POST/PUT/PATCH/DELETE /usuarios'],
    ['/errores (admin)', 'Monitoreo y marcado de errores internos', 'GET /errores, PATCH /errores/:id/resolver'],
    ['/auditoria (admin)', 'Bitacora de operaciones por usuario/tabla/IP', 'GET /logs'],
    ['/backup (admin)', 'Creacion, descarga, restauracion y borrado', 'GET/POST/DELETE /backup, POST /backup/restaurar'],
  ],
  [128, 210, 151]
);
captura(doc, 'Pantallazo sugerido: pantalla de inicio de sesion (login) con el diseno de la aplicacion.');

subtitulo(doc, '2.3 Modulo de autenticacion y seguridad');
vineta(doc, 'Login contra /api/auth/login; contrasenas almacenadas con hash bcrypt.');
vineta(doc, 'Sesion restaurada al recargar consultando /api/auth/me; cierre de sesion invalida el token en el servidor.');
vineta(doc, 'Interceptor HTTP global (tokenInterceptor) que agrega Bearer token y redirige al login ante cualquier 401.');
vineta(doc, 'Backend con helmet, rate-limit, express-validator y manejo centralizado de errores.');
captura(doc, 'Pantallazo sugerido: dashboard cargado tras iniciar sesion, con las tarjetas de KPIs visibles.');

subtitulo(doc, '2.4 Modulo de ventas (punto de venta) y facturacion');
vineta(doc, 'Seleccion de cliente, agregado de productos validando existencias y descuento porcentual (0-100%).');
vineta(doc, 'Totales calculados igual que el servidor: subtotal, descuento, IVA 19% sobre base gravable y total.');
vineta(doc, 'Al finalizar, el backend genera numero consecutivo y CUNE, descuenta stock en transaccion atomica y deja la factura pendiente ante la DIAN.');
vineta(doc, 'Descarga comprobable en tres formatos: PDF (documento soporte), XML DIAN y CSV de reporte.');
captura(doc, 'Pantallazo sugerido: pantalla de Nueva venta con productos en el carrito y totales calculados.');
captura(doc, 'Pantallazo sugerido: detalle de una factura emitida mostrando CUNE y botones PDF/XML/CSV.');

subtitulo(doc, '2.5 Modulo de clientes y productos');
vineta(doc, 'Clientes: creacion, edicion, busqueda incremental y eliminacion logica; validaciones de campos obligatorios y correo.');
vineta(doc, 'Productos: catalogo con precio, tarifa de IVA (0/5/19%) e inventario; ajuste de stock (+/-) con PATCH /productos/:id/stock.');
vineta(doc, 'Ambos listados muestran insignias de estado (stock critico/bajo/ok) y mensajes de confirmacion.');
captura(doc, 'Pantallazo sugerido: listado de clientes y modal de creacion de cliente.');
captura(doc, 'Pantallazo sugerido: listado de productos con el modal de ajuste de stock abierto.');

subtitulo(doc, '2.6 Modulo de reportes y configuracion fiscal');
vineta(doc, 'Reportes: comparativo de ventas del periodo actual vs anterior (semanal/mensual/trimestral/anual), top 5 de productos mas vendidos y generacion de reporte PDF con historial persistido.');
vineta(doc, 'Configuracion: datos de la empresa emisora (NIT, razon social, email, telefono), resolucion DIAN, vigencia del certificado y boton de sincronizacion con la DIAN que actualiza ultima_sync.');
captura(doc, 'Pantallazo sugerido: vista de reportes con grafico comparativo y tabla de productos top.');
captura(doc, 'Pantallazo sugerido: pantalla de configuracion tras ejecutar la sincronizacion DIAN.');

subtitulo(doc, '2.7 Modulos administrativos (solo rol admin)');
vineta(doc, 'Usuarios: alta/edicion con roles (admin, vendedor, contador), activacion/desactivacion y eliminacion protegida.');
vineta(doc, 'Errores del sistema: KPIs resueltos/sin resolver, filtros por tipo (firma, dian, bd, correo) y marcado de resolucion.');
vineta(doc, 'Auditoria: bitacora con usuario, accion, tabla afectada, registro e IP de origen.');
vineta(doc, 'Backup: creacion de respaldos SQL, descarga, restauracion con doble confirmacion y eliminacion.');
captura(doc, 'Pantallazo sugerido: gestion de usuarios con el modal de nuevo usuario.');
captura(doc, 'Pantallazo sugerido: vistas de errores, auditoria y backup del sistema.');

subtitulo(doc, '2.8 Paquete de compilacion del frontend (Angular)');
bloqueCodigo(doc, [
  'cd frontend',
  'npm run build            (produccion)',
  '',
  'Salida:',
  'dist/facturaexpress-frontend/browser/',
  '|-- index.html',
  '|-- main-*.js            bundle inicial (~112 kB / ~29 kB gzip;',
  '|                        total inicial ~354 kB / ~99 kB gzip)',
  '|-- chunk-*.js           chunks diferidos por modulo (lazy loading)',
  '`-- styles-*.css         sistema de diseno global',
]);
parrafo(doc, 'El build de produccion compila sin errores ni advertencias. Los componentes se cargan de forma diferida (loadComponent), generando chunks independientes por modulo, lo que optimiza la carga inicial de la aplicacion.');
captura(doc, 'Pantallazo sugerido: terminal con el resultado de ng build mostrando los chunks y el mensaje Application bundle generation complete.');

/* ----------------- 3. Informe de pruebas de software ---------------- */
tituloSeccion(doc, '3. Informe de las pruebas de software realizadas');

subtitulo(doc, '3.1 Pruebas unitarias (node --test)');
parrafo(doc, 'El backend incluye una suite de pruebas unitarias nativas de Node.js sobre las utilidades criticas: generacion del CUNE (SHA-256 determinista), helpers de formato y calculo de IVA, firma/verificacion de JWT, middleware de validacion y reglas de negocio de los validadores de entrada.');
bloqueCodigo(doc, [
  'cd backend',
  'npm test',
  '',
  'Resultado: 40 pruebas unitarias OK en 5 archivos',
  '  cune.test.js  helpers.test.js  jwt.test.js  validate.test.js  validators.test.js',
]);
captura(doc, 'Pantallazo sugerido: terminal con la ejecucion de npm test mostrando los 40 tests aprobados.');

subtitulo(doc, '3.2 Pruebas de integracion de la API (Postman / Newman)');
parrafo(doc, 'La coleccion postman/collections/FacturaExpress-API-Express.postman_collection.json cubre los 12 modulos del backend con 56 peticiones y 91 aserciones automatizadas (codigos HTTP, esquema JSON, persistencia en base de datos, seguridad y casos negativos).');
bloqueCodigo(doc, [
  'npx newman run postman/collections/FacturaExpress-API-Express.postman_collection.json \\',
  '  -e postman/environment.json --reporters cli,json',
]);
tablaDosColumnas(
  doc,
  ['Peticiones ejecutadas', 'Aserciones evaluadas', 'Fallos'],
  [['56', '91', '0']],
  [170, 180, 139]
);
captura(doc, 'Pantallazo sugerido: resumen final de Newman mostrando iterations/requests/assertions y 0 failures.');

subtitulo(doc, '3.3 Verificacion end-to-end frontend <-> backend');
parrafo(doc, 'Prueba integral ejecutada con el dev-server de Angular (puerto 4200) y su proxy hacia la API (puerto 4000), replicando exactamente las peticiones que emite el navegador. Adicionalmente se verifico el build de produccion servido estaticamente en http://localhost:3000 con un proxy /api hacia el backend:');
tablaDosColumnas(
  doc,
  ['Escenario verificado', 'Resultado'],
  [
    ['Login por proxy con cookie httpOnly + rol admin', 'OK'],
    ['KPIs del dashboard (facturas emitidas, ventas)', 'OK'],
    ['Listados de clientes (8) y productos (10)', 'OK'],
    ['Venta POS: subtotal 325.000, descuento 10% (32.500), IVA 55.575, total 348.075', 'OK'],
    ['Descuento atomico de stock (-1 y -2 unidades)', 'OK'],
    ['Detalle de factura con CUNE generado', 'OK'],
    ['Descarga PDF (2.351 B), XML (956 B) y CSV (304 B)', 'OK'],
    ['Cambio de estado DIAN: enviada, firma firmada, 1 intento', 'OK'],
    ['Endpoints admin: usuarios (9), errores, logs (61), backups (2)', 'OK'],
    ['Endpoints reportes: periodo, top, historial y PDF (2.211 B)', 'OK'],
    ['Renderizado automatico de datos en los 11 modulos navegables sin interaccion del usuario (verificacion con navegador headless)', 'OK'],
    ['Graficos SVG funcionales: ventas semanales (7 barras) y comparativo por periodos con cambio Semanal/Mensual/Anual', 'OK'],
  ],
  [330, 159]
);
parrafo(doc, 'Los calculos de la venta de prueba coinciden con la logica del servidor (descuento porcentual sobre el subtotal e IVA del 19% sobre la base gravable), confirmando la consistencia entre frontend y backend. La verificacion de renderizado confirma el correcto funcionamiento de ServicioRender y el backend XHR de HttpClient.');
captura(doc, 'Pantallazo sugerido: navegador mostrando la factura creada y su PDF descargado.');

/* ------------- 4. Manual tecnico de instalacion -------------------- */
tituloSeccion(doc, '4. Manual tecnico de instalacion y ejecucion');

subtitulo(doc, '4.1 Requisitos previos');
vineta(doc, 'Node.js 20 o superior (verificado con v26.7.0) y npm 10+.');
vineta(doc, 'MySQL Server 8.x en ejecucion local con usuario con permisos de creacion de bases de datos.');
vineta(doc, 'Opcional para pruebas de API: Postman o Newman (npx newman).');

subtitulo(doc, '4.2 Configuracion del backend');
parrafo(doc, 'Crear el archivo backend/.env a partir de .env.example con los valores correspondientes:');
bloqueCodigo(doc, [
  'PORT=4000',
  'CORS_ORIGIN=http://localhost:4200',
  'DB_HOST=localhost',
  'DB_PORT=3306',
  'DB_USER=root',
  'DB_PASSWORD=<su-clave-mysql>',
  'DB_NAME=facturaexpress_apirest',
  'JWT_SECRET=<frase-secreta-larga>',
  'JWT_EXPIRES_IN=8h',
]);

subtitulo(doc, '4.3 Base de datos, migraciones y datos iniciales');
bloqueCodigo(doc, [
  'cd backend',
  'npm run db:setup        crea la base facturaexpress_apirest',
  'npm run db:migrate      crea tablas (empresa, usuarios, clientes, productos,',
  '                        facturas, factura_items, logs_auditoria, errores_sistema,',
  '                        backups, reportes)',
  'npm run db:seed         carga empresa demo, usuarios, clientes y catalogo',
]);
parrafo(doc, 'Usuario administrador de demostracion creado por el seed: NIT 900.123.456-7, contrasena admin123.');

subtitulo(doc, '4.4 Ejecucion de la aplicacion integrada');
bloqueCodigo(doc, [
  '# Terminal 1 - API REST (http://localhost:4000/api/health para validar)',
  'cd backend && npm run dev        (nodemon, recarga automatica)',
  '',
  '# Terminal 2 - Frontend Angular (http://localhost:4200)',
  'cd frontend && npm start         (dev-server con proxy /api -> 4000)',
]);
parrafo(doc, 'Abrir http://localhost:4200 e iniciar sesion con el usuario demo. El menu lateral muestra los modulos principales para todos los roles y la seccion de administracion solo para el perfil admin.');

subtitulo(doc, '4.5 Compilacion de produccion');
bloqueCodigo(doc, [
  'cd frontend',
  'npm run build',
  '-> dist/facturaexpress-frontend/browser   (paquete estatico listo para publicar)',
]);

subtitulo(doc, '4.6 Solucion de problemas frecuentes');
vineta(doc, 'Error ECONNREFUSED al iniciar el backend: verificar que MySQL este activo y las credenciales del .env sean correctas.');
vineta(doc, 'Puerto 4000 o 4200 ocupado: liberar el proceso (Get-Process node / netstat -ano) o cambiar PORT en .env / --port en ng serve.');
vineta(doc, 'npm no instala dependencias del frontend (politica allow-scripts de npm 11): el package.json del frontend ya incluye la seccion allowScripts con esbuild/rollup; usar npm install dentro de frontend/.');
vineta(doc, 'Respuestas 401 tras mucho tiempo de inactividad: la sesion expiro (JWT 8h); volver a iniciar sesion.');
vineta(doc, 'Datos antiguos o pantalla incompleta tras actualizar el frontend: recargar con Ctrl+F5; el index.html se entrega sin cache y los assets hasheados se sirven como inmutables.');
vineta(doc, 'No se descarga el PDF/XML/CSV: confirmar que el backend este corriendo y que la factura exista; revisar la pestana de red del navegador.');

/* ------------------------- Conclusiones ---------------------------- */
tituloSeccion(doc, 'Conclusiones');
vineta(doc, 'La aplicacion web queda completamente funcional e integrada: 12 modulos de interfaz Angular consumiendo los servicios REST reales del backend con persistencia en MySQL.');
vineta(doc, 'Las tres capas de verificacion (unitarias, integracion de API y end-to-end) reportan resultados satisfactorios: 40/40 pruebas unitarias, 91 aserciones sin fallos y los flujos de negocio verificados en el navegador.');
vineta(doc, 'El renderizado de datos es automatico en todos los modulos (ServicioRender + backend XHR), verificado con navegador headless sin interaccion del usuario.');
vineta(doc, 'El repositorio GitHub documenta la evolucion del software y contiene el paquete de compilacion del frontend requerido por la evidencia (frontend/dist).');

/* --------------------------- Cierre -------------------------------- */
pieDePagina(doc);
doc.end();
console.log('PDF generado en:', SALIDA);
