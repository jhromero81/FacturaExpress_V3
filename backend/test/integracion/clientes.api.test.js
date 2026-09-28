#!/usr/bin/env node
/**
 * clientes.api.test.js
 * Pruebas de integración de la API de clientes.
 * Sigue el patrón de facturas.api.test.js: pool doble que intercepta
 * queries de usuarios + tokens_revocados, router real importado con
 * require.cache sustituido, servidor Express con fetch.
 *
 * El doble reproduce el contrato SQL real del controlador:
 *  - Listado con WHERE activo = 1 y COUNT(*) AS total (paginacion).
 *  - SELECT por id con y sin filtro de activo.
 *  - Verificacion de duplicados por identificacion y por email.
 *  - INSERT, reactivacion (UPDATE ... activo = 1), UPDATE COALESCE
 *    y baja logica (UPDATE ... activo = 0).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// --- Pool doble ---
const traza = { commits: 0, rollbacks: 0, auditorias: [], sqls: [] };
const escenario = {
  usuarios: {
    1: { id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, credencial: 'hashed' },
    2: { id: 2, nit: '987654321-0', nombre: 'Vendedor', cargo: 'Vendedor', rol: 'vendedor', activo: 1, credencial: 'hashed' },
    3: { id: 3, nit: '888777666-7', nombre: 'Lector', cargo: 'Lector', rol: 'lector', activo: 1, credencial: 'hashed' },
  },
};

function filaCliente(id) {
  const c = escenario.clientes[id];
  return { id: Number(id), identificacion: c.identificacion, nombre: c.nombre, email: c.email, telefono: c.telefono };
}

function responder(sql, params) {
  const sqlLimpio = String(sql).replace(/\s+/g, ' ').trim();
  traza.sqls.push(sqlLimpio);

  // Autenticacion: SELECT FROM usuarios para verificar cuenta
  if (sqlLimpio.startsWith('SELECT') && sqlLimpio.includes('FROM usuarios')) {
    const id = params[0];
    const u = escenario.usuarios[id];
    if (!u) return [[]];
    return [[{ id: u.id, nit: u.nit, nombre: u.nombre, cargo: u.cargo, rol: u.rol, activo: u.activo, credencial: u.credencial }]];
  }

  // Verificar revocacion del token
  if (sqlLimpio.includes('FROM tokens_revocados')) return [[]];

  // Auditoria: INSERT INTO logs_auditoria
  if (sqlLimpio.startsWith('INSERT INTO logs_auditoria')) {
    traza.auditorias.push(params[1]);
    return [{ insertId: 1, affectedRows: 1 }];
  }

  // SELECT auditoria para verificar que se registro (las pruebas lo verifican)
  if (sqlLimpio.startsWith('SELECT') && sqlLimpio.includes('COUNT(*)') && sqlLimpio.includes('FROM logs_auditoria')) {
    const tabla = params[0], registroId = params[1], accion = params[2];
    const count = traza.auditorias.filter(a => a.tabla === tabla && a.id_registro === registroId && a.accion_auditoria === accion).length;
    return [[{ countInt: count }]];
  }

  // --- Clientes CRUD ---

  // getCliente: SELECT ... WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('SELECT id, identificacion, nombre, email, telefono') &&
      sqlLimpio.includes('FROM clientes') &&
      sqlLimpio.includes('WHERE id = ?') &&
      sqlLimpio.includes('activo = 1')) {
    const id = params[0];
    const c = escenario.clientes[id];
    if (!c || c.activo !== 1) return [[]];
    return [[filaCliente(id)]];
  }

  // Recuperar por id (post-INSERT / post-UPDATE): SELECT ... WHERE id = ?
  if (sqlLimpio.startsWith('SELECT id, identificacion, nombre, email, telefono') &&
      sqlLimpio.includes('FROM clientes') &&
      sqlLimpio.includes('WHERE id = ?')) {
    const id = params[0];
    const c = escenario.clientes[id];
    if (!c) return [[]];
    return [[filaCliente(id)]];
  }

  // Listado con paginacion: WHERE activo = 1 AND (nombre LIKE ? OR ...)
  if (sqlLimpio.startsWith('SELECT id, identificacion, nombre, email, telefono') &&
      sqlLimpio.includes('FROM clientes') &&
      sqlLimpio.includes('WHERE activo = 1')) {
    const filas = Object.keys(escenario.clientes)
      .filter(id => escenario.clientes[id].activo === 1)
      .map(filaCliente);
    return [filas];
  }

  // COUNT total de clientes activos
  if (sqlLimpio.startsWith('SELECT COUNT(*) AS total') && sqlLimpio.includes('FROM clientes')) {
    const total = Object.values(escenario.clientes).filter(c => c.activo === 1).length;
    return [[{ total }]];
  }

  // Duplicado NIT: SELECT id, activo FROM clientes WHERE identificacion = ?
  if (sqlLimpio.startsWith('SELECT id, activo FROM clientes WHERE identificacion')) {
    const nit = params[0];
    const id = Object.keys(escenario.clientes).find(id => escenario.clientes[id].identificacion === nit);
    return id ? [[{ id: Number(id), activo: escenario.clientes[id].activo }]] : [[]];
  }

  // Duplicado email: SELECT id FROM clientes WHERE email = ? (con o sin id <> ?)
  if (sqlLimpio.startsWith('SELECT id FROM clientes WHERE email')) {
    const email = params[0];
    const id = Object.keys(escenario.clientes).find(id => escenario.clientes[id].email === email);
    return id ? [[{ id: Number(id) }]] : [[]];
  }

  // Existencia (update): SELECT id FROM clientes WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('SELECT id FROM clientes WHERE id = ?') && sqlLimpio.includes('activo = 1')) {
    const id = params[0];
    const c = escenario.clientes[id];
    return c && c.activo === 1 ? [[{ id: Number(id) }]] : [[]];
  }

  // Duplicado NIT (update): SELECT id FROM clientes WHERE identificacion = ? AND id <> ?
  if (sqlLimpio.startsWith('SELECT id FROM clientes WHERE identificacion')) {
    const nit = params[0], idExcluido = params[1];
    const id = Object.keys(escenario.clientes).find(id => Number(id) !== Number(idExcluido) && escenario.clientes[id].identificacion === nit);
    return id ? [[{ id: Number(id) }]] : [[]];
  }

  // INSERT INTO clientes (identificacion, nombre, email, telefono)
  if (sqlLimpio.startsWith('INSERT INTO clientes')) {
    const [identificacion, nombre, email, telefono] = params;
    const id = Object.keys(escenario.clientes).length + 1;
    escenario.clientes[id] = { identificacion, nombre, email: email || null, telefono: telefono || null, activo: 1 };
    traza.auditorias.push({ tabla: 'clientes', id_registro: id, accion_auditoria: 'create' });
    return [{ insertId: id, affectedRows: 1 }];
  }

  // Reactivar: UPDATE clientes SET nombre = ?, email = ?, telefono = ?, activo = 1 WHERE id = ?
  if (sqlLimpio.startsWith('UPDATE clientes SET nombre') && sqlLimpio.includes('activo = 1')) {
    const [nombre, email, telefono, id] = params;
    const c = escenario.clientes[id];
    if (!c) return [{ affectedRows: 0 }];
    c.nombre = nombre;
    c.email = email || null;
    c.telefono = telefono || null;
    c.activo = 1;
    return [{ affectedRows: 1 }];
  }

  // Actualizacion parcial: UPDATE clientes SET identificacion = COALESCE(...) WHERE id = ?
  if (sqlLimpio.startsWith('UPDATE clientes SET identificacion = COALESCE')) {
    const [identificacion, nombre, email, telefono, id] = params;
    const c = escenario.clientes[id];
    if (!c) return [{ affectedRows: 0 }];
    if (identificacion) c.identificacion = identificacion;
    if (nombre) c.nombre = nombre;
    if (email) c.email = email;
    if (telefono) c.telefono = telefono;
    traza.commits++;
    traza.auditorias.push({ tabla: 'clientes', id_registro: id, accion_auditoria: 'update' });
    return [{ affectedRows: 1 }];
  }

  // Baja logica: UPDATE clientes SET activo = 0 WHERE id = ? AND activo = 1
  if (sqlLimpio.startsWith('UPDATE clientes SET activo = 0')) {
    const id = params[0];
    const c = escenario.clientes[id];
    if (!c || c.activo !== 1) return [{ affectedRows: 0 }];
    c.activo = 0;
    traza.auditorias.push({ tabla: 'clientes', id_registro: id, accion_auditoria: 'delete' });
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

// Stub del servicio de errores
require.cache[require.resolve('../../utils/errores')] = { id: require.resolve('../../utils/errores'), filename: require.resolve('../../utils/errores'), loaded: true, exports: { registrarError: async () => {} } };

// --- Importar router real + dependencias ---
const clientesRouter = require('../../routes/clientes.routes');
const { errorHandler } = require('../../middleware/errorHandler');
const { generateToken } = require('../../config/jwt');

// --- Servidor de pruebas ---
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/clientes', clientesRouter);
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

test.describe('Clientes API', () => {
  test.beforeEach(() => {
    traza.commits = 0;
    traza.rollbacks = 0;
    traza.auditorias.length = 0;
    traza.sqls.length = 0;
    escenario.clientes = {};
  });

  test.it('GET /api/clientes (sin autenticacion) devuelve 401', async () => {
    const { status } = await peticion('GET', '/api/clientes');
    assert.strictEqual(status, 401);
  });

  test.it('GET /api/clientes (autenticado) devuelve 200 con lista vacia', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-1' });
    const { status, data } = await peticion('GET', '/api/clientes', undefined, token);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.clientes));
    assert.strictEqual(data.clientes.length, 0);
  });

  test.it('POST /api/clientes crea un cliente (201)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-2' });
    const body = { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' };
    const { status, data } = await peticion('POST', '/api/clientes', body, token);
    assert.strictEqual(status, 201);
    assert.ok(data.cliente);
    assert.strictEqual(data.cliente.identificacion, '987654321-0');
    assert.strictEqual(data.cliente.nombre, 'Juan Perez');
    assert.strictEqual(data.cliente.email, 'juan@correo.com');
    assert.strictEqual(data.cliente.telefono, '3001234567');
  });

  test.it('POST /api/clientes (sin autenticacion) devuelve 401', async () => {
    const body = { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' };
    const { status } = await peticion('POST', '/api/clientes', body);
    assert.strictEqual(status, 401);
  });

  test.it('POST /api/clientes con campos obligatorios faltantes devuelve 400', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-3' });
    const body = { identificacion: '987654321-0' };
    const { status, data } = await peticion('POST', '/api/clientes', body, token);
    assert.strictEqual(status, 400);
    assert.ok(Array.isArray(data.errors));
    assert.ok(data.errors.some(e => e.campo === 'nombre'));
  });

  test.it('POST /api/clientes con NIT duplicado devuelve 409', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-4' });
    await peticion('POST', '/api/clientes', { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' }, token);
    const { status, data } = await peticion('POST', '/api/clientes', { identificacion: '987654321-0', nombre: 'Otro Perez', email: 'otro@correo.com', telefono: '3009876543' }, token);
    assert.strictEqual(status, 409);
    assert.ok(data.message);
  });

  test.it('POST /api/clientes con email duplicado devuelve 409', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-5' });
    await peticion('POST', '/api/clientes', { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' }, token);
    const { status, data } = await peticion('POST', '/api/clientes', { identificacion: '987654322-0', nombre: 'Maria', email: 'juan@correo.com', telefono: '3009876543' }, token);
    assert.strictEqual(status, 409);
    assert.ok(data.message);
  });

  test.it('POST /api/clientes no autorizado (rol lector) devuelve 403', async () => {
    const token = generateToken({ id: 3, nit: '888777666-7', nombre: 'Lector', cargo: 'Lector', rol: 'lector', activo: 1, jti: 'jti-test-6' });
    const body = { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' };
    const { status } = await peticion('POST', '/api/clientes', body, token);
    assert.strictEqual(status, 403);
  });

  test.it('GET /api/clientes/:id devuelve el cliente (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-7' });
    await peticion('POST', '/api/clientes', { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' }, token);
    const { status, data } = await peticion('GET', '/api/clientes/1', undefined, token);
    assert.strictEqual(status, 200);
    assert.ok(data.cliente);
    assert.strictEqual(data.cliente.identificacion, '987654321-0');
    assert.strictEqual(data.cliente.nombre, 'Juan Perez');
  });

  test.it('GET /api/clientes/:id no existente devuelve 404', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-8' });
    const { status } = await peticion('GET', '/api/clientes/9999', undefined, token);
    assert.strictEqual(status, 404);
  });

  test.it('GET /api/clientes/:id (sin autenticacion) devuelve 401', async () => {
    const { status } = await peticion('GET', '/api/clientes/1');
    assert.strictEqual(status, 401);
  });

  test.it('PUT /api/clientes/:id actualiza un cliente (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-9' });
    await peticion('POST', '/api/clientes', { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' }, token);
    const { status, data } = await peticion('PUT', '/api/clientes/1', { nombre: 'Juan Actualizado', email: 'juan_actualizado@correo.com', telefono: '3009876543' }, token);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.cliente.nombre, 'Juan Actualizado');
    assert.strictEqual(data.cliente.email, 'juan_actualizado@correo.com');
    assert.strictEqual(data.cliente.telefono, '3009876543');
  });

  test.it('PUT /api/clientes/:id no autorizado (sin rol) devuelve 403', async () => {
    const token = generateToken({ id: 3, nit: '888777666-7', nombre: 'Lector', cargo: 'Lector', rol: 'lector', activo: 1, jti: 'jti-test-10' });
    const body = { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' };
    await peticion('POST', '/api/clientes', body, token);
    const { status } = await peticion('PUT', '/api/clientes/1', { nombre: 'Actualizado' }, token);
    assert.strictEqual(status, 403);
  });

  test.it('PUT /api/clientes/:id no existente devuelve 404', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-11' });
    const { status } = await peticion('PUT', '/api/clientes/9999', { nombre: 'No existe' }, token);
    assert.strictEqual(status, 404);
  });

  test.it('DELETE /api/clientes/:id elimina logico el cliente (200)', async () => {
    const token = generateToken({ id: 1, nit: '123456789-0', nombre: 'Admin', cargo: 'Administrador', rol: 'admin', activo: 1, jti: 'jti-test-12' });
    await peticion('POST', '/api/clientes', { identificacion: '987654321-0', nombre: 'Juan Perez', email: 'juan@correo.com', telefono: '3001234567' }, token);
    const { status } = await peticion('DELETE', '/api/clientes/1', undefined, token);
    assert.strictEqual(status, 200);
  });

  test.it('DELETE /api/clientes/:id (rol vendedor) devuelve 403', async () => {
    const token = generateToken({ id: 2, nit: '987654321-0', nombre: 'Vendedor', cargo: 'Vendedor', rol: 'vendedor', activo: 1, jti: 'jti-test-13' });
    await peticion('POST', '/api/clientes', { identificacion: '888777666-7', nombre: 'Cliente B', email: 'b@correo.com', telefono: '3001112222' }, token);
    const { status } = await peticion('DELETE', '/api/clientes/1', undefined, token);
    assert.strictEqual(status, 403);
  });

  test.it('DELETE /api/clientes/:id (sin autenticacion) devuelve 401', async () => {
    const { status } = await peticion('DELETE', '/api/clientes/1');
    assert.strictEqual(status, 401);
  });
});
