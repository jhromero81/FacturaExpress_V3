/**
 * test/helpers.test.js
 * Pruebas unitarias de las funciones auxiliares de logica de negocio
 * (utils/helpers.js) usando el runner nativo de Node (node --test).
 *
 * El modulo config/db se reemplaza con un stub para que la prueba de
 * generateInvoiceNumber() no requiera una conexion real a MySQL.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---- Stub de config/db antes de cargar helpers.js -------------------------
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async (sql) => {
        const q = String(sql);
        if (q.includes('GET_LOCK')) return [[{ ok: 1 }]];
        if (q.includes('RELEASE_LOCK')) return [[{ ok: 1 }]];
        return [[{ total: 4 }]];
      },
    },
    testConnection: async () => {},
  },
};

const helpers = require('../utils/helpers');
const dbStub = require('../config/db');

// ============================================================
// calcularIVA
// ============================================================
test('calcularIVA aplica la tasa del 19% redondeada a enteros', () => {
  assert.equal(helpers.calcularIVA(100000), 19000);
  assert.equal(helpers.calcularIVA(1000), 190);
  assert.equal(helpers.calcularIVA(0), 0);
});

test('calcularIVA redondea correctamente fracciones', () => {
  assert.equal(helpers.calcularIVA(53), Math.round(53 * 0.19)); // 10
  assert.equal(helpers.calcularIVA(1), Math.round(1 * 0.19)); // 0
});

// ============================================================
// isValidPositiveInt
// ============================================================
test('isValidPositiveInt acepta enteros positivos', () => {
  assert.equal(helpers.isValidPositiveInt(5), true);
  assert.equal(helpers.isValidPositiveInt('7'), true);
});

test('isValidPositiveInt rechaza no enteros y no positivos', () => {
  assert.equal(helpers.isValidPositiveInt(0), false);
  assert.equal(helpers.isValidPositiveInt(-3), false);
  assert.equal(helpers.isValidPositiveInt(2.5), false);
  assert.equal(helpers.isValidPositiveInt('abc'), false);
  assert.equal(helpers.isValidPositiveInt(null), false);
  assert.equal(helpers.isValidPositiveInt(undefined), false);
});

// ============================================================
// isRequiredString
// ============================================================
test('isRequiredString acepta texto con contenido', () => {
  assert.equal(helpers.isRequiredString('hola'), true);
  assert.equal(helpers.isRequiredString('   texto  '), true);
});

test('isRequiredString rechaza vacios, espacios y no strings', () => {
  assert.equal(helpers.isRequiredString(''), false);
  assert.equal(helpers.isRequiredString('   '), false);
  assert.equal(helpers.isRequiredString(123), false);
  assert.equal(helpers.isRequiredString(null), false);
  assert.equal(helpers.isRequiredString(undefined), false);
});

// ============================================================
// escapeXML
// ============================================================
test('escapeXML escapa los 5 caracteres especiales de XML', () => {
  assert.equal(helpers.escapeXML('<a & "b" \'c\' >'), '&lt;a &amp; &quot;b&quot; &apos;c&apos; &gt;');
});

test('escapeXML devuelve vacio para nulos', () => {
  assert.equal(helpers.escapeXML(null), '');
  assert.equal(helpers.escapeXML(undefined), '');
});

test('escapeXML deja texto plano sin alterar', () => {
  assert.equal(helpers.escapeXML('FAC-202608-00001'), 'FAC-202608-00001');
});

// ============================================================
// escapeCSV
// ============================================================
test('escapeCSV entrecomilla y duplica comillas cuando es necesario', () => {
  assert.equal(helpers.escapeCSV('a,b'), '"a,b"');
  assert.equal(helpers.escapeCSV('di "hola"'), '"di ""hola"""');
  assert.equal(helpers.escapeCSV('linea1\nlinea2'), '"linea1\nlinea2"');
});

test('escapeCSV deja sin comillas el texto simple y maneja nulos', () => {
  assert.equal(helpers.escapeCSV('simple'), 'simple');
  assert.equal(helpers.escapeCSV(null), '');
  assert.equal(helpers.escapeCSV(undefined), '');
});

test('escapeCSV neutraliza la inyeccion de formulas', () => {
  // Excel/Sheets ejecutan como formula las celdas que empiezan por = + @
  assert.equal(helpers.escapeCSV('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(helpers.escapeCSV('+1+1'), "'+1+1");
  assert.equal(helpers.escapeCSV('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(helpers.escapeCSV('-2+3+cmd'), "'-2+3+cmd");
  assert.equal(helpers.escapeCSV('\t=1+1'), "'\t=1+1");
});

test('escapeCSV no altera los numeros ni los negativos legitimos', () => {
  assert.equal(helpers.escapeCSV(-1500), '-1500');
  assert.equal(helpers.escapeCSV(-1500.5), '-1500.5');
  assert.equal(helpers.escapeCSV('-1500'), '-1500');
  assert.equal(helpers.escapeCSV('FAC-202609-00001'), 'FAC-202609-00001');
});

test('escapeHTML neutraliza el marcado', () => {
  assert.equal(
    helpers.escapeHTML('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;'
  );
  assert.equal(helpers.escapeHTML('a & b "c" \'d\''), 'a &amp; b &quot;c&quot; &#39;d&#39;');
  assert.equal(helpers.escapeHTML(null), '');
});

test('asString tolera valores no textuales del query string', () => {
  assert.equal(helpers.asString('texto'), 'texto');
  assert.equal(helpers.asString(42), '42');
  // ?q=a&q=b entrega un arreglo: antes provocaba un 500 al llamar .trim()
  assert.equal(helpers.asString(['a', 'b']), '');
  assert.equal(helpers.asString({ a: 1 }), '');
  assert.equal(helpers.asString(undefined), '');
  assert.equal(helpers.asString(undefined, 'defecto'), 'defecto');
});

test('calcularIVA respeta la tarifa indicada por producto', () => {
  assert.equal(helpers.calcularIVA(100000, 0.19), 19000);
  assert.equal(helpers.calcularIVA(100000, 0.05), 5000);
  assert.equal(helpers.calcularIVA(100000, 0), 0);
  // Una tarifa invalida cae a la general en lugar de producir NaN
  assert.equal(helpers.calcularIVA(100000, 'no-es-numero'), 19000);
  assert.equal(helpers.calcularIVA(100000), 19000);
});

// ============================================================
// mapItemRow
// ============================================================
test('mapItemRow normaliza una fila de factura_items', () => {
  const item = helpers.mapItemRow({
    producto_id: 2,
    codigo: 'PRD-001',
    nombre: 'Producto',
    cantidad: 3,
    precio_unitario: '1000.00',
    iva: '190.00',
    subtotal: '3000.00',
  });
  assert.deepEqual(item, {
    id: 2,
    codigo: 'PRD-001',
    nombre: 'Producto',
    cantidad: 3,
    precioUnitario: 1000,
    iva: 190,
    subtotal: 3000,
  });
});

// ============================================================
// mapFacturaRow
// ============================================================
test('mapFacturaRow normaliza una fila de facturas', () => {
  const factura = helpers.mapFacturaRow({
    id: 1,
    numero: 'FAC-202608-00001',
    fecha: new Date('2026-08-14T12:00:00Z'),
    cliente_id: 5,
    cliente_identificacion: '900.123.456-7',
    cliente_nombre: 'Cliente',
    subtotal: '100000.00',
    iva: '19000.00',
    descuento: '10000.00',
    total: '109000.00',
    estado: 'enviada',
    cufe: 'ABC',
    firma_estado: 'firmada',
    intentos_dian: 2,
    correo_enviado: 1,
  });
  assert.equal(factura.numero, 'FAC-202608-00001');
  assert.equal(factura.fecha, '2026-08-14T12:00:00.000Z');
  assert.deepEqual(factura.cliente, { id: 5, identificacion: '900.123.456-7', nombre: 'Cliente' });
  assert.equal(factura.subtotal, 100000);
  assert.equal(factura.total, 109000);
  assert.equal(factura.estado, 'enviada');
  assert.equal(factura.cufe, 'ABC');
  assert.equal(factura.firmaEstado, 'firmada');
  assert.equal(factura.intentosDian, 2);
  assert.equal(factura.correoEnviado, true);
});

test('mapFacturaRow usa valores por defecto cuando faltan campos', () => {
  const factura = helpers.mapFacturaRow({
    id: 2,
    numero: 'FAC-202608-00002',
    fecha: '2026-08-14',
    cliente_id: 1,
    cliente_identificacion: '1',
    cliente_nombre: 'C',
    subtotal: '0.00',
    iva: '0.00',
    descuento: '0.00',
    total: '0.00',
    estado: 'pendiente',
  });
  assert.equal(factura.cufe, null);
  assert.equal(factura.firmaEstado, 'pendiente');
  assert.equal(factura.intentosDian, 0);
  assert.equal(factura.correoEnviado, false);
});

// ============================================================
// mapClienteRow y mapProductoRow
// ============================================================
test('mapClienteRow y mapProductoRow normalizan sus filas', () => {
  const cliente = helpers.mapClienteRow({
    id: 3,
    identificacion: '901.1-1',
    nombre: 'Cliente A',
    email: 'a@b.co',
    telefono: '3000000000',
  });
  assert.deepEqual(cliente, { id: 3, identificacion: '901.1-1', nombre: 'Cliente A', email: 'a@b.co', telefono: '3000000000' });

  const producto = helpers.mapProductoRow({
    id: 4,
    codigo: 'PRD-004',
    nombre: 'Producto D',
    precio: '25000.00',
    iva: '0.19',
    stock: 10,
  });
  assert.deepEqual(producto, { id: 4, codigo: 'PRD-004', nombre: 'Producto D', precio: 25000, iva: 0.19, stock: 10 });
});

// ============================================================
// generateInvoiceNumber / calcularSiguienteNumero
// ============================================================

/**
 * Instala un stub del pool que responde a las sentencias de la secuencia
 * persistente de numeracion.
 * @param {number} ultimo - Valor que devuelve la secuencia.
 */
function stubSecuencia(ultimo) {
  dbStub.pool.query = async (sql) => {
    const q = String(sql);
    if (q.includes('GET_LOCK')) return [[{ ok: 1 }]];
    if (q.includes('RELEASE_LOCK')) return [[{ ok: 1 }]];
    if (q.includes('INSERT INTO secuencias_facturas')) return [{ affectedRows: 1 }];
    if (q.includes('SELECT ultimo FROM secuencias_facturas')) return [[{ ultimo }]];
    return [[]];
  };
}

test('generateInvoiceNumber toma el consecutivo de la secuencia persistente', async () => {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, '0');

  stubSecuencia(5);
  assert.equal(await helpers.generateInvoiceNumber(), `FAC-${year}${month}-00005`);

  stubSecuencia(1);
  assert.equal(await helpers.generateInvoiceNumber(), `FAC-${year}${month}-00001`);

  stubSecuencia(100);
  assert.equal(await helpers.generateInvoiceNumber(), `FAC-${year}${month}-00100`);
});

test('la numeracion usa la secuencia y no el conteo de facturas (regresion)', async () => {
  const llamadas = [];
  dbStub.pool.query = async (sql) => {
    const q = String(sql);
    llamadas.push(q);
    if (q.includes('GET_LOCK')) return [[{ ok: 1 }]];
    if (q.includes('RELEASE_LOCK')) return [[{ ok: 1 }]];
    if (q.includes('INSERT INTO secuencias_facturas')) return [{ affectedRows: 1 }];
    if (q.includes('SELECT ultimo FROM secuencias_facturas')) return [[{ ultimo: 3 }]];
    return [[{ total: 0 }]];
  };

  await helpers.generateInvoiceNumber();

  // Eliminar una factura ya no puede alterar el consecutivo: la consulta
  // de conteo sobre facturas no debe ejecutarse.
  assert.equal(
    llamadas.some((q) => q.includes('COUNT(*)') && q.includes('FROM facturas')),
    false,
    'la numeracion no debe contar facturas'
  );
  assert.equal(
    llamadas.some((q) => q.includes('INSERT INTO secuencias_facturas')),
    true,
    'la numeracion debe reservar el numero en secuencias_facturas'
  );
});

test('calcularSiguienteNumero acepta un prefijo explicito', async () => {
  dbStub.pool.query = async (sql) => {
    const q = String(sql);
    if (q.includes('SELECT ultimo FROM secuencias_facturas')) return [[{ ultimo: 7 }]];
    return [{ affectedRows: 1 }];
  };
  assert.equal(await helpers.calcularSiguienteNumero(dbStub.pool, 'FAC-202501-'), 'FAC-202501-00007');
});
