#!/usr/bin/env node
/**
 * productos.api.test.js
 * Pruebas de integración de la API de productos.
 * Sigue el patrón de facturas.api.test.js: pool doble, router real
 * con require.cache sustituido, servidor Express con fetch.
 *
 * El doble reproduce el contrato SQL real del controlador:
 *  - Listado con WHERE activo = 1 y COUNT(*) AS total (paginacion).
 *  - SELECT por id con y sin filtro de activo.
 *  - Verificacion de duplicados por codigo.
 *  - INSERT, reactivacion (UPDATE ... activo = 1), UPDATE COALESCE,
 *    ajuste de stock (stock = stock + ? ... AND stock + ? >= 0)
 *    y baja logica (UPDATE ... activo = 0).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// --- Pool doble ---
const traza = { commits: 0, rollbacks: 0, auditorias: [] };
const escenario = {
  usuarios: {
    1: { id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, credencial: 'hashed' },
    2: { id: 2, nit: '987654321-0', nombre: 'Vendedor', cargo: 'Vendedor', rol: 'vendedor', activo: 1, credencial: 'hashed' },
    3: { id: 3, nit: '888777666-7', nombre: 'Lector', cargo: 'Lector', rol: 'lector', activo: 1, credencial: 'hashed' },
  },
};

function filaProducto(id) {
  const p = escenario.productos[id];
  return { id: Number(id), codigo: p.codigo, nombre: p.nombre, precio: p.precio, iva: p.iva, stock: p.stock };
}

function responder(sql, params) {
  const sqlLimpio = String(sql).replace(/\s+/g, ' ').trim();

  if (sqlLimpio.startsWith('SELECT') && sqlLimpio.includes('FROM usuarios')) {
    const id = params[0];
    const u = escenario.usuarios[id];
    if (!u) return [[]];
    return [[{ id: u.id, nit: u.nit, nombre: u.nombre, cargo: u.cargo, rol: u.rol, activo: u.activo, credencial: u.credencial }]];
  }

  if (sqlLimpio.includes('FROM tokens_revocados')) return [[]];

  if (sqlLimpio.startsWith('INSERT INTO logs_auditoria')) {
    traza.auditorias.push({ tabla: params[1], registro_id: params[2], accion: params[3] });
    return [{ insertId: 1, affectedRows: 1 }];
  }

  if (sqlLimpio.startsWith('SELECT') && sqlLimpio.includes('COUNT(*)') && sqlLimpio.includes('FROM logs_auditoria')) {
    const tabla = params[0], registroId = params[1], accion = params[2];
    const count = traza.auditorias.filter(a => a.tabla === tabla && a.registro_id === registroId && a.accion === accion).length;
    return [[{ countInt: count }]];
  }

  // --- Productos CRUD ---

  // getProducto: SELECT ... WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('SELECT id, codigo, nombre, precio, iva, stock') &&
      sqlLimpio.includes('FROM productos') &&
      sqlLimpio.includes('WHERE id = ?') &&
      sqlLimpio.includes('activo = 1')) {
    const id = params[0];
    const p = escenario.productos[id];
    if (!p || p.activo !== 1) return [[]];
    return [[filaProducto(id)]];
  }

  // Recuperar por id (post-INSERT / post-UPDATE): SELECT ... WHERE id = ?
  if (sqlLimpio.startsWith('SELECT id, codigo, nombre, precio, iva, stock') &&
      sqlLimpio.includes('FROM productos') &&
      sqlLimpio.includes('WHERE id = ?')) {
    const id = params[0];
    const p = escenario.productos[id];
    if (!p) return [[]];
    return [[filaProducto(id)]];
  }

  // Listado con paginacion: WHERE activo = 1 AND (nombre LIKE ? OR codigo LIKE ?)
  if (sqlLimpio.startsWith('SELECT id, codigo, nombre, precio, iva, stock') &&
      sqlLimpio.includes('FROM productos') &&
      sqlLimpio.includes('WHERE activo = 1')) {
    const filas = Object.keys(escenario.productos)
      .filter(id => escenario.productos[id].activo === 1)
      .map(filaProducto);
    return [filas];
  }

  // COUNT total de productos activos
  if (sqlLimpio.startsWith('SELECT COUNT(*) AS total') && sqlLimpio.includes('FROM productos')) {
    const total = Object.values(escenario.productos).filter(p => p.activo === 1).length;
    return [[{ total }]];
  }

  // Duplicado: SELECT id, activo FROM productos WHERE codigo = ?
  if (sqlLimpio.startsWith('SELECT id, activo FROM productos WHERE codigo')) {
    const codigo = params[0];
    const id = Object.keys(escenario.productos).find(id => escenario.productos[id].codigo === codigo);
    return id ? [[{ id: Number(id), activo: escenario.productos[id].activo }]] : [[]];
  }

  // Existencia (update): SELECT id FROM productos WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('SELECT id FROM productos WHERE id = ?') && sqlLimpio.includes('activo = 1')) {
    const id = params[0];
    const p = escenario.productos[id];
    return p && p.activo === 1 ? [[{ id: Number(id) }]] : [[]];
  }

  // Duplicado (update): SELECT id FROM productos WHERE codigo = ? AND id <> ?
  if (sqlLimpio.startsWith('SELECT id FROM productos WHERE codigo')) {
    const codigo = params[0], idExcluido = params[1];
    const id = Object.keys(escenario.productos).find(id => Number(id) !== Number(idExcluido) && escenario.productos[id].codigo === codigo);
    return id ? [[{ id: Number(id) }]] : [[]];
  }

  // Consulta post-ajuste: SELECT id, stock FROM productos WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('SELECT id, stock FROM productos')) {
    const id = params[0];
    const p = escenario.productos[id];
    return p && p.activo === 1 ? [[{ id: Number(id), stock: p.stock }]] : [[]];
  }

  // INSERT INTO productos (codigo, nombre, precio, iva, stock)
  if (sqlLimpio.startsWith('INSERT INTO productos')) {
    const [codigo, nombre, precio, iva, stock] = params;
    const id = Object.keys(escenario.productos).length + 1;
    escenario.productos[id] = { codigo, nombre, precio: Number(precio), iva: Number(iva), stock: Number(stock), activo: 1 };
    traza.auditorias.push({ tabla: 'productos', registro_id: id, accion: 'create' });
    return [{ insertId: id, affectedRows: 1 }];
  }

  // Reactivar: UPDATE productos SET nombre = ?, precio = ?, iva = ?, stock = ?, activo = 1 WHERE id = ?
  if (sqlLimpio.startsWith('UPDATE productos SET nombre') && sqlLimpio.includes('activo = 1')) {
    const [nombre, precio, iva, stock, id] = params;
    const p = escenario.productos[id];
    if (!p) return [{ affectedRows: 0 }];
    p.nombre = nombre;
    p.precio = Number(precio);
    p.iva = Number(iva);
    p.stock = Number(stock);
    p.activo = 1;
    return [{ affectedRows: 1 }];
  }

  // Actualizacion parcial: UPDATE productos SET codigo = COALESCE(...) WHERE id = ?
  if (sqlLimpio.startsWith('UPDATE productos SET codigo = COALESCE')) {
    const [codigo, nombre, precio, iva, stock, id] = params;
    const p = escenario.productos[id];
    if (!p) return [{ affectedRows: 0 }];
    if (codigo) p.codigo = codigo;
    if (nombre) p.nombre = nombre;
    if (precio !== null) p.precio = Number(precio);
    if (iva !== null) p.iva = Number(iva);
    if (stock !== null) p.stock = Number(stock);
    traza.commits++;
    traza.auditorias.push({ tabla: 'productos', registro_id: id, accion: 'update' });
    return [{ affectedRows: 1 }];
  }

  // Ajuste de stock: UPDATE productos SET stock = stock + ? WHERE id = ? AND activo = 1 AND stock + ? >= 0
  if (sqlLimpio.startsWith('UPDATE productos SET stock = stock +')) {
    const cantidad = Number(params[0]), id = params[1];
    const p = escenario.productos[id];
    if (!p || p.activo !== 1) return [{ affectedRows: 0 }];
    const nuevoStock = p.stock + cantidad;
    if (nuevoStock < 0) return [{ affectedRows: 0 }];
    p.stock = nuevoStock;
    traza.commits++;
    traza.auditorias.push({ tabla: 'productos', registro_id: id, accion: 'stock' });
    return [{ affectedRows: 1 }];
  }

  // Baja logica: UPDATE productos SET activo = 0 WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('UPDATE productos SET activo = 0')) {
    const id = params[0];
    const p = escenario.productos[id];
    if (!p || p.activo !== 1) return [{ affectedRows: 0 }];
    p.activo = 0;
    traza.auditorias.push({ tabla: 'productos', registro_id: id, accion: 'delete' });
    return [{ affectedRows: 1 }];
  }

  return [[]];
}

function crearConexion() {
  return {
    query: async (sql, params) => responder(sql, params),
    beginTransaction: async () => { traza.commits++; },
    commit: async () => { traza.commits++; },
    rollback: async () => { traza.rollbacks++; },
    release: () => {},
  };
}

// --- Inyectar pool doble ANTES de cargar el router ---
const dbPath = require.resolve('../../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: { query: async (sql, params) => responder(sql, params), getConnection: async () => crearConexion() },
    testConnection: async () => {},
  },
};

require.cache[require.resolve('../../utils/errores')] = { id: require.resolve('../../utils/errores'), filename: require.resolve('../../utils/errores'), loaded: true, exports: { registrarError: async () => {} } };

// --- Importar router real + dependencias ---
const productosRouter = require('../../routes/productos.routes');
const { errorHandler } = require('../../middleware/errorHandler');
const { generateToken } = require('../../config/jwt');

// --- Servidor de pruebas ---
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/productos', productosRouter);
app.use(errorHandler);

let servidor;
let baseUrl;

test.before(async () => {
  await new Promise(resolve => { servidor = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => servidor.close(resolve));
});

async function peticion(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const opts = { method, headers, body: body ? JSON.stringify(body) : undefined };
  const res = await fetch(`${baseUrl}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ============================================================
// Tests
// ============================================================

test.describe('Productos API', () => {
  test.beforeEach(() => {
    traza.commits = 0;
    traza.rollbacks = 0;
    traza.auditorias.length = 0;
    escenario.productos = {};
  });

  test.it('GET /api/productos (sin autenticacion) devuelve 401', async () => {
    const { status } = await peticion('GET', '/api/productos');
    assert.strictEqual(status, 401);
  });

  test.it('GET /api/productos (autenticado) devuelve 200 con lista vacia', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-1' });
    const { status, data } = await peticion('GET', '/api/productos', undefined, token);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.productos));
    assert.strictEqual(data.productos.length, 0);
  });

  test.it('POST /api/productos crea un producto (201)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-2' });
    const body = { codigo: 'PRD-001', nombre: 'Camiseta Polo', precio: 25000, iva: 0.19, stock: 10 };
    const { status, data } = await peticion('POST', '/api/productos', body, token);
    assert.strictEqual(status, 201);
    assert.ok(data.producto);
    assert.strictEqual(data.producto.codigo, 'PRD-001');
    assert.strictEqual(data.producto.nombre, 'Camiseta Polo');
    assert.strictEqual(data.producto.precio, 25000);
    assert.strictEqual(data.producto.iva, 0.19);
    assert.strictEqual(data.producto.stock, 10);
  });

  test.it('POST /api/productos (sin autenticacion) devuelve 401', async () => {
    const body = { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 };
    const { status } = await peticion('POST', '/api/productos', body);
    assert.strictEqual(status, 401);
  });

  test.it('POST /api/productos con campos faltantes devuelve 400', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-3' });
    const body = { codigo: 'PRD-001' };
    const { status, data } = await peticion('POST', '/api/productos', body, token);
    assert.strictEqual(status, 400);
    assert.ok(Array.isArray(data.errors));
    assert.ok(data.errors.some(e => e.campo === 'nombre'));
    assert.ok(data.errors.some(e => e.campo === 'precio'));
  });

  test.it('POST /api/productos con codigo duplicado devuelve 409', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-4' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status, data } = await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Otra', precio: 30000, iva: 0.05, stock: 5 }, token);
    assert.strictEqual(status, 409);
    assert.ok(data.message);
  });

  test.it('POST /api/productos con precio no positivo devuelve 400', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-5' });
    const { status, data } = await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Prod', precio: -1, iva: 0.19, stock: 10 }, token);
    assert.strictEqual(status, 400);
    assert.ok(Array.isArray(data.errors));
    assert.ok(data.errors.some(e => e.campo === 'precio'));
  });

  test.it('POST /api/productos no autorizado (sin rol admin) devuelve 403', async () => {
    const token = generateToken({ id: 2, nit: '987654321-0', nombre: 'Vendedor', cargo: 'Vendedor', rol: 'vendedor', activo: 1, jti: 'jti-prod-6' });
    const body = { codigo: 'PRD-001', nombre: 'Prod', precio: 25000, iva: 0.19, stock: 10 };
    const { status } = await peticion('POST', '/api/productos', body, token);
    assert.strictEqual(status, 403);
  });

  test.it('GET /api/productos/:id devuelve el producto (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-7' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta Polo', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status, data } = await peticion('GET', '/api/productos/1', undefined, token);
    assert.strictEqual(status, 200);
    assert.ok(data.producto);
    assert.strictEqual(data.producto.codigo, 'PRD-001');
    assert.strictEqual(data.producto.nombre, 'Camiseta Polo');
    assert.strictEqual(data.producto.precio, 25000);
  });

  test.it('GET /api/productos/:id no existente devuelve 404', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-8' });
    const { status } = await peticion('GET', '/api/productos/9999', undefined, token);
    assert.strictEqual(status, 404);
  });

  test.it('GET /api/productos/:id (sin autenticacion) devuelve 401', async () => {
    const { status } = await peticion('GET', '/api/productos/1');
    assert.strictEqual(status, 401);
  });

  test.it('PUT /api/productos/:id actualiza un producto (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-9' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta Polo', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status, data } = await peticion('PUT', '/api/productos/1', { nombre: 'Camiseta Actualizada', precio: 30000, iva: 0.05, stock: 15 }, token);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.producto.nombre, 'Camiseta Actualizada');
    assert.strictEqual(data.producto.precio, 30000);
    assert.strictEqual(data.producto.iva, 0.05);
    assert.strictEqual(data.producto.stock, 15);
  });

  test.it('PUT /api/productos/:id no autorizado devuelve 403', async () => {
    const token = generateToken({ id: 2, nit: '987654321-0', nombre: 'Vendedor', cargo: 'Vendedor', rol: 'vendedor', activo: 1, jti: 'jti-prod-10' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status } = await peticion('PUT', '/api/productos/1', { nombre: 'Actualizado' }, token);
    assert.strictEqual(status, 403);
  });

  test.it('PUT /api/productos/:id no existente devuelve 404', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-11' });
    const { status } = await peticion('PUT', '/api/productos/9999', { nombre: 'No existe' }, token);
    assert.strictEqual(status, 404);
  });

  test.it('PATCH /api/productos/:id/stock ajusta stock positivo (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-12' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status, data } = await peticion('PATCH', '/api/productos/1/stock', { cantidad: 5 }, token);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.producto.stock, 15);
  });

  test.it('PATCH /api/productos/:id/stock ajusta stock negativo (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-13' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status, data } = await peticion('PATCH', '/api/productos/1/stock', { cantidad: -3 }, token);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.producto.stock, 7);
  });

  test.it('PATCH /api/productos/:id/stock sin autenticacion devuelve 401', async () => {
    const { status } = await peticion('PATCH', '/api/productos/1/stock', { cantidad: 5 });
    assert.strictEqual(status, 401);
  });

  test.it('PATCH /api/productos/:id/stock cantidad negativa que lleva stock a negativo devuelve 409', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-14' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 5 }, token);
    const { status, data } = await peticion('PATCH', '/api/productos/1/stock', { cantidad: -10 }, token);
    assert.strictEqual(status, 409);
    assert.ok(data.message);
  });

  test.it('DELETE /api/productos/:id elimina logico el producto (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-prod-15' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status } = await peticion('DELETE', '/api/productos/1', undefined, token);
    assert.strictEqual(status, 200);
  });

  test.it('DELETE /api/productos/:id (rol no admin) devuelve 403', async () => {
    const token = generateToken({ id: 2, nit: '987654321-0', nombre: 'Vendedor', cargo: 'Vendedor', rol: 'vendedor', activo: 1, jti: 'jti-prod-16' });
    await peticion('POST', '/api/productos', { codigo: 'PRD-001', nombre: 'Camiseta', precio: 25000, iva: 0.19, stock: 10 }, token);
    const { status } = await peticion('DELETE', '/api/productos/1', undefined, token);
    assert.strictEqual(status, 403);
  });

  test.it('DELETE /api/productos/:id (sin autenticacion) devuelve 401', async () => {
    const { status } = await peticion('DELETE', '/api/productos/1');
    assert.strictEqual(status, 401);
  });
});
