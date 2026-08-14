/**
 * test/validators.test.js
 * Pruebas unitarias de las reglas de validacion de entrada
 * (validators/index.js) para clientes, productos, facturas y
 * usuarios. Verifica que las reglas aceptan datos validos y
 * rechazan los invalidos.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const {
  loginValidator,
  clienteBaseValidator,
  clienteUpdateValidator,
  productoBaseValidator,
  ajusteStockValidator,
  createFacturaValidator,
  updateEstadoFacturaValidator,
  crearUsuarioValidator,
  toggleActivoValidator,
} = require('../validators');

/** Ejecuta las reglas contra un req y devuelve los errores encontrados. */
async function check(rules, body = {}, params = {}) {
  const req = { body, params, query: {} };
  for (const rule of rules) {
    await rule(req, {}, () => {});
  }
  return validationResult(req).array().map((e) => e.path);
}

test('loginValidator exige nit y password', async () => {
  const invalido = await check(loginValidator, {});
  assert.ok(invalido.includes('nit'));
  assert.ok(invalido.includes('password'));

  const valido = await check(loginValidator, { nit: '900.123.456-7', password: 'admin123' });
  assert.equal(valido.length, 0);
});

test('clienteBaseValidator valida identificacion, nombre, email y telefono', async () => {
  const valido = await check(clienteBaseValidator, {
    identificacion: '901.123.456-7',
    nombre: 'Cliente A',
    email: 'cliente@correo.com',
    telefono: '3001234567',
  });
  assert.equal(valido.length, 0);

  const invalido = await check(clienteBaseValidator, {
    identificacion: '',
    nombre: '',
    email: 'correo-invalido',
    telefono: 'x'.repeat(30),
  });
  assert.ok(invalido.includes('identificacion'));
  assert.ok(invalido.includes('nombre'));
  assert.ok(invalido.includes('email'));
  assert.ok(invalido.includes('telefono'));
});

test('clienteUpdateValidator permite actualizacion parcial valida', async () => {
  const parcial = await check(clienteUpdateValidator, { nombre: 'Solo nombre' });
  assert.equal(parcial.length, 0);
});

test('productoBaseValidator valida codigo, nombre, precio, iva y stock', async () => {
  const valido = await check(productoBaseValidator, {
    codigo: 'PRD-001',
    nombre: 'Producto A',
    precio: 25000,
    iva: 0.19,
    stock: 10,
  });
  assert.equal(valido.length, 0);

  const invalido = await check(productoBaseValidator, {
    codigo: '',
    nombre: '',
    precio: -5,
    iva: 2,
    stock: -1,
  });
  assert.ok(invalido.includes('codigo'));
  assert.ok(invalido.includes('nombre'));
  assert.ok(invalido.includes('precio'));
  assert.ok(invalido.includes('iva'));
  assert.ok(invalido.includes('stock'));
});

test('ajusteStockValidator exige id positivo y cantidad entera', async () => {
  const invalido = await check(ajusteStockValidator, { cantidad: 1.5 }, { id: 0 });
  assert.ok(invalido.includes('id'));
  assert.ok(invalido.includes('cantidad'));

  const valido = await check(ajusteStockValidator, { cantidad: 5 }, { id: 1 });
  assert.equal(valido.length, 0);
});

test('createFacturaValidator valida clienteId, items y descuento', async () => {
  const valido = await check(createFacturaValidator, {
    clienteId: 1,
    items: [{ productoId: 2, cantidad: 3 }],
    descuento: 10,
  });
  assert.equal(valido.length, 0);

  const sinItems = await check(createFacturaValidator, { clienteId: 1, items: [] });
  assert.ok(sinItems.includes('items'));

  const itemInvalido = await check(createFacturaValidator, {
    clienteId: 1,
    items: [{ productoId: 0, cantidad: -1 }],
  });
  assert.ok(itemInvalido.includes('items[0].productoId'));
  assert.ok(itemInvalido.includes('items[0].cantidad'));

  const clienteInvalido = await check(createFacturaValidator, {
    clienteId: 'abc',
    items: [{ productoId: 1, cantidad: 1 }],
  });
  assert.ok(clienteInvalido.includes('clienteId'));
});

test('updateEstadoFacturaValidator acepta estados DIAN validos', async () => {
  const valido = await check(updateEstadoFacturaValidator, { estado: 'enviada' }, { id: 15 });
  assert.equal(valido.length, 0);

  const invalido = await check(updateEstadoFacturaValidator, { estado: 'borrada' }, { id: 15 });
  assert.ok(invalido.includes('estado'));
});

test('crearUsuarioValidator exige nit, nombre, email y password', async () => {
  const valido = await check(crearUsuarioValidator, {
    nit: '903.654.321-451',
    nombre: 'Vendedor A',
    email: 'v@correo.com',
    rol: 'vendedor',
    password: 'Password123',
  });
  assert.equal(valido.length, 0);

  const invalido = await check(crearUsuarioValidator, {
    nit: '',
    nombre: '',
    email: 'mal',
    rol: 'dueno',
    password: '123',
  });
  assert.ok(invalido.includes('nit'));
  assert.ok(invalido.includes('nombre'));
  assert.ok(invalido.includes('email'));
  assert.ok(invalido.includes('rol'));
  assert.ok(invalido.includes('password'));
});

test('toggleActivoValidator exige activo booleano', async () => {
  const valido = await check(toggleActivoValidator, { activo: true }, { id: 9 });
  assert.equal(valido.length, 0);

  const invalido = await check(toggleActivoValidator, { activo: 'si' }, { id: 9 });
  assert.ok(invalido.includes('activo'));
});
