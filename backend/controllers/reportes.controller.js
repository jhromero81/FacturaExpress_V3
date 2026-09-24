/**
 * controllers/reportes.controller.js
 * Controlador del modulo de reportes y estadisticas.
 * Agrega los datos de facturacion para alimentar el Dashboard
 * y la vista de reportes del frontend.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { registrarAuditoria } = require('../utils/auditoria');
const { clampInt, asString } = require('../utils/helpers');
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

/** Periodo por defecto cuando el solicitado no es valido */
const PERIODO_DEFECTO = 'mensual';

/**
 * Resuelve el periodo solicitado contra la lista blanca.
 *
 * Antes se hacia `PERIODOS[periodo] || PERIODOS.mensual`, que consultaba
 * la cadena en el prototipo del objeto: `?periodo=constructor` devolvia
 * una funcion, `config.sql` quedaba undefined y la consulta fallaba con
 * "Unknown column 'undefined'" (HTTP 500).
 *
 * @param {*} valor - Valor crudo del query string.
 * @returns {string} Clave de periodo valida.
 */
function resolverPeriodo(valor) {
  const clave = asString(valor, PERIODO_DEFECTO).trim();
  return Object.hasOwn(PERIODOS, clave) ? clave : PERIODO_DEFECTO;
}

/**
 * GET /api/reportes/kpis
 * Indicadores clave del sistema. Los indicadores etiquetados como del
 * mes se calculan realmente sobre el mes en curso: antes se sumaban
 * TODAS las facturas historicas y el dashboard mostraba el acumulado
 * como si fuera el mes actual.
 *
 * Las fechas se comparan dentro de MySQL (CURDATE) y no con la fecha del
 * proceso Node, de modo que no hay desfase entre zonas horarias.
 */
const getKPIs = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM facturas
         WHERE DATE(fecha) = CURDATE() AND estado <> 'rechazada') AS facturas_hoy,
       (SELECT COALESCE(SUM(total), 0) FROM facturas
         WHERE DATE(fecha) = CURDATE() AND estado <> 'rechazada') AS ventas_hoy,
       (SELECT COALESCE(SUM(total), 0) FROM facturas
         WHERE DATE(fecha) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
           AND estado <> 'rechazada') AS ventas_ayer,
       (SELECT COUNT(*) FROM facturas WHERE estado = 'pendiente') AS pendientes,
       (SELECT COUNT(*) FROM facturas
         WHERE DATE_FORMAT(fecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
           AND estado <> 'rechazada') AS facturas_mes,
       (SELECT COALESCE(SUM(total), 0) FROM facturas
         WHERE DATE_FORMAT(fecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
           AND estado <> 'rechazada') AS ventas_mes,
       (SELECT COUNT(*) FROM clientes
         WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS clientes_nuevos,
       (SELECT COALESCE(SUM(fi.cantidad), 0)
          FROM factura_items fi
          JOIN facturas f ON f.id = fi.factura_id
         WHERE DATE_FORMAT(f.fecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
           AND f.estado <> 'rechazada') AS productos_vendidos`
  );

  const k = rows[0];
  const facturasHoy = Number(k.facturas_hoy);
  const ventasDia = Number(k.ventas_hoy);
  const ventasAyer = Number(k.ventas_ayer);
  const ventasMes = Number(k.ventas_mes);

  res.json({
    success: true,
    kpis: {
      ventasDia,
      ventasAyer,
      facturasEmitidasHoy: facturasHoy,
      facturasEmitidas: Number(k.facturas_mes),
      pendientesDIAN: Number(k.pendientes),
      ticketPromedio: facturasHoy > 0 ? Math.round(ventasDia / facturasHoy) : 0,
      ventasMes,
      clientesNuevos: Number(k.clientes_nuevos),
      productosVendidos: Number(k.productos_vendidos),
      metaVentasMensual: META_VENTAS_MENSUAL,
      avanceMeta: Math.min(Math.round((ventasMes / META_VENTAS_MENSUAL) * 100), 100),
    },
  });
});

/**
 * GET /api/reportes/ventas-semanales
 * Ventas de los ultimos 7 dias para el grafico del Dashboard.
 * Devuelve SIEMPRE los 7 dias (con ceros donde no hubo ventas) para que
 * el eje del grafico no dependa de la fecha del navegador: antes el
 * frontend reconstruia las etiquetas con su propio reloj y, si el
 * navegador estaba en otra zona horaria, las claves no coincidian y el
 * grafico mostraba todo en cero.
 */
const getVentasSemanales = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `WITH RECURSIVE dias AS (
       SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY) AS dia
       UNION ALL
       SELECT DATE_ADD(dia, INTERVAL 1 DAY) FROM dias WHERE dia < CURDATE()
     )
     SELECT d.dia AS dia,
            COUNT(f.id) AS facturas,
            COALESCE(SUM(f.total), 0) AS total
       FROM dias d
       LEFT JOIN facturas f
         ON DATE(f.fecha) = d.dia AND f.estado <> 'rechazada'
      GROUP BY d.dia
      ORDER BY d.dia ASC`
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
  const periodo = resolverPeriodo(req.query.periodo);
  const config = PERIODOS[periodo];

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
  const limite = clampInt(req.query.limite, 1, 20, 5);

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
  const limite = clampInt(req.query.limite, 1, 20, 4);

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
  const periodo = resolverPeriodo(req.query.periodo);
  const config = PERIODOS[periodo];

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

  // Guardar el historial del reporte. Se registra el usuario que lo
  // genero y el rango de fechas cubierto (la tabla ya tenia esas columnas
  // pero nunca se llenaban, de modo que el historial no era atribuible).
  const hoy = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO reportes (tipo, periodo, fecha_inicio, fecha_fin, archivo, tamano, usuario_id)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL ? DAY), CURDATE(), ?, ?, ?)`,
    [
      'pdf',
      periodo,
      config.dias,
      `reporte-${periodo}-${hoy}.pdf`,
      pdfBuffer.length,
      req.usuario?.id ?? null,
    ]
  );
  await registrarAuditoria(req, `REPORTE PDF generado periodo=${periodo}`, 'reportes');

  // El nombre del archivo se construye solo con la clave de periodo, que
  // ya esta validada contra la lista blanca.
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
