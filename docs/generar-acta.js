/**
 * docs/generar-acta.js
 * Genera el acta de aplicacion de pruebas y aceptacion en PDF
 * (SENA - GA8-220501096-AA1-EV02, criterio 5 de la lista de chequeo).
 *
 * Uso:   node docs/generar-acta.js
 * Salida: docs/Acta_Pruebas_Aceptacion_FacturaExpress.pdf
 *
 * Requiere pdfkit (instalado como dependencia del backend).
 */

const path = require('path');
const fs = require('fs');
const PDFDocument = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pdfkit'));

const SALIDA = path.join(__dirname, 'Acta_Pruebas_Aceptacion_FacturaExpress.pdf');

/* ------------------------------------------------------------------ */
/* Paleta y tipografia (identica a la evidencia EV02)                  */
/* ------------------------------------------------------------------ */
const COLOR_BANDA = '#1A2335';
const COLOR_ACENTO = '#7FD8C8';
const COLOR_SUBTITULO = '#C9D4DE';
const COLOR_TEXTO = '#242930';
const COLOR_GRIS = '#8A94A0';
const COLOR_LINEA = '#DDE3EA';
const COLOR_OK = '#1E8E5A';
const COLOR_FONDO_CODIGO = '#F4F6F8';

const MARGEN = 58;
const ANCHO_UTIL = 595.28 - MARGEN * 2;

/* ------------------------------------------------------------------ */
/* Utilidades de composicion                                           */
/* ------------------------------------------------------------------ */
function pieDePagina(doc) {
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(COLOR_GRIS).font('Helvetica')
      .text('FacturaExpress V3 - Acta de pruebas y aceptacion', MARGEN, 812, { width: 280 })
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

/** Tabla generica: encabezados + filas con anchos por columna. */
function tabla(doc, encabezados, filas, anchos) {
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
  doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO_UTIL, doc.y)
    .lineWidth(0.6).strokeColor(COLOR_LINEA).stroke();
  dibujarFila(encabezados, true);
  filas.forEach((fila) => dibujarFila(fila, false));
  doc.moveDown(0.35);
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

/** Firma con linea para firmar. */
function firma(doc, rol, nombre, x) {
  const y = doc.y;
  doc.moveTo(x, y + 34).lineTo(x + 210, y + 34)
    .lineWidth(0.8).strokeColor(COLOR_TEXTO).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXTO)
    .text(nombre, x, y + 42, { width: 210, align: 'center' });
  doc.font('Helvetica').fontSize(8.8).fillColor(COLOR_GRIS)
    .text(rol, x, y + 56, { width: 210, align: 'center' });
}

/* ------------------------------------------------------------------ */
/* Datos del acta                                                      */
/* ------------------------------------------------------------------ */
const FECHA = '24 de agosto de 2026';
const APRENDIZ = 'Jhon Henry Romero';
const PROGRAMA = 'Analisis y Desarrollo de Software';
const PROYECTO = 'Construccion de software integrador de tecnologias orientadas a servicios';
const REPO = 'https://github.com/jhromero81/FacturaExpress_V3.git';

/* ------------------------------------------------------------------ */
/* Construccion del documento                                          */
/* ------------------------------------------------------------------ */
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 54, bottom: 54, left: MARGEN, right: MARGEN },
  info: { Title: 'FacturaExpress V3 - Acta de pruebas y aceptacion' },
});
doc.pipe(fs.createWriteStream(SALIDA));

/* ---------------------------- Portada ----------------------------- */
doc.rect(0, 0, 595.28, 118).fill(COLOR_BANDA);
doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_ACENTO)
  .text('SERVICIO NACIONAL DE APRENDIZAJE - SENA', MARGEN, 24, { characterSpacing: 1.2 });
doc.font('Helvetica-Bold').fontSize(22).fillColor('#FFFFFF')
  .text('Acta de pruebas y aceptacion', MARGEN, 48);
doc.font('Helvetica').fontSize(11).fillColor(COLOR_SUBTITULO)
  .text('Modulos integrados - FacturaExpress V3', MARGEN, 86);

doc.y = 140;
doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR_ACENTO)
  .text('GA8-220501096 - AA1 - EV02: Integrar modulos, de acuerdo con el diseno establecido', {
    width: ANCHO_UTIL,
  });

doc.moveDown(0.9);
parrafoClaveValor(doc, 'Aprendiz:', APRENDIZ);
parrafoClaveValor(doc, 'Programa:', PROGRAMA);
parrafoClaveValor(doc, 'Proyecto:', PROYECTO);
parrafoClaveValor(doc, 'Fase:', 'Ejecucion');
parrafoClaveValor(doc, 'Resultado:', '220501096-04 - Codificar el software de acuerdo con el diseno establecido');
parrafoClaveValor(doc, 'Evidencia:', 'EV02 - Modulos integrados');
parrafoClaveValor(doc, 'Fecha:', FECHA);
parrafoClaveValor(doc, 'Repositorio:', REPO);

/* -------------------- 1. Objeto del acta -------------------------- */
tituloSeccion(doc, '1. Objeto del acta');
parrafo(doc, 'La presente acta documenta la aplicacion de las pruebas de software del sistema FacturaExpress V3 (aplicacion web Angular 22 + API REST Node.js/Express + MySQL 8) y deja constancia de su resultado satisfactorio y de la aceptacion de los modulos integrados. El sistema comprende 13 modulos de interfaz (login, dashboard, punto de venta, facturas, clientes, productos, reportes, configuracion y 5 administrativos) que consumen 48 endpoints REST documentados.');

/* ------------------- 2. Ambiente de pruebas ----------------------- */
tituloSeccion(doc, '2. Ambiente de desarrollo y pruebas');
tabla(
  doc,
  ['Componente', 'Detalle'],
  [
    ['Sistema operativo', 'Ubuntu (kernel Linux) y Windows 11 - proyecto multiplataforma verificado'],
    ['Entorno de ejecucion', 'Node.js v26.7.0 / npm 11.19.0'],
    ['Base de datos', 'MySQL 8 (base facturaexpress_apirest, esquema + seed de datos demo)'],
    ['API REST', 'Express 4 en http://localhost:4000 (nodemon en desarrollo)'],
    ['Frontend', 'Angular 22 dev-server en http://localhost:4200 con proxy /api -> 4000'],
    ['Pruebas de API', 'Postman / Newman v6 (coleccion v2.1, 56 peticiones)'],
    ['Integracion continua', 'GitHub Actions: unitarias + build + E2E con MySQL de servicio'],
    ['Contenedores', 'Docker Compose (db + api + nginx) disponible para despliegue integral'],
  ],
  [150, 339]
);

/* ----------------- 3. Resultados de las pruebas ------------------- */
tituloSeccion(doc, '3. Aplicacion de las pruebas y resultados');

subtitulo(doc, '3.1 Resumen general');
tabla(
  doc,
  ['Nivel de prueba', 'Herramienta', 'Resultado'],
  [
    ['Unitarias (backend)', 'node --test (5 suites)', '40/40 APROBADAS'],
    ['Integracion de la API', 'Newman sobre coleccion Postman', '56 peticiones, 91 aserciones, 0 fallos'],
    ['End-to-end (navegador)', 'Verificacion manual frontend <-> backend', 'APROBADA (12 escenarios)'],
    ['Build de produccion', 'ng build --configuration production', 'Compilacion exitosa sin errores'],
  ],
  [150, 200, 139]
);

subtitulo(doc, '3.2 Pruebas unitarias ejecutadas (npm test)');
bloqueCodigo(doc, [
  '$ cd backend && npm test',
  '  suites: cune, helpers, jwt, validate, validators',
  '  tests 40   pass 40   fail 0',
]);
vineta(doc, 'cune.test.js (6): hash CUNE SHA-256 determinista.');
vineta(doc, 'helpers.test.js (16): numeros de factura, formato moneda y calculo de IVA.');
vineta(doc, 'jwt.test.js (7): firma, verificacion y expiracion de tokens.');
vineta(doc, 'validate.test.js (2): middleware central de validaciones (400).');
vineta(doc, 'validators.test.js (9): reglas de negocio de login, clientes, productos, facturas y usuarios.');

subtitulo(doc, '3.3 Pruebas de integracion de la API (Postman/Newman)');
parrafo(doc, 'La coleccion cubre los 12 modulos del backend verificando codigos HTTP, esquema JSON, persistencia real en MySQL, seguridad (autenticacion/roles) y casos negativos. Resultado: 56 peticiones ejecutadas, 91 aserciones evaluadas y 0 fallos.');

subtitulo(doc, '3.4 Verificacion end-to-end de los modulos integrados');
tabla(
  doc,
  ['#', 'Escenario verificado', 'Estado'],
  [
    ['1', 'Login con cookie httpOnly, restauracion de sesion y logout con revocacion de token', 'APROBADO'],
    ['2', 'Dashboard: KPIs, grafico semanal y ultimas transacciones', 'APROBADO'],
    ['3', 'Punto de venta: carrito, descuento, totales (subtotal/IVA/total) coincidentes con el servidor', 'APROBADO'],
    ['4', 'Finalizacion de venta: numero consecutivo, CUNE y descuento atomico de stock en transaccion', 'APROBADO'],
    ['5', 'Facturas: listado, filtros, detalle y descargas PDF/XML/CSV', 'APROBADO'],
    ['6', 'Flujo DIAN: cambio de estado, firma y sincronizacion simulada', 'APROBADO'],
    ['7', 'CRUD de clientes y productos con validaciones y eliminacion logica', 'APROBADO'],
    ['8', 'Reportes: comparativo por periodos, top productos, PDF e historial', 'APROBADO'],
    ['9', 'Configuracion fiscal de la empresa y resolucion DIAN', 'APROBADO'],
    ['10', 'Administracion: usuarios, errores, auditoria y backups (rol admin)', 'APROBADO'],
    ['11', 'Seguridad: rate limiting, helmet, JWT obligatorio en produccion, roles', 'APROBADO'],
    ['12', 'Arranque unificado con scripts raiz (npm run dev) en Windows y Ubuntu', 'APROBADO'],
  ],
  [28, 376, 85]
);

subtitulo(doc, '3.5 Incidencias detectadas durante las pruebas');
tabla(
  doc,
  ['Incidencia', 'Solucion aplicada', 'Estado'],
  [
    ['node_modules del backend copiado entre equipos con carpeta .bin vacia (nodemon no encontrado)', 'Reinstalacion por equipo con npm install; regla documentada: no sincronizar dependencias entre SO', 'RESUELTA'],
    ['Politica allow-scripts de npm 11 bloqueaba binarios nativos de rollup/lmdb en Linux', 'Seccion allowScripts ampliada en frontend/package.json para Windows y Linux', 'RESUELTA'],
    ['Diferencias de finales de linea CRLF/LF entre equipos', '.gitattributes con normalizacion LF en el repositorio', 'RESUELTA'],
  ],
  [205, 216, 68]
);

/* -------------------- 4. Dictamen y aceptacion -------------------- */
tituloSeccion(doc, '4. Dictamen de aceptacion');
parrafo(doc, 'Con base en los resultados anteriores, los modulos integrados del sistema FacturaExpress V3 cumplen con los requisitos funcionales y de calidad definidos en el diseno establecido. Las tres capas de verificacion (unitarias, integracion y end-to-end) reportan resultados satisfactorios y las incidencias detectadas fueron resueltas y documentadas.');

asegurarEspacio(doc, 60);
const yDictamen = doc.y;
doc.rect(MARGEN, yDictamen, ANCHO_UTIL, 30).fill('#EEF6F4');
doc.rect(MARGEN, yDictamen, 3, 30).fill(COLOR_ACENTO);
doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_OK)
  .text('DICTAMEN: APROBADO - MODULOS INTEGRADOS ACEPTADOS', MARGEN + 14, yDictamen + 10);
doc.y = yDictamen + 44;

doc.moveDown(1.2);
firma(doc, 'Aprendiz - Desarrollador', APRENDIZ, MARGEN);
firma(doc, 'Instructor / Usuario aceptante', '________________________', MARGEN + 240);

pieDePagina(doc);
doc.end();
console.log('PDF generado en:', SALIDA);
