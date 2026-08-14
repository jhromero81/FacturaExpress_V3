/**
 * services/pdf.service.js
 * Generacion de documentos PDF (facturas y reportes) mediante
 * PDFKit. Replica el diseno corporativo del sistema Java original:
 * acento teal, texto oscuro y tipografia monoespaciada para montos.
 */

const PDFDocument = require('pdfkit');

/** Paleta corporativa del sistema */
const COLORES = {
  accent: '#1abc9c',
  accentDk: '#148f77',
  dark: '#1a2335',
  muted: '#90a4ae',
  bgLight: '#f5f5f5',
};

/**
 * Formatea un valor como moneda colombiana con puntos de miles.
 * @param {number} valor - Monto a formatear.
 * @returns {string} Texto formateado (sin signo de pesos).
 */
function formatMoney(valor) {
  return Number(valor || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/**
 * Formatea una fecha a dd/mm/yyyy hh:mm.
 * @param {string|Date} fecha - Fecha a formatear.
 * @returns {string} Fecha formateada.
 */
function formatFecha(fecha) {
  if (!fecha) return '--';
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return '--';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/**
 * Recolecta los datos del documento PDF en un Buffer.
 * @param {function} dibujar - Recibe el documento PDF y dibuja el contenido.
 * @returns {Promise<Buffer>} Buffer con el PDF generado.
 */
function generarPdfBuffer(dibujar) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      dibujar(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Dibuja la cabecera comun de un documento: titulo, periodo y fecha.
 * @param {PDFDocument} doc - Documento PDF.
 * @param {string} titulo - Titulo principal.
 * @param {string|null} subtitulo - Subtitulo opcional (periodo).
 */
function dibujarCabecera(doc, titulo, subtitulo = null) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORES.accent).text(titulo, { align: 'center' });
  if (subtitulo) {
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11).fillColor(COLORES.muted).text(subtitulo, { align: 'center' });
  }
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor(COLORES.muted).text(
    `Generado: ${formatFecha(new Date())}`,
    { align: 'right' }
  );
  doc.moveDown(0.8);
}

/**
 * Dibuja la tabla de detalle de una factura.
 * @param {PDFDocument} doc - Documento PDF.
 * @param {Array} items - Items de la factura.
 */
function dibujarTablaItems(doc, items) {
  const inicioX = doc.page.margins.left;
  const ancho = doc.page.width - inicioX * 2;
  const columnas = { producto: 0.38, cantidad: 0.12, precio: 0.18, subtotal: 0.22 };
  const anchoProducto = ancho * columnas.producto;
  const anchoCantidad = ancho * columnas.cantidad;
  const anchoPrecio = ancho * columnas.precio;
  const anchoSubtotal = ancho * columnas.subtotal;

  const dibujarFila = (valores, y, opciones = {}) => {
    const alto = 18;
    doc.rect(inicioX, y, ancho, alto)
      .fill(opciones.fondo || '#ffffff');
    doc.fillColor(COLORES.dark);
    doc.font(opciones.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);

    doc.text(valores[0], inicioX + 6, y + 5, { width: anchoProducto - 8 });
    doc.text(valores[1], inicioX + anchoProducto, y + 5, {
      width: anchoCantidad,
      align: 'center',
    });
    doc.text(valores[2], inicioX + anchoProducto + anchoCantidad, y + 5, {
      width: anchoPrecio,
      align: 'right',
    });
    doc.text(valores[3], inicioX + anchoProducto + anchoCantidad + anchoPrecio, y + 5, {
      width: anchoSubtotal - 6,
      align: 'right',
    });
    return alto;
  };

  // Cabecera de la tabla
  doc.rect(inicioX, doc.y, ancho, 20).fill(COLORES.accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('PRODUCTO', inicioX + 6, doc.y + 6, { width: anchoProducto - 8 });
  doc.text('CANT', inicioX + anchoProducto, doc.y + 6, { width: anchoCantidad, align: 'center' });
  doc.text('PRECIO', inicioX + anchoProducto + anchoCantidad, doc.y + 6, { width: anchoPrecio, align: 'right' });
  doc.text('SUBTOTAL', inicioX + anchoProducto + anchoCantidad + anchoPrecio, doc.y + 6, { width: anchoSubtotal - 6, align: 'right' });
  doc.moveDown(20 / 18 + 0.2);

  let fila = 0;
  for (const item of items) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const alto = dibujarFila(
      [
        item.nombre,
        String(item.cantidad),
        `$${formatMoney(item.precioUnitario)}`,
        `$${formatMoney(item.subtotal)}`,
      ],
      doc.y,
      { fondo: fila % 2 === 0 ? COLORES.bgLight : '#ffffff' }
    );
    doc.moveDown(alto / 18);
    fila++;
  }
}

/**
 * Genera el PDF de una factura electronica.
 * @param {object} datos - { factura, items, empresa }.
 * @returns {Promise<Buffer>} PDF generado.
 */
async function generarPdfFactura({ factura, items = [], empresa = {} }) {
  return generarPdfBuffer((doc) => {
    dibujarCabecera(doc, 'FACTURA ELECTRONICA', `${empresa.razonSocial || ''} - NIT ${empresa.nit || ''}`);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORES.dark)
      .text(`Factura #: ${factura.numero}`);
    doc.moveDown(0.3);

    const campos = [
      ['Fecha de emision', formatFecha(factura.fecha)],
      ['Cliente', `${factura.clienteNombre || factura.cliente?.nombre || 'N/A'} (${factura.clienteIdentificacion || factura.cliente?.identificacion || ''})`],
      ['Estado', factura.estado],
      ['CUNE', factura.cufe || factura.cune || 'Pendiente'],
    ];

    for (const [label, valor] of campos) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORES.muted).text(label);
      doc.font('Helvetica').fontSize(10).fillColor(COLORES.dark).text(String(valor));
      doc.moveDown(0.2);
    }

    doc.moveDown(0.6);
    if (doc.y > doc.page.height - 200) doc.addPage();
    dibujarTablaItems(doc, items);

    doc.moveDown(1);
    const filasTotal = [
      ['Subtotal', `$${formatMoney(factura.subtotal)}`],
      ['Descuento', factura.descuento ? `-$${formatMoney(factura.descuento)}` : '$0'],
      ['IVA (19%)', `$${formatMoney(factura.iva)}`],
      ['TOTAL', `$${formatMoney(factura.total)}`],
    ];

    for (const [label, valor] of filasTotal) {
      const esTotal = label === 'TOTAL';
      doc.font(esTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(esTotal ? 13 : 10)
        .fillColor(esTotal ? COLORES.accent : COLORES.dark)
        .text(`${label}: ${valor}`, { align: 'right' });
    }

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor(COLORES.muted)
      .text('FacturaExpress - Facturacion Electronica DIAN. Documento generado electronicamente.', { align: 'center' });
  });
}

/**
 * Genera el PDF de un reporte de ventas con KPIs, grafico de
 * barras y productos mas vendidos.
 * @param {object} datos - { periodo, kpis, ventasPeriodo, topProductos }.
 * @returns {Promise<Buffer>} PDF generado.
 */
async function generarPdfReporte({ periodo, kpis = {}, ventasPeriodo = [], topProductos = [] }) {
  return generarPdfBuffer((doc) => {
    dibujarCabecera(doc, 'REPORTE DE VENTAS', periodo);

    // ---- KPIs ----
    const kpisDatos = [
      ['VENTAS DEL PERIODO', `$${formatMoney(kpis.ventas)}`],
      ['FACTURAS EMITIDAS', String(kpis.facturas || 0)],
      ['PERIODO', String(periodo || 'mensual').toUpperCase()],
      ['PRODUCTOS VENDIDOS', String(kpis.productos || 0)],
    ];

    const inicioX = doc.page.margins.left;
    const ancho = doc.page.width - inicioX * 2;
    const kpiAncho = ancho / 4;

    doc.rect(inicioX, doc.y, ancho, 46).fill(COLORES.bgLight);
    kpisDatos.forEach(([label, valor], i) => {
      const x = inicioX + i * kpiAncho;
      doc.fillColor(COLORES.muted).font('Helvetica-Bold').fontSize(6.5).text(label.toUpperCase(), x + 6, doc.y + 6, { width: kpiAncho - 12 });
      doc.fillColor(COLORES.dark).font('Helvetica-Bold').fontSize(10).text(valor, x + 6, doc.y + 16, { width: kpiAncho - 12 });
    });
    doc.moveDown(46 / 18 + 0.5);

    // ---- Grafico de barras del periodo ----
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORES.dark).text('Ventas por periodo');
    doc.moveDown(0.4);

    const serie = ventasPeriodo.slice(-8);
    const max = Math.max(...serie.map((v) => Number(v.total) || 0), 1);
    const chartH = 130;
    const chartW = ancho - 20;
    const barSlot = serie.length > 0 ? chartW / serie.length : chartW;
    const baseY = doc.y + chartH;

    if (serie.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORES.muted).text('Sin datos para el periodo seleccionado.');
    }

    serie.forEach((v, i) => {
      const valor = Number(v.total) || 0;
      const altura = Math.max((valor / max) * (chartH - 20), 2);
      const x = inicioX + 10 + i * barSlot;
      const y = baseY - altura;

      doc.rect(x + barSlot * 0.2, y, barSlot * 0.6, altura).fill(COLORES.accent);
      doc.fillColor(COLORES.muted).font('Helvetica').fontSize(6.5)
        .text(String(v.periodo), x, baseY + 4, { width: barSlot, align: 'center' });
    });
    doc.moveDown(2.2);

    if (doc.y > doc.page.height - 180) doc.addPage();

    // ---- Productos mas vendidos ----
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORES.dark).text('TOP PRODUCTOS');
    doc.moveDown(0.3);

    if (topProductos.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORES.muted).text('Sin datos.');
    } else {
      topProductos.slice(0, 8).forEach((p, i) => {
        const fondo = i % 2 === 0 ? COLORES.bgLight : '#ffffff';
        doc.rect(inicioX, doc.y, ancho, 18).fill(fondo);
        doc.fillColor(COLORES.dark).font('Helvetica').fontSize(8.5);
        doc.text(`${i + 1}. ${p.nombre}`, inicioX + 6, doc.y + 4, { width: ancho - 120 });
        doc.text(`${p.vendidos} vendidos`, inicioX + ancho - 110, doc.y + 4, {
          width: 100,
          align: 'right',
        });
        doc.moveDown(18 / 18);
      });
    }

    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(8).fillColor(COLORES.muted)
      .text('FacturaExpress - Reporte generado automaticamente.', { align: 'center' });
  });
}

module.exports = { generarPdfFactura, generarPdfReporte };
