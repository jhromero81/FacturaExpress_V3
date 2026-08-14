/**
 * controllers/reportes.controller.js
 * Controlador del modulo de reportes y estadisticas.
 * Agrega los datos de facturacion para alimentar el Dashboard
 * y la vista de reportes del frontend.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { registrarAuditoria } = require('../utils/auditoria');
const pdfService = require('../services/pdf.service');

/** Meta mensual de ventas en COP (consistente con el frontend) */
const META_VENTAS_MENSUAL = 6400000;

/** Expresiones y rangos de agrupacion por periodo */
const PERIODOS = {
  semanal: { sql: `DATE_FORMAT(fecha, '%Y-%u')`, dias: 7 },
  mensual: { sql: `DATE_FORMAT(fecha, '%Y-%m')`, dias: 30 },
  trimestral: { sql: `CONCAT(YEAR(fecha), '-Q', QUARTER(fecha))`, dias: 90 },
  anual: { sql: `DATE_FORMAT(fecha, '%Y')`, dias: 365 },
};

/**
 * GET /api/reportes/kpis
 * Indicadores clave del sistema: ventas del dia, facturas
 * emitidas, pendientes DIAN, ticket promedio, ventas del mes,
 * clientes nuevos y avance de la meta mensual.
 */
const getKPIs = asyncHandler(async (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);

  // Ventas y facturas del dia actual
  const [hoyRows] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS ventas
       FROM facturas
      WHERE DATE(fecha) = ?`,
    [hoy]
  );

  // Facturas pendientes ante la DIAN
  const [pendientesRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM facturas WHERE estado = 'pendiente'"
  );

  // Ventas totales y cantidad de facturas
  const [totalesRows] = await pool.query(
    `SELECT COUNT(*) AS total_facturas, COALESCE(SUM(total), 0) AS ventas_totales
       FROM facturas WHERE estado <> 'rechazada'`
  );

  // Clientes registrados en los ultimos 30 dias
  const [nuevosRows] = await pool.query(
    'SELECT COUNT(*) AS total FROM clientes WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
  );

  // Productos vendidos (suma de cantidades en items)
  const [productosRows] = await pool.query(
    'SELECT COALESCE(SUM(cantidad), 0) AS total FROM factura_items'
  );

  const facturasHoy = Number(hoyRows[0].cantidad);
  const ventasDia = Number(hoyRows[0].ventas);
  const totalFacturas = Number(totalesRows[0].total_facturas);
  const ventasMes = Number(totalesRows[0].ventas_totales);

  res.json({
    success: true,
    kpis: {
      ventasDia,
      facturasEmitidasHoy: facturasHoy,
      facturasEmitidas: totalFacturas,
      pendientesDIAN: Number(pendientesRows[0].total),
      ticketPromedio: facturasHoy > 0 ? Math.round(ventasDia / facturasHoy) : 0,
      ventasMes,
      clientesNuevos: Number(nuevosRows[0].total),
      productosVendidos: Number(productosRows[0].total),
      metaVentasMensual: META_VENTAS_MENSUAL,
      avanceMeta: Math.min(Math.round((ventasMes / META_VENTAS_MENSUAL) * 100), 100),
    },
  });
});

/**
 * GET /api/reportes/ventas-semanales
 * Ventas agrupadas por dia de los ultimos 7 dias para el grafico
 * del Dashboard.
 */
const getVentasSemanales = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE(fecha) AS dia,
            COUNT(*) AS facturas,
            COALESCE(SUM(total), 0) AS total
       FROM facturas
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND estado <> 'rechazada'
      GROUP BY DATE(fecha)
      ORDER BY dia ASC`
  );

  const dias = rows.map((r) => ({
    dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia),
    facturas: Number(r.facturas),
    total: Number(r.total),
  }));

  res.json({ success: true, ventas: dias });
});

/**
 * GET /api/reportes/ventas-periodo?periodo=mensual
 * Comparativa de ventas del periodo actual vs el periodo anterior
 * (ventana previa de la misma duracion). Devuelve ambas series
 * agrupadas por periodo para el grafico comparativo.
 * Valores de periodo: semanal, mensual, trimestral, anual.
 */
const getVentasPeriodo = asyncHandler(async (req, res) => {
  const { periodo = 'mensual' } = req.query;
  const config = PERIODOS[periodo] || PERIODOS.mensual;

  // Ventana actual: ultimos N dias hasta hoy
  const [rows] = await pool.query(
    `SELECT ${config.sql} AS periodo,
            COUNT(*) AS facturas,
            COALESCE(SUM(total), 0) AS total
       FROM facturas
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND estado <> 'rechazada'
      GROUP BY periodo
      ORDER BY periodo ASC`,
    [config.dias]
  );

  // Ventana anterior: los N dias previos al inicio de la actual
  const [rowsAnterior] = await pool.query(
    `SELECT ${config.sql} AS periodo,
            COUNT(*) AS facturas,
            COALESCE(SUM(total), 0) AS total
       FROM facturas
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND fecha < DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND estado <> 'rechazada'
      GROUP BY periodo
      ORDER BY periodo ASC`,
    [config.dias * 2, config.dias]
  );

  const serieActual = new Map(rows.map((r) => [r.periodo, r]));
  const serieAnterior = new Map(rowsAnterior.map((r) => [r.periodo, r]));

  // Union de etiquetas de ambas ventanas, ordenadas cronologicamente
  const etiquetas = [...new Set([...serieActual.keys(), ...serieAnterior.keys()])].sort();

  const ventas = etiquetas.map((label) => {
    const actual = serieActual.get(label);
    const anterior = serieAnterior.get(label);
    return {
      periodo: label,
      total: Number(actual?.total) || 0,
      facturas: Number(actual?.facturas) || 0,
      anterior: Number(anterior?.total) || 0,
      anteriorFacturas: Number(anterior?.facturas) || 0,
    };
  });

  res.json({
    success: true,
    periodo,
    ventas,
  });
});

/**
 * GET /api/reportes/productos-top?limite=3
 * Productos mas vendidos segun la cantidad acumulada en los
 * items de todas las facturas.
 */
const getProductosTop = asyncHandler(async (req, res) => {
  const limite = Math.min(Number(req.query.limite || 5), 20);

  const [rows] = await pool.query(
    `SELECT fi.producto_id, fi.codigo, fi.nombre,
            SUM(fi.cantidad) AS vendidos,
            COALESCE(SUM(fi.subtotal), 0) AS ingresos
       FROM factura_items fi
       JOIN facturas f ON f.id = fi.factura_id
      WHERE f.estado <> 'rechazada'
      GROUP BY fi.producto_id, fi.codigo, fi.nombre
      ORDER BY vendidos DESC
      LIMIT ?`,
    [limite]
  );

  res.json({
    success: true,
    productos: rows.map((r) => ({
      id: r.producto_id,
      codigo: r.codigo,
      nombre: r.nombre,
      vendidos: Number(r.vendidos),
      ingresos: Number(r.ingresos),
    })),
  });
});

/**
 * GET /api/reportes/ultimas-transacciones?limite=4
 * Ultimas facturas emitidas para la lista de transacciones
 * recientes del Dashboard.
 */
const getUltimasTransacciones = asyncHandler(async (req, res) => {
  const limite = Math.min(Number(req.query.limite || 4), 20);

  const [rows] = await pool.query(
    `SELECT id, numero, fecha, cliente_nombre, total, estado
       FROM facturas
      ORDER BY fecha DESC
      LIMIT ?`,
    [limite]
  );

  res.json({
    success: true,
    transacciones: rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      fecha: r.fecha instanceof Date ? r.fecha.toISOString() : r.fecha,
      cliente: r.cliente_nombre,
      total: Number(r.total),
      estado: r.estado,
    })),
  });
});

/**
 * GET /api/reportes/pdf?periodo=mensual
 * Genera el PDF del reporte de ventas del periodo indicado y
 * registra el reporte en la tabla reportes.
 */
const getReportePDF = asyncHandler(async (req, res) => {
  const { periodo = 'mensual' } = req.query;
  const config = PERIODOS[periodo] || PERIODOS.mensual;

  // Datos agregados del periodo
  const [kpisRows] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS ventas
       FROM facturas
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND estado <> 'rechazada'`,
    [config.dias]
  );

  const [ventasRows] = await pool.query(
    `SELECT ${config.sql} AS periodo,
            COALESCE(SUM(total), 0) AS total
       FROM facturas
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND estado <> 'rechazada'
      GROUP BY periodo
      ORDER BY periodo ASC`,
    [config.dias]
  );

  const [topRows] = await pool.query(
    `SELECT fi.codigo, fi.nombre, SUM(fi.cantidad) AS vendidos,
            COALESCE(SUM(fi.subtotal), 0) AS ingresos
       FROM factura_items fi
       JOIN facturas f ON f.id = fi.factura_id
      WHERE f.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND f.estado <> 'rechazada'
      GROUP BY fi.codigo, fi.nombre
      ORDER BY vendidos DESC
      LIMIT 10`,
    [config.dias]
  );

  const [empresas] = await pool.query(
    'SELECT nit, razon_social FROM empresa WHERE id = 1'
  );
  const empresa = empresas[0] || { nit: '', razon_social: 'FacturaExpress' };

  const kpis = {
    facturas: Number(kpisRows[0].cantidad),
    ventas: Number(kpisRows[0].ventas),
    productos: topRows.reduce((sum, r) => sum + Number(r.vendidos), 0),
  };
  const ventasPeriodo = ventasRows.map((r) => ({
    periodo: r.periodo,
    total: Number(r.total),
  }));
  const topProductos = topRows.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    vendidos: Number(r.vendidos),
    ingresos: Number(r.ingresos),
  }));

  const pdfBuffer = await pdfService.generarPdfReporte({
    periodo,
    kpis,
    ventasPeriodo,
    topProductos,
    empresa,
  });

  // Guardar el historial del reporte
  await pool.query(
    'INSERT INTO reportes (tipo, periodo, archivo, tamano) VALUES (?, ?, ?, ?)',
    [
      'pdf',
      periodo,
      `reporte-${periodo}-${new Date().toISOString().slice(0, 10)}.pdf`,
      pdfBuffer.length,
    ]
  );
  await registrarAuditoria(req, `REPORTE PDF generado periodo=${periodo}`, 'reportes');

  const nombreArchivo = `reporte-ventas-${periodo}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(pdfBuffer);
});

/**
 * GET /api/reportes/historial
 * Lista los reportes generados previamente en el sistema.
 */
const listReportes = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, tipo, periodo, archivo, tamano, created_at
       FROM reportes
      ORDER BY created_at DESC
      LIMIT 100`
  );

  res.json({
    success: true,
    reportes: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      periodo: r.periodo,
      archivo: r.archivo,
      tamano: Number(r.tamano),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })),
  });
});

module.exports = {
  getKPIs,
  getVentasSemanales,
  getVentasPeriodo,
  getProductosTop,
  getUltimasTransacciones,
  getReportePDF,
  listReportes,
};
