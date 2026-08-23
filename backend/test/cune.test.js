/**
 * test/cune.test.js
 * Pruebas unitarias del generador de CUNE (utils/cune.js).
 * Verifica determinismo, formato y diferenciacion entre facturas.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { generarCUNE } = require('../utils/cune');

const DATOS = {
  numero: 'FAC-202608-00001',
  clienteId: 1,
  clienteNit: '900.123.456-7',
  total: 119000,
  fecha: '2026-08-14T12:00:00Z',
};

test('generarCUNE devuelve un hash SHA-256 en hexadecimal mayusculas', () => {
  const cune = generarCUNE(DATOS);
  assert.match(cune, /^[0-9A-F]{64}$/);
});

test('generarCUNE es deterministico para los mismos datos', () => {
  assert.equal(generarCUNE(DATOS), generarCUNE(DATOS));
});

test('generarCUNE cambia si cambia el numero de factura', () => {
  const otro = generarCUNE({ ...DATOS, numero: 'FAC-202608-00002' });
  assert.notEqual(generarCUNE(DATOS), otro);
});

test('generarCUNE cambia si cambia el total de la factura', () => {
  const otro = generarCUNE({ ...DATOS, total: 100 });
  assert.notEqual(generarCUNE(DATOS), otro);
});

test('generarCUNE formatea el total con dos decimales', () => {
  const a = generarCUNE({ ...DATOS, total: 100.5 });
  const b = generarCUNE({ ...DATOS, total: '100.50' });
  assert.equal(a, b); // 100.5 y "100.50" producen la misma base "100.50"
});

test('generarCUNE tolera clienteNit ausente', () => {
  const cune = generarCUNE({ ...DATOS, clienteNit: undefined });
  assert.match(cune, /^[0-9A-F]{64}$/);
});
