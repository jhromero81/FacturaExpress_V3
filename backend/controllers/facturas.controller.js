/**
 * controllers/facturas.controller.js
 * Controlador del modulo de ventas y facturacion electronica.
 * Implementa la logica de negocio completa de una factura:
 *  - Validacion de cliente e items.
 *  - Calculo de subtotal, IVA, descuento (%) y total del servidor.
 *  - Generacion del numero secuencial y del CUNE (hash DIAN).
 *  - Descuento del stock en una transaccion atomica.
 *  - Generacion de XML y PDF, envio por correo y auditoria.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const {
  calcularIVA,
  generateInvoiceNumber,
  isValidPositiveInt,
  isRequiredString,
  escapeXML,
  escapeCSV,
  mapFacturaRow,
  mapItemRow,
} = require('../utils/helpers');
const { generarCUNE } = require('../utils/cune');
const { registrarAuditoria } = require('../utils/auditoria');
const { registrarError } = require('../utils/errores');
const pdfService = require('../services/pdf.service');
const emailService = require('../services/email.service');

/** Estados validos de una factura ante la DIAN */
const ESTADOS_VALIDOS = ['pendiente', 'enviada', 'rechazada'];

/** Estados de firma de la factura */
const FIRMA_ESTADOS = ['pendiente', 'firmada', 'rechazada'];

/** Tarifa de IVA usada por el sistema */
const IVA_TARIFA = 0.19;

/** Columnas base de una factura (para los SELECT repetidos) */
const CAMPOS_FACTURA = `f.id, f.numero, f.fecha, f.cliente_id, f.cliente_identificacion,
            f.cliente_nombre, f.subtotal, f.iva, f.descuento, f.total, f.estado, f.cufe,
            f.firma_estado, f.intentos_dian, f.correo_enviado`;

/**
 * GET /api/facturas
 * Lista las facturas emitidas con filtros opcionales:
 *  - estado: filtra por estado DIAN.
 *  - q: busqueda por numero de factura o nombre del cliente.
 *  - pagina / limite: paginacion de resultados.
 */
const listFacturas = asyncHandler(async (req, res) => {
  const { q = '', estado = '', pagina = 1, limite = 20 } = req.query;

  const condiciones = [];
  const parametros = [];

  if (estado && ESTADOS_VALIDOS.includes(estado)) {
    condiciones.push('f.estado = ?');
    parametros.push(estado);
  }
  if (q.trim()) {
    condiciones.push('(f.numero LIKE ? OR f.cliente_nombre LIKE ?)');
    const termino = `%${q.trim()}%`;
    parametros.push(termino, termino);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM facturas f
       ${where}`,
    parametros
  );

  const [rows] = await pool.query(
    `SELECT ${CAMPOS_FACTURA}
       FROM facturas f
       ${where}
      ORDER BY f.fecha DESC
      LIMIT ? OFFSET ?`,
    [...parametros, Number(limite), (Number(pagina) - 1) * Number(limite)]
  );

  const total = Number(countRows[0].total);

  res.json({
    success: true,
    total,
    totalPaginas: Math.ceil(total / Number(limite)),
    facturas: rows.map(mapFacturaRow),
  });
});

/**
 * GET /api/facturas/:id
 * Devuelve una factura completa incluyendo sus items.
 */
const getFactura = asyncHandler(async (req, res) => {
  const [facturas] = await pool.query(
    `SELECT ${CAMPOS_FACTURA}
       FROM facturas f
      WHERE f.id = ?`,
    [req.params.id]
  );

  if (facturas.length === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  const [items] = await pool.query(
    `SELECT producto_id, codigo, nombre, cantidad, precio_unitario, iva, subtotal
       FROM factura_items
      WHERE factura_id = ?
      ORDER BY id ASC`,
    [req.params.id]
  );

  res.json({
    success: true,
    factura: { ...mapFacturaRow(facturas[0]), items: items.map(mapItemRow) },
  });
});

/**
 * POST /api/facturas
 * Finaliza una venta y genera la factura electronica.
 * Body: { clienteId, items: [{productoId, cantidad}], descuento: number (0-100) }
 *
 * Logica de negocio:
 *  1. Verifica que el cliente exista y este activo.
 *  2. Valida los items contra el catalogo y su stock.
 *  3. Calcula subtotal, IVA y total (ignorando precios del cliente).
 *  4. Genera el numero secuencial y el CUNE (hash SHA-256).
 *  5. Inserta factura + items, descuenta stock y deja la factura
 *     pendiente de envio DIAN.
 *  6. Fuera de la transaccion genera XML y PDF, intenta enviar el
 *     correo y registra errores si falla.
 */
const createFactura = asyncHandler(async (req, res) => {
  const { clienteId, items = [], descuento = 0 } = req.body || {};

  // ---- Validacion de la peticion ----
  if (!isValidPositiveInt(clienteId)) {
    throw createHttpError(400, 'Debe indicar un clienteId valido.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, 'Debe incluir al menos un item en la venta.');
  }

  const descuentoValido = Number.isFinite(Number(descuento))
    ? Math.min(Math.max(Number(descuento), 0), 100)
    : 0;

  // ---- Verificar existencia del cliente ----
  const [clientes] = await pool.query(
    'SELECT id, identificacion, nombre, email FROM clientes WHERE id = ? AND activo = 1',
    [clienteId]
  );
  if (clientes.length === 0) {
    throw createHttpError(404, 'Cliente no encontrado.');
  }
  const cliente = clientes[0];

  // ---- Recuperar productos del catalogo y validar cantidades ----
  const ids = items.map((i) => Number(i.productoId)).filter((id) => isValidPositiveInt(id));
  if (ids.length !== items.length) {
    throw createHttpError(400, 'Cada item debe incluir un productoId valido.');
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [productos] = await pool.query(
    `SELECT id, codigo, nombre, precio, iva, stock
       FROM productos
      WHERE id IN (${placeholders}) AND activo = 1`,
    ids
  );

  if (productos.length !== ids.length) {
    throw createHttpError(400, 'Uno o mas productos no existen o estan inactivos.');
  }

  const productoPorId = new Map(productos.map((p) => [p.id, p]));

  // ---- Calcular lineas de factura ----
  const lineas = items.map((item) => {
    const producto = productoPorId.get(Number(item.productoId));
    const cantidad = Number(item.cantidad);

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw createHttpError(400, `La cantidad del producto ${producto.nombre} debe ser un entero positivo.`);
    }
    if (cantidad > producto.stock) {
      throw createHttpError(
        409,
        `Stock insuficiente de ${producto.nombre}: disponible ${producto.stock}.`
      );
    }

    const subtotal = producto.precio * cantidad;
    return {
      productoId: producto.id,
      codigo: producto.codigo,
      nombre: producto.nombre,
      cantidad,
      precioUnitario: Number(producto.precio),
      iva: calcularIVA(subtotal),
      subtotal: Math.round(subtotal),
    };
  });

  // ---- Totales de la factura (descuento porcentual sobre el subtotal) ----
  const subtotalTotal = lineas.reduce((sum, l) => sum + l.subtotal, 0);
  const montoDescuento = Math.round(subtotalTotal * (descuentoValido / 100));
  const baseGravable = subtotalTotal - montoDescuento;
  const ivaTotal = Math.round(baseGravable * IVA_TARIFA);
  const total = baseGravable + ivaTotal;

  // ---- Generar numero secuencial y CUNE ----
  const numero = await generateInvoiceNumber();
  const cufe = generarCUNE({
    numero,
    clienteId: cliente.id,
    clienteNit: cliente.identificacion,
    total,
    fecha: new Date(),
  });

  // ---- Transaccion: factura + items + descuento de stock ----
  const connection = await pool.getConnection();
  let facturaId = null;
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO facturas
        (numero, fecha, cliente_id, cliente_identificacion, cliente_nombre,
         subtotal, iva, descuento, total, estado, cufe, firma_estado, intentos_dian, correo_enviado)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, 'pendiente', 0, 0)`,
      [
        numero,
        cliente.id,
        cliente.identificacion,
        cliente.nombre,
        subtotalTotal,
        ivaTotal,
        montoDescuento,
        total,
        cufe,
      ]
    );

    facturaId = result.insertId;

    // Insertar items y descontar stock de cada producto
    for (const linea of lineas) {
      await connection.query(
        `INSERT INTO factura_items
          (factura_id, producto_id, codigo, nombre, cantidad, precio_unitario, iva, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          facturaId,
          linea.productoId,
          linea.codigo,
          linea.nombre,
          linea.cantidad,
          linea.precioUnitario,
          linea.iva,
          linea.subtotal,
        ]
      );

      await connection.query(
        'UPDATE productos SET stock = stock - ? WHERE id = ?',
        [linea.cantidad, linea.productoId]
      );
    }

    await connection.commit();

    // Recuperar la factura completa para la respuesta
    const [facturas] = await connection.query(
      `SELECT ${CAMPOS_FACTURA}
         FROM facturas f WHERE f.id = ?`,
      [facturaId]
    );
    const [itemsFactura] = await connection.query(
      `SELECT producto_id, codigo, nombre, cantidad, precio_unitario, iva, subtotal
         FROM factura_items WHERE factura_id = ?`,
      [facturaId]
    );

    const factura = { ...mapFacturaRow(facturas[0]), items: itemsFactura.map(mapItemRow) };

    res.status(201).json({
      success: true,
      message: `Venta finalizada: ${numero}`,
      factura,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // ---- Procesos post-venta (no bloquean la respuesta) ----
  try {
    const [empresas] = await pool.query(
      'SELECT nit, razon_social, telefono, email_facturacion, resolucion_dian FROM empresa WHERE id = 1'
    );
    const empresa = empresas[0] || null;

    // Generar PDF y XML en segundo plano
    let pdfBytes = null;
    if (empresa) {
      pdfBytes = await pdfService
        .generarPdfFactura({ factura: { ...factura, items: undefined }, items: factura.items, empresa })
        .catch((err) => {
          registrarError(`No se pudo generar el PDF de la factura ${numero}: ${err.message}`, 'otro', facturaId);
          return null;
        });
    }

    // Enviar por correo si esta configurado y el cliente tiene email
    if (pdfBytes && cliente.email && emailService.correoConfigurado()) {
      const enviado = await emailService
        .enviarFactura({
          destino: cliente.email,
          asunto: `Factura Electronica ${factura.numero}`,
          cuerpoHtml: `<p>Hola <strong>${factura.cliente.nombre}</strong>,</p>
            <p>Adjuntamos su factura electronica <strong>${factura.numero}</strong> por un valor de
            <strong>$${Number(factura.total).toLocaleString('es-CO')}</strong>.</p>
            <p>Gracias por su compra.</p>`,
          pdfBytes,
          nombreAdjunto: `${factura.numero}.pdf`,
        })
        .catch((err) => {
          registrarError(`Fallo el envio de correo de la factura ${numero}: ${err.message}`, 'correo', facturaId);
          return false;
        });
      if (enviado) {
        await pool.query('UPDATE facturas SET correo_enviado = 1 WHERE id = ?', [facturaId]);
      }
    }

    await registrarAuditoria(req, `INSERT factura ${numero}`, 'facturas', facturaId);
  } catch (error) {
    // Nunca romper la respuesta principal por los procesos post-venta
    registrarError(`Error en procesos post-venta de la factura ${numero}: ${error.message}`, 'dian', facturaId);
  }
});

/**
 * PUT /api/facturas/:id/estado
 * Actualiza el estado DIAN de una factura (pendiente -> enviada ->
 * rechazada). Body: { estado }.
 */
const updateEstadoFactura = asyncHandler(async (req, res) => {
  const { estado } = req.body || {};

  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw createHttpError(400, `Estado invalido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}.`);
  }

  const [actual] = await pool.query(
    'SELECT id, numero, estado FROM facturas WHERE id = ?',
    [req.params.id]
  );
  if (actual.length === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  const factura = actual[0];
  let firmaEstado = factura.firma_estado;
  let intentosDian = factura.intentos_dian;

  // Simulacion del flujo DIAN: cada cambio suma un intento y ajusta la firma
  if (estado === 'enviada') {
    intentosDian = Number(intentosDian || 0) + 1;
    firmaEstado = 'firmada';
  } else if (estado === 'rechazada') {
    firmaEstado = 'rechazada';
  } else {
    firmaEstado = 'pendiente';
  }

  await pool.query(
    `UPDATE facturas
        SET estado = ?, firma_estado = ?, intentos_dian = ?
      WHERE id = ?`,
    [estado, firmaEstado, intentosDian, req.params.id]
  );

  await registrarAuditoria(req, `UPDATE factura ${factura.numero} estado=${estado}`, 'facturas', req.params.id);

  const [rows] = await pool.query(
    `SELECT ${CAMPOS_FACTURA}
       FROM facturas f WHERE f.id = ?`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: `Factura ${factura.numero} marcada como "${estado}".`,
    factura: mapFacturaRow(rows[0]),
  });
});

/**
 * DELETE /api/facturas/:id
 * Elimina fisicamente la factura y sus items (solo si esta pendiente).
 * Se conserva la auditoria de la operacion.
 */
const deleteFactura = asyncHandler(async (req, res) => {
  const [actual] = await pool.query(
    'SELECT id, numero, estado FROM facturas WHERE id = ?',
    [req.params.id]
  );
  if (actual.length === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  const factura = actual[0];
  if (factura.estado === 'enviada') {
    throw createHttpError(409, 'No puede eliminar una factura ya enviada a la DIAN.');
  }

  const [result] = await pool.query(
    'DELETE FROM facturas WHERE id = ?',
    [req.params.id]
  );
  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  await registrarAuditoria(req, `DELETE factura ${factura.numero}`, 'facturas', req.params.id);

  res.json({ success: true, message: 'Factura eliminada correctamente.' });
});

/**
 * GET /api/facturas/:id/pdf
 * Genera el PDF de la factura (Documento Soporte en papel DIAN).
 */
const getFacturaPDF = asyncHandler(async (req, res) => {
  const [facturas] = await pool.query(
    `SELECT ${CAMPOS_FACTURA}
       FROM facturas f WHERE f.id = ?`,
    [req.params.id]
  );
  if (facturas.length === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  const [items] = await pool.query(
    `SELECT producto_id, codigo, nombre, cantidad, precio_unitario, iva, subtotal
       FROM factura_items WHERE factura_id = ?`,
    [req.params.id]
  );

  const [empresas] = await pool.query(
    'SELECT nit, razon_social, telefono, email_facturacion, resolucion_dian FROM empresa WHERE id = 1'
  );
  const empresa = empresas[0] || null;
  if (!empresa) {
    throw createHttpError(500, 'No hay empresa configurada para facturar.');
  }

  const factura = mapFacturaRow(facturas[0]);

  const pdfBuffer = await pdfService.generarPdfFactura({
    factura,
    items: items.map(mapItemRow),
    empresa,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${factura.numero}.pdf"`);
  res.send(pdfBuffer);
});

/**
 * GET /api/facturas/:id/xml
 * Genera la representacion XML de la factura en el formato DIAN
 * (Cabecera + Detalles + CUNE).
 */
const getFacturaXML = asyncHandler(async (req, res) => {
  const [facturas] = await pool.query(
    `SELECT ${CAMPOS_FACTURA}
       FROM facturas f WHERE f.id = ?`,
    [req.params.id]
  );
  if (facturas.length === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  const [items] = await pool.query(
    `SELECT nombre, cantidad, precio_unitario, subtotal, iva
       FROM factura_items WHERE factura_id = ?`,
    [req.params.id]
  );

  const factura = facturas[0];
  const fecha = factura.fecha instanceof Date
    ? factura.fecha.toISOString().slice(0, 19).replace('T', ' ')
    : factura.fecha;

  const detalle = items
    .map(
      (item) => `  <Detalle>
    <Nombre>${escapeXML(item.nombre)}</Nombre>
    <Cantidad>${item.cantidad}</Cantidad>
    <PrecioUnitario>${Number(item.precio_unitario)}</PrecioUnitario>
    <Subtotal>${Number(item.subtotal)}</Subtotal>
    <IVA>${Number(item.iva)}</IVA>
  </Detalle>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="http://www.dian.gov.co/schemas/factura/v2">
  <Cabecera>
    <IdFactura>${escapeXML(factura.numero)}</IdFactura>
    <FechaEmision>${escapeXML(fecha)}</FechaEmision>
    <ClienteId>${Number(factura.cliente_id)}</ClienteId>
    <ClienteNombre>${escapeXML(factura.cliente_nombre)}</ClienteNombre>
    <Subtotal>${Number(factura.subtotal)}</Subtotal>
    <Descuento>${Number(factura.descuento)}</Descuento>
    <Total>${Number(factura.total)}</Total>
    <Estado>${escapeXML(factura.estado)}</Estado>
    <CUNE>${escapeXML(factura.cufe)}</CUNE>
  </Cabecera>
  <Detalles>
${detalle}
  </Detalles>
</FacturaElectronica>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${factura.numero}.xml"`);
  res.send(xml);
});

/**
 * GET /api/facturas/:id/csv
 * Genera un archivo CSV con la factura y sus items (reporte).
 */
const getFacturaCSV = asyncHandler(async (req, res) => {
  const [facturas] = await pool.query(
    `SELECT numero, fecha, cliente_identificacion, cliente_nombre, subtotal, iva, descuento, total, estado
       FROM facturas WHERE id = ?`,
    [req.params.id]
  );
  if (facturas.length === 0) {
    throw createHttpError(404, 'Factura no encontrada.');
  }

  const [items] = await pool.query(
    `SELECT nombre, cantidad, precio_unitario, subtotal FROM factura_items WHERE factura_id = ?`,
    [req.params.id]
  );

  const f = facturas[0];
  const fecha = f.fecha instanceof Date ? f.fecha.toISOString() : f.fecha;
  const filas = [
    ['Numero Factura', f.numero],
    ['Fecha', fecha],
    ['Cliente', f.cliente_nombre],
    ['NIT', f.cliente_identificacion],
    ['Estado', f.estado],
    ['Subtotal', Number(f.subtotal)],
    ['IVA', Number(f.iva)],
    ['Descuento', Number(f.descuento)],
    ['Total', Number(f.total)],
    [],
    ['Producto', 'Cantidad', 'Precio Unitario', 'Subtotal'],
    ...items.map((i) => [i.nombre, i.cantidad, Number(i.precio_unitario), Number(i.subtotal)]),
  ];

  const csv = filas
    .map((fila) => fila.map((celda) => escapeCSV(celda)).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${f.numero}.csv"`);
  res.send(csv);
});

module.exports = {
  listFacturas,
  getFactura,
  createFactura,
  updateEstadoFactura,
  deleteFactura,
  getFacturaPDF,
  getFacturaXML,
  getFacturaCSV,
};
