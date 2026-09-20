/**
 * test/integracion/facturas.api.test.js
 * Pruebas de INTEGRACION (capa intermedia de la piramide de pruebas) del
 * modulo de facturacion. Se ejercita la pila completa:
 *
 *   HTTP (Express) -> router -> middlewares (authenticate/authorize/validate)
 *   -> controlador -> utilidades de negocio -> capa DAO (doble de MySQL)
 *   -> manejo centralizado de errores (JSON consistente)
 *
 * El doble de la capa de acceso a datos reproduce el contrato de mysql2
 * (pool.query, getConnection, beginTransaction, commit, rollback) y registra
 * la traza de sentencias, de modo que las pruebas verifican:
 *   - El calculo financiero del servidor (subtotal, descuento %, IVA y total).
 *   - La atomicidad: commit en exito y rollback ante fallo (ACID).
 *   - El descuento/restitucion de stock sin permitir valores negativos.
 *   - El control de acceso por rol (401/403) y la validacion de entrada (400).
 *
 * No requiere MySQL ni servidor de correo: la prueba aislada es reproducible
 * en cualquier equipo (CI) y complementa las pruebas de extremo a extremo
 * que si corren contra la base de datos real (scripts/pruebas-aceptacion.js).
 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// ============================================================
// Traza y escenario en curso
// ============================================================
const traza = { sqls: [], commits: 0, rollbacks: 0, stock: [], auditorias: [] };
let escenario = null;
let secuenciaUsuarios = 0;

/** Reinicia la traza y define el escenario (rol, stock, fallos simulados). */
function prepararEscenario(opciones = {}) {
  traza.sqls.length = 0;
  traza.stock.length = 0;
  traza.auditorias.length = 0;
  traza.commits = 0;
  traza.rollbacks = 0;

  escenario = {
    usuarioId: ++secuenciaUsuarios, // id unico: evita el cache de sesion de auth.js
    rol: 'vendedor',
    stockProducto: 10,
    tarifaIva: 0.19,
    afectarStock: true,
    facturaExiste: true,
    clienteExiste: true,
    estadoFactura: 'pendiente',
    firmaEstado: 'pendiente',
    intentosDian: 0,
    secuencia: 4, // la reserva de numero la incrementa a 5
    insertFactura: null,
    insertItems: null,
    ultimoEstado: null,
    ultimaFirma: null,
    ultimosIntentos: null,
    ...opciones,
  };
  return escenario;
}

// ============================================================
// Doble de la base de datos (config/db)
// ============================================================

/** Filas del catalogo de productos solicitadas por el controlador. */
function filasProductos(ids) {
  const catalogo = {
    1: { codigo: 'PRD-001', nombre: 'Camiseta polo', precio: 25000 },
    2: { codigo: 'PRD-002', nombre: 'Gorra bordada', precio: 10000 },
  };
  return ids.map((id) => {
    const base = catalogo[id] || { codigo: `PRD-${id}`, nombre: `Producto ${id}`, precio: 5000 };
    return {
      id: Number(id),
      codigo: base.codigo,
      nombre: base.nombre,
      precio: base.precio,
      iva: Number(escenario.tarifaIva),
      stock: Number(escenario.stockProducto),
      activo: 1,
    };
  });
}

/** Cabecera de factura derivada del INSERT real ejecutado por el controlador. */
function filaFactura() {
  const p = escenario.insertFactura || [];
  return {
    id: 7,
    numero: p[0],
    fecha: new Date('2026-09-20T15:00:00Z'),
    cliente_id: p[1],
    cliente_identificacion: p[2],
    cliente_nombre: p[3],
    subtotal: p[4],
    iva: p[5],
    descuento: p[6],
    total: p[7],
    estado: escenario.ultimoEstado || escenario.estadoFactura,
    cufe: p[8],
    firma_estado: escenario.ultimaFirma || escenario.firmaEstado,
    intentos_dian: escenario.ultimosIntentos ?? escenario.intentosDian,
    correo_enviado: 0,
  };
}

/** Items de la factura derivados del INSERT multiple real. */
function filasItems() {
  const p = escenario.insertItems || [];
  const items = [];
  for (let i = 0; i + 7 < p.length; i += 8) {
    items.push({
      producto_id: p[i + 1],
      codigo: p[i + 2],
      nombre: p[i + 3],
      cantidad: p[i + 4],
      precio_unitario: p[i + 5],
      iva: p[i + 6],
      subtotal: p[i + 7],
    });
  }
  return items;
}

/** Simula la respuesta de mysql2 a una sentencia SQL. */
function responder(sqlCrudo, params = []) {
  const sql = String(sqlCrudo).replace(/\s+/g, ' ').trim();
  traza.sqls.push(sql);

  // Advisory lock de numeracion de facturas
  if (sql.includes('GET_LOCK') || sql.includes('RELEASE_LOCK')) return [[{ ok: 1 }]];

  // Estado de sesion consultado por authenticate()
  if (sql.includes('tokens_revocados')) return [[]];
  if (sql.includes('FROM usuarios')) {
    return [[{ activo: 1, rol: escenario.rol, token_version: 0 }]];
  }

  // Numeracion: la secuencia persistente no depende del conteo de facturas
  if (sql.includes('INSERT INTO secuencias_facturas')) {
    escenario.secuencia += 1;
    return [{ affectedRows: 1 }];
  }
  if (sql.includes('SELECT ultimo FROM secuencias_facturas')) {
    return [[{ ultimo: escenario.secuencia }]];
  }

  // Catalogos
  if (sql.includes('FROM clientes')) {
    return escenario.clienteExiste
      ? [[{ id: 1, identificacion: '900.123.456-7', nombre: 'Cliente Demo', email: 'demo@correo.com' }]]
      : [[]];
  }
  if (sql.includes('FROM productos') && sql.includes('IN (')) {
    return [filasProductos(params.map(Number))];
  }
  if (sql.includes('FROM empresa')) return [[]];

  // Escrituras de la venta
  if (sql.includes('INSERT INTO facturas')) {
    escenario.insertFactura = params;
    return [{ insertId: 7, affectedRows: 1 }];
  }
  if (sql.includes('INSERT INTO factura_items')) {
    escenario.insertItems = params;
    return [{ affectedRows: params.length / 8 }];
  }
  if (sql.startsWith('UPDATE productos SET stock = stock -')) {
    traza.stock.push({ operacion: 'descuento', cantidad: params[0], productoId: params[1] });
    // affectedRows = 0 simula que otra venta concurrente consumio el stock
    return [{ affectedRows: escenario.afectarStock ? 1 : 0 }];
  }
  if (sql.startsWith('UPDATE productos SET stock = stock +')) {
    traza.stock.push({ operacion: 'restituir', cantidad: params[0], productoId: params[1] });
    return [{ affectedRows: 1 }];
  }

  // Consultas y actualizaciones de estado. Cubre tanto el SELECT del
  // cambio de estado (con firma_estado e intentos_dian) como el de la
  // eliminacion (solo id, numero y estado).
  if (sql.startsWith('SELECT id, numero, estado') && sql.includes('FROM facturas')) {
    return [
      escenario.facturaExiste
        ? [{
            id: 1,
            numero: 'FAC-202609-00005',
            estado: escenario.estadoFactura,
            firma_estado: escenario.firmaEstado,
            intentos_dian: escenario.intentosDian,
          }]
        : [],
    ];
  }
  if (sql.startsWith('UPDATE facturas SET estado')) {
    [escenario.ultimoEstado, escenario.ultimaFirma, escenario.ultimosIntentos] = params;
    escenario.firmaEstado = escenario.ultimaFirma;
    escenario.intentosDian = escenario.ultimosIntentos;
    return [{ affectedRows: 1 }];
  }
  if (sql.startsWith('SELECT producto_id, cantidad FROM factura_items')) {
    return [[{ producto_id: 1, cantidad: 3 }]];
  }
  if (sql.includes('FROM factura_items WHERE factura_id')) return [filasItems()];
  // mysql2 responde [rows, fields]: el controlador desestructura rows[0]
  if (sql.includes('SELECT f.id, f.numero')) return [[filaFactura()]];

  // Bitacoras: la auditoria se registra con el modulo real, sin efectos
  if (sql.includes('INSERT INTO logs_auditoria')) {
    traza.auditorias.push(params[1]);
    return [{ insertId: 1, affectedRows: 1 }];
  }
  if (sql.includes('errores_sistema') || sql.includes('correo_enviado')) {
    return [{ affectedRows: 1 }];
  }

  return [[]];
}

/** Conexion del pool (transacciones). */
function crearConexion() {
  return {
    query: async (sql, params) => responder(sql, params),
    beginTransaction: async () => {},
    commit: async () => {
      traza.commits += 1;
    },
    rollback: async () => {
      traza.rollbacks += 1;
    },
    release: () => {},
  };
}

// El doble se inyecta ANTES de cargar el router: el controlador y el
// middleware de autenticacion obtienen la misma instancia sustituida.
const dbPath = require.resolve('../../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async (sql, params) => responder(sql, params),
      getConnection: async () => crearConexion(),
    },
    testConnection: async () => {},
  },
};

// Aislamiento de la capa de servicios externos (PDF, correo y bitacora de
// errores): no forman parte del objeto de estas pruebas de integracion.
const stubServicio = (ruta, exports) => {
  const rutaAbs = require.resolve(ruta);
  require.cache[rutaAbs] = { id: rutaAbs, filename: rutaAbs, loaded: true, exports };
};

stubServicio('../../services/pdf.service', {
  generarPdfFactura: async () => Buffer.from('%PDF-stub'),
  generarPdfReporte: async () => Buffer.from('%PDF-stub'),
});
stubServicio('../../services/email.service', {
  enviarFactura: async () => false,
  correoConfigurado: () => false,
});
stubServicio('../../utils/errores', { registrarError: async () => {} });

const facturasRouter = require('../../routes/facturas.routes');
const { errorHandler } = require('../../middleware/errorHandler');
const { generateToken } = require('../../config/jwt');

// ============================================================
// Servidor de pruebas (puerto efimero)
// ============================================================
const app = express();
app.use(express.json());
app.use('/api/facturas', facturasRouter);
app.use(errorHandler);

let servidor = null;
let baseUrl = '';
let errorOriginal = null;

before(async () => {
  errorOriginal = console.error;
  if (!process.env.PRUEBAS_VERBOSE) {
    console.error = () => {}; // silencia los logs esperados de errorHandler
  }
  await new Promise((resolve) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  console.error = errorOriginal;
  await new Promise((resolve) => servidor.close(resolve));
});

/**
 * Espera un ciclo de eventos para que finalicen las tareas que el controlador
 * deja en segundo plano (setImmediate -> procesos post-venta) antes de
 * reiniciar la traza en la prueba siguiente.
 */
async function drenarPostVenta() {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

/** Peticion HTTP autenticada como el usuario del escenario en curso. */
async function peticion(metodo, ruta, cuerpo, { autenticado = true } = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (autenticado) {
    const token = generateToken(
      { id: escenario.usuarioId, nit: '900.123.456-7', rol: escenario.rol },
      0
    );
    cabeceras.Authorization = `Bearer ${token}`;
  }
  const respuestaHttp = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuestaHttp.status, body: await respuestaHttp.json() };
}

// ============================================================
// 1. Seguridad de acceso (router + middlewares)
// ============================================================
test('GET /api/facturas sin token responde 401 (middleware authenticate)', async () => {
  prepararEscenario();
  const r = await peticion('GET', '/api/facturas', undefined, { autenticado: false });

  assert.equal(r.status, 401);
  assert.equal(r.body.success, false);
  assert.match(r.body.message, /no autorizado/i);
  assert.equal(traza.sqls.length, 0, 'no debe consultar la base de datos sin credenciales');
});

test('POST /api/facturas exige autenticacion (401 sin token)', async () => {
  prepararEscenario({ rol: 'contador' });
  const r = await peticion(
    'POST',
    '/api/facturas',
    { clienteId: 1, items: [{ productoId: 1, cantidad: 1 }] },
    { autenticado: false }
  );

  assert.equal(r.status, 401);
  assert.equal(traza.commits, 0);
});

test('POST /api/facturas permite emitir al vendedor', async () => {
  prepararEscenario({ rol: 'vendedor' });
  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 1 }],
  });

  assert.equal(r.status, 201);
  assert.equal(traza.commits, 1);

  await drenarPostVenta();
});

test('POST /api/facturas rechaza al contador (403, matriz de permisos)', async () => {
  // La emision de la venta corresponde a admin y vendedor; el contador
  // participa en el ciclo DIAN, no en la venta.
  prepararEscenario({ rol: 'contador' });
  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 1 }],
  });

  assert.equal(r.status, 403);
  assert.equal(traza.commits, 0);
  assert.equal(traza.sqls.some((s) => s.includes('INSERT INTO facturas')), false);
});

test('POST /api/facturas sin items responde 400 con los campos invalidos', async () => {
  prepararEscenario({ rol: 'vendedor' });
  const r = await peticion('POST', '/api/facturas', { clienteId: 1, items: [] });

  assert.equal(r.status, 400);
  assert.ok(Array.isArray(r.body.errors));
  assert.ok(r.body.errors.some((e) => e.campo === 'items'));
  assert.equal(traza.sqls.some((s) => s.includes('GET_LOCK')), false, 'no abre transaccion con datos invalidos');
});

// ============================================================
// 2. Emision de factura: calculo financiero y atomicidad
// ============================================================
test('POST /api/facturas calcula subtotal, descuento, IVA y total y confirma la transaccion', async () => {
  prepararEscenario({ rol: 'vendedor', stockProducto: 10 });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [
      { productoId: 1, cantidad: 3 }, // 3 x 25.000 = 75.000
      { productoId: 2, cantidad: 2 }, // 2 x 10.000 = 20.000
    ],
    descuento: 10,
  });

  // Subtotal 95.000 -> descuento 10% = 9.500 -> base 85.500 -> IVA 19% = 16.245
  assert.equal(r.status, 201, `sentencias: ${traza.sqls.join(' | ')}`);
  assert.equal(r.body.success, true);
  assert.equal(r.body.factura.subtotal, 95000);
  assert.equal(r.body.factura.descuento, 9500);
  assert.equal(r.body.factura.iva, 16245);
  assert.equal(r.body.factura.total, 101745);
  assert.equal(
    r.body.factura.total,
    r.body.factura.subtotal - r.body.factura.descuento + r.body.factura.iva,
    'el total debe cuadrar con la identidad contable'
  );

  // Numeracion consecutiva FAC-YYYYMM-XXXXX bajo advisory lock
  assert.match(r.body.factura.numero, /^FAC-\d{6}-00005$/);
  assert.ok(traza.sqls.some((s) => s.includes('GET_LOCK')), 'toma el lock de numeracion');

  // Consistencia transaccional y efectos en el inventario
  assert.equal(traza.commits, 1);
  assert.equal(traza.rollbacks, 0);
  assert.deepEqual(
    traza.stock.map((s) => [s.productoId, s.cantidad]),
    [
      [1, 3],
      [2, 2],
    ],
    'descuenta el stock exactamente por la cantidad vendida'
  );

  // Los items se persisten con el precio del servidor, no del cliente
  assert.equal(r.body.factura.items.length, 2);
  assert.equal(r.body.factura.items[0].precioUnitario, 25000);
  assert.equal(r.body.factura.items[0].subtotal, 75000);

  // Auditoria de la operacion registrada dentro de la peticion
  assert.equal(traza.auditorias.length, 1);
  assert.match(traza.auditorias[0], /INSERT factura FAC-/);

  await drenarPostVenta();
});

test('POST /api/facturas con descuento del 100% deja base, IVA y total en cero', async () => {
  prepararEscenario({ rol: 'vendedor' });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 1 }],
    descuento: 100,
  });

  assert.equal(r.status, 201);
  assert.equal(r.body.factura.descuento, 25000, 'el descuento se persiste en pesos, no en porcentaje');
  assert.equal(r.body.factura.iva, 0);
  assert.equal(r.body.factura.total, 0);

  await drenarPostVenta();
});

test('POST /api/facturas con descuento fuera de rango responde 400 antes de tocar la base', async () => {
  prepararEscenario({ rol: 'vendedor' });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 1 }],
    descuento: 250,
  });

  assert.equal(r.status, 400);
  assert.ok(r.body.errors.some((e) => e.campo === 'descuento'));
  // Solo se consulta la sesion (authenticate): la capa de negocio no se toca
  assert.equal(
    traza.sqls.some((s) => s.includes('FROM clientes') || s.includes('FROM productos') || s.includes('GET_LOCK')),
    false,
    'la validacion de entrada evita llegar a la capa de negocio'
  );
  assert.equal(traza.commits, 0);
});

// ============================================================
// 3. Reglas de inventario y rollback (ACID)
// ============================================================
test('POST /api/facturas con cantidad mayor al stock responde 409 sin abrir transaccion', async () => {
  prepararEscenario({ rol: 'vendedor', stockProducto: 2 });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 5 }],
  });

  assert.equal(r.status, 409);
  assert.match(r.body.message, /stock insuficiente/i);
  assert.equal(traza.commits, 0);
  assert.equal(traza.rollbacks, 0);
  assert.equal(traza.sqls.some((s) => s.includes('INSERT INTO facturas')), false);
});

test('POST /api/facturas revierte la transaccion si el stock se agoto por concurrencia', async () => {
  prepararEscenario({ rol: 'vendedor', stockProducto: 10, afectarStock: false });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 3 }],
  });

  assert.equal(r.status, 409);
  assert.match(r.body.message, /stock insuficiente/i);
  assert.equal(traza.commits, 0, 'no confirma una venta sin inventario');
  assert.equal(traza.rollbacks, 1, 'la transaccion se revierte (atomicidad)');
});

test('POST /api/facturas rechaza items repetidos para no descontar stock dos veces', async () => {
  prepararEscenario({ rol: 'vendedor' });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [
      { productoId: 1, cantidad: 1 },
      { productoId: 1, cantidad: 2 },
    ],
  });

  assert.equal(r.status, 400);
  assert.match(r.body.message, /mismo producto/i);
  assert.equal(traza.rollbacks, 0);
});

test('POST /api/facturas con cliente inexistente responde 404', async () => {
  prepararEscenario({ rol: 'vendedor', clienteExiste: false });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 1 }],
  });

  assert.equal(r.status, 404);
  assert.match(r.body.message, /cliente no encontrado/i);
  assert.equal(traza.commits, 0);
  assert.equal(traza.rollbacks, 0);
});

test('POST /api/facturas con clienteId no numerico responde 400 con el campo senalado', async () => {
  prepararEscenario({ rol: 'vendedor' });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 'abc',
    items: [{ productoId: 1, cantidad: 1 }],
  });

  assert.equal(r.status, 400);
  assert.equal(r.body.message, 'Datos de entrada invalidos.');
  assert.ok(r.body.errors.some((e) => e.campo === 'clienteId'));
  assert.equal(traza.commits, 0);
});

// ============================================================
// 4. Ciclo de vida DIAN y eliminacion con restitucion de stock
// ============================================================
test('PUT /api/facturas/:id/estado con rol contador marca la factura como enviada', async () => {
  prepararEscenario({ rol: 'contador', estadoFactura: 'pendiente' });

  const r = await peticion('PUT', '/api/facturas/1/estado', { estado: 'enviada' });

  assert.equal(r.status, 200, `sentencias: ${traza.sqls.join(' | ')}`);
  assert.equal(r.body.factura.estado, 'enviada');
  assert.equal(escenario.ultimaFirma, 'firmada');
  assert.equal(escenario.ultimosIntentos, 1, 'cada envio a la DIAN suma un intento');
  assert.match(r.body.message, /enviada/);
  assert.equal(traza.auditorias.length, 1);
});

test('PUT /api/facturas/:id/estado exige autenticacion (401 sin token)', async () => {
  prepararEscenario({ rol: 'vendedor' });

  const r = await peticion(
    'PUT',
    '/api/facturas/1/estado',
    { estado: 'enviada' },
    { autenticado: false }
  );

  assert.equal(r.status, 401);
  assert.equal(escenario.ultimoEstado, null, 'no debe modificar el estado sin credenciales');
});

test('PUT /api/facturas/:id/estado rechaza al vendedor (403, matriz de permisos)', async () => {
  // El cambio de estado DIAN es una funcion contable: admin y contador.
  prepararEscenario({ rol: 'vendedor' });

  const r = await peticion('PUT', '/api/facturas/1/estado', { estado: 'enviada' });

  assert.equal(r.status, 403);
  assert.equal(escenario.ultimoEstado, null, 'no debe modificar el estado sin permiso');
});

// ============================================================
// 5. Regresion: ciclo de estados DIAN completo
// ============================================================
test('PUT /api/facturas/:id/estado marca la factura como rechazada (regresion 500)', async () => {
  // Antes el SELECT no traia firma_estado ni intentos_dian: el contador
  // se enviaba como NULL a una columna NOT NULL y MySQL respondia 500.
  prepararEscenario({ rol: 'contador', estadoFactura: 'pendiente', intentosDian: 2 });

  const r = await peticion('PUT', '/api/facturas/1/estado', { estado: 'rechazada' });

  assert.equal(r.status, 200, `sentencias: ${traza.sqls.join(' | ')}`);
  assert.equal(r.body.factura.estado, 'rechazada');
  assert.equal(escenario.ultimaFirma, 'rechazada');
  assert.equal(escenario.ultimosIntentos, 2, 'los intentos previos no se pierden');
  assert.match(r.body.message, /rechazada/);
});

test('PUT /api/facturas/:id/estado devuelve una factura a pendiente (regresion 500)', async () => {
  prepararEscenario({ rol: 'admin', estadoFactura: 'rechazada', firmaEstado: 'rechazada', intentosDian: 3 });

  const r = await peticion('PUT', '/api/facturas/1/estado', { estado: 'pendiente' });

  assert.equal(r.status, 200, `sentencias: ${traza.sqls.join(' | ')}`);
  assert.equal(r.body.factura.estado, 'pendiente');
  assert.equal(escenario.ultimaFirma, 'pendiente');
  assert.equal(escenario.ultimosIntentos, 3, 'los intentos previos no se pierden');
});

test('PUT /api/facturas/:id/estado acumula los intentos de envio a la DIAN', async () => {
  prepararEscenario({ rol: 'contador', estadoFactura: 'pendiente', intentosDian: 2 });

  const r = await peticion('PUT', '/api/facturas/1/estado', { estado: 'enviada' });

  assert.equal(r.status, 200);
  assert.equal(escenario.ultimaFirma, 'firmada');
  assert.equal(escenario.ultimosIntentos, 3, 'debe incrementar, no reiniciar el contador');
});

test('PUT /api/facturas/:id/estado rechaza un estado fuera del catalogo DIAN', async () => {
  prepararEscenario({ rol: 'admin' });

  const r = await peticion('PUT', '/api/facturas/1/estado', { estado: 'anulada' });

  assert.equal(r.status, 400);
  assert.equal(escenario.ultimoEstado, null);
});

// ============================================================
// 6. Regresion: numeracion persistente e IVA por producto
// ============================================================
test('la numeracion no reutiliza ni duplica numeros tras eliminar facturas (regresion)', async () => {
  // Con COUNT(*)+1, eliminar una factura intermedia hacia que la siguiente
  // venta intentara reutilizar un numero existente (clave duplicada, 500).
  prepararEscenario({ rol: 'admin', estadoFactura: 'pendiente', secuencia: 3 });

  // Eliminar una factura no toca la secuencia
  const baja = await peticion('DELETE', '/api/facturas/1');
  assert.equal(baja.status, 200);
  assert.equal(escenario.secuencia, 3, 'eliminar una factura no retrocede la secuencia');

  // La siguiente venta continua desde la secuencia, no desde el conteo
  prepararEscenario({ rol: 'vendedor', secuencia: 3 });
  const venta = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 1 }],
  });

  assert.equal(venta.status, 201, `sentencias: ${traza.sqls.join(' | ')}`);
  assert.equal(venta.body.factura.numero, 'FAC-202609-00004');
  assert.equal(
    traza.sqls.some((s) => s.includes('COUNT(*)') && s.includes('FROM facturas')),
    false,
    'no debe deducir el consecutivo contando facturas'
  );

  await drenarPostVenta();
});

test('la factura aplica la tarifa de IVA configurada en el producto', async () => {
  // Producto con tarifa del 5%: antes se facturaba siempre al 19%.
  prepararEscenario({ rol: 'vendedor', tarifaIva: 0.05 });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [{ productoId: 1, cantidad: 2 }], // 2 x 25.000 = 50.000
  });

  assert.equal(r.status, 201);
  assert.equal(r.body.factura.subtotal, 50000);
  assert.equal(r.body.factura.iva, 2500, 'el IVA debe ser el 5% de 50.000');
  assert.equal(r.body.factura.total, 52500);
  assert.equal(r.body.factura.items[0].iva, 2500);

  await drenarPostVenta();
});

test('el detalle de la factura cuadra con la cabecera cuando hay descuento', async () => {
  prepararEscenario({ rol: 'vendedor', tarifaIva: 0.19 });

  const r = await peticion('POST', '/api/facturas', {
    clienteId: 1,
    items: [
      { productoId: 1, cantidad: 3 }, // 75.000
      { productoId: 2, cantidad: 2 }, // 20.000
    ],
    descuento: 10,
  });

  assert.equal(r.status, 201);

  const factura = r.body.factura;
  const sumaSubtotales = factura.items.reduce((s, i) => s + i.subtotal, 0);
  const sumaIvas = factura.items.reduce((s, i) => s + i.iva, 0);

  assert.equal(sumaSubtotales, factura.subtotal, 'la suma de subtotales debe cuadrar');
  assert.equal(sumaIvas, factura.iva, 'la suma de IVA de las lineas debe cuadrar con la cabecera');
  assert.equal(factura.subtotal - factura.descuento + factura.iva, factura.total);
  // 95.000 - 9.500 = 85.500 base; IVA 19% sobre la base descontada
  assert.equal(factura.iva, 16245);

  await drenarPostVenta();
});

test('PUT /api/facturas/:id/estado con factura inexistente responde 404', async () => {
  prepararEscenario({ rol: 'admin', facturaExiste: false });

  const r = await peticion('PUT', '/api/facturas/99/estado', { estado: 'rechazada' });

  assert.equal(r.status, 404);
  assert.match(r.body.message, /no encontrada/i);
});

test('DELETE /api/facturas/:id restituye el stock de una factura pendiente', async () => {
  prepararEscenario({ rol: 'admin', estadoFactura: 'pendiente' });

  const r = await peticion('DELETE', '/api/facturas/1');

  assert.equal(r.status, 200);
  assert.equal(traza.rollbacks, 0);
  assert.equal(traza.commits, 1);
  assert.deepEqual(traza.stock, [
    { operacion: 'restituir', cantidad: 3, productoId: 1 },
  ]);
});

test('DELETE /api/facturas/:id rechaza eliminar una factura ya enviada a la DIAN', async () => {
  prepararEscenario({ rol: 'admin', estadoFactura: 'enviada' });

  const r = await peticion('DELETE', '/api/facturas/1');

  assert.equal(r.status, 409);
  assert.match(r.body.message, /enviada a la DIAN/i);
  assert.equal(traza.commits, 0);
  assert.equal(traza.stock.length, 0);
});
