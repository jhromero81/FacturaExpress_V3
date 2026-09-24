/**
 * scripts/pruebas-aceptacion.js
 * Pruebas FUNCIONALES Y DE ACEPTACION (cuspid de la piramide de pruebas):
 * certifican el flujo extremo a extremo de la emision de una factura
 * electronica, desde el inicio de sesion hasta el cambio de estado ante la
 * DIAN, pasando por el inventario, las descargas (PDF/XML/CSV), los reportes
 * y la seguridad de sesion.
 *
 * Requisitos:
 *   1. API en ejecucion:  npm run dev --prefix backend
 *   2. Base de datos migrada y sembrada: npm run db:setup ; npm run db:seed
 *
 * Uso:
 *   node scripts/pruebas-aceptacion.js
 *   E2E_BASE_URL=http://127.0.0.1:4000 node scripts/pruebas-aceptacion.js
 *
 * Variables de entorno:
 *   E2E_BASE_URL  URL de la API (por defecto http://127.0.0.1:4000)
 *   E2E_NIT       NIT del administrador (por defecto 900.123.456-7 del seed)
 *   E2E_PASSWORD  Contrasena del administrador. Si no se define, se usa
 *                 SEED_ADMIN_PASSWORD del backend/.env (la misma que
 *                 definio el seed al poblar la base).
 *   E2E_VENDEDOR_NIT / E2E_VENDEDOR_PASSWORD  Credenciales del vendedor;
 *                 E2E_VENDEDOR_PASSWORD tambien cae a SEED_VENDEDOR_PASSWORD.
 *
 * El script no depende de librerias externas (usa fetch nativo de Node 18+)
 * y devuelve codigo de salida 1 si algun caso de aceptacion falla, de modo
 * que puede integrarse en un pipeline de integracion continua.
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Carga el .env del backend para reutilizar las contrasenas del seed
// (SEED_ADMIN_PASSWORD / SEED_VENDEDOR_PASSWORD) cuando no se pasan
// E2E_PASSWORD / E2E_VENDEDOR_PASSWORD de forma explicita.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
const ADMIN_NIT = process.env.E2E_NIT || '900.123.456-7';
const ADMIN_PASSWORD = process.env.E2E_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
const VENDEDOR_NIT = process.env.E2E_VENDEDOR_NIT || '80.987.654-3';
const VENDEDOR_PASSWORD = process.env.E2E_VENDEDOR_PASSWORD || process.env.SEED_VENDEDOR_PASSWORD;

if (!ADMIN_PASSWORD || !VENDEDOR_PASSWORD) {
  console.error(
    '[e2e] Faltan E2E_PASSWORD y/o E2E_VENDEDOR_PASSWORD. Defina las\n' +
      '      contrasenas del seed en backend/.env (SEED_ADMIN_PASSWORD y\n' +
      '      SEED_VENDEDOR_PASSWORD) y vuelva a sembrar la base, o pase las\n' +
      '      contrasenas directamente:\n' +
      '        E2E_PASSWORD=... E2E_VENDEDOR_PASSWORD=... npm run test:e2e'
  );
  process.exit(1);
}

/** Tarifa de IVA vigente en Colombia */
const IVA_RATE = 0.19;
/** Precio del producto temporal creado por la prueba */
const PRECIO_PRODUCTO = 50000;
/** Cantidad vendida en la factura de prueba */
const CANTIDAD_VENDIDA = 3;
/** Descuento porcentual aplicado a la venta */
const DESCUENTO_PCT = 10;
/** Stock inicial del producto temporal */
const STOCK_INICIAL = 20;

const resultados = [];
let tokenAdmin = null;
let tokenVendedor = null;
let clienteId = null;
let productoId = null;
let factura = null;

// ============================================================
// Salida en consola
// ============================================================
const ok = (nombre, detalle = '') => registrar('OK', nombre, detalle);
const fallo = (nombre, detalle = '') => registrar('FALLO', nombre, detalle);
const omitido = (nombre, detalle = '') => registrar('OMITIDO', nombre, detalle);

function registrar(estado, nombre, detalle) {
  resultados.push({ estado, nombre, detalle });
  const marca = estado === 'OK' ? '  OK  ' : estado === 'FALLO' ? ' FALLO' : 'OMITIDO';
  console.log(`[${marca}] ${nombre}${detalle ? ` -> ${detalle}` : ''}`);
}

/** Marca un caso como fallido y detiene su secuencia. */
function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

const moneda = (valor) => `$${Number(valor || 0).toLocaleString('es-CO')}`;

// ============================================================
// Cliente HTTP minimo (fetch nativo)
// ============================================================
async function http(ruta, { method = 'GET', body, bearer = tokenAdmin, cabeceras = {} } = {}) {
  const headers = { ...cabeceras };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${BASE_URL}${ruta}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null; // respuestas binarias o no JSON (PDF/CSV)
  }

  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);

  return { status: res.status, texto, json, setCookie };
}

/** Ejecuta un caso de aceptacion capturando la excepcion como fallo. */
async function caso(nombre, fn) {
  try {
    await fn();
  } catch (error) {
    fallo(nombre, error.message);
  }
}

// ============================================================
// Casos de aceptacion
// ============================================================
async function main() {
  console.log(`\n=== Pruebas de aceptacion FacturaExpress ===`);
  console.log(`API: ${BASE_URL}\n`);

  // ---- 0. Disponibilidad del servicio ----
  let servicioActivo = true;
  await caso('CA-01 La API responde el endpoint de salud', async () => {
    const r = await http('/api/health');
    exigir(r.status === 200, `se esperaba 200 y se recibio ${r.status}`);
    exigir(r.json && r.json.success !== false, 'la respuesta de salud no es valida');
    ok('CA-01 La API responde el endpoint de salud', `${BASE_URL}/api/health`);
  });
  if (resultados.some((r) => r.estado === 'FALLO' && r.nombre.startsWith('CA-01'))) {
    servicioActivo = false;
    console.log('\nLa API no responde: levante el servicio con "npm run dev --prefix backend" antes de continuar.');
  }

  // ---- 1. Autenticacion ----
  await caso('CA-02 Login del administrador con cookie httpOnly', async () => {
    const r = await http('/api/auth/login', {
      method: 'POST',
      bearer: null,
      body: { nit: ADMIN_NIT, password: ADMIN_PASSWORD },
      cabeceras: { 'X-Token-Response': 'true' },
    });
    exigir(r.status === 200, `credenciales invalidas o usuario inexistente (HTTP ${r.status}). Ejecute "npm run db:seed"`);
    exigir(r.json && r.json.token, 'la respuesta no incluye el token solicitado');
    exigir(
      r.setCookie.some((c) => /token=/.test(c) && /HttpOnly/i.test(c)),
      'no se establecio la cookie httpOnly de sesion'
    );
    tokenAdmin = r.json.token;
    ok('CA-02 Login del administrador con cookie httpOnly', `rol=${r.json.usuario && r.json.usuario.rol}`);
  });

  if (!tokenAdmin) {
    omitido('CA-03 a CA-21 Flujo de facturacion', 'sin sesion valida no es posible continuar');
    return resumir();
  }

  await caso('CA-03 Consulta del usuario autenticado (/auth/me)', async () => {
    const r = await http('/api/auth/me');
    exigir(r.status === 200, `HTTP ${r.status}`);
    exigir(r.json.usuario && r.json.usuario.rol === 'admin', 'el rol del usuario no es admin');
    ok('CA-03 Consulta del usuario autenticado (/auth/me)', `${r.json.usuario.nombre} (${r.json.usuario.rol})`);
  });

  // ---- 2. Maestros: cliente y producto ----
  const sufijo = Date.now().toString().slice(-8);

  await caso('CA-04 Alta de cliente', async () => {
    const r = await http('/api/clientes', {
      method: 'POST',
      body: {
        identificacion: `901${sufijo}-1`,
        nombre: 'Cliente Prueba Aceptacion',
        email: `cliente.e2e.${sufijo}@correo.com`,
        telefono: '3001234567',
      },
    });
    exigir(r.status === 201, `HTTP ${r.status}: ${r.json && r.json.message}`);
    clienteId = r.json.cliente.id;
    ok('CA-04 Alta de cliente', `id=${clienteId}`);
  });

  await caso('CA-05 Alta de producto con stock inicial', async () => {
    const r = await http('/api/productos', {
      method: 'POST',
      body: {
        codigo: `E2E-${sufijo}`,
        nombre: 'Producto Prueba Aceptacion',
        precio: PRECIO_PRODUCTO,
        iva: IVA_RATE,
        stock: STOCK_INICIAL,
      },
    });
    exigir(r.status === 201, `HTTP ${r.status}: ${r.json && r.json.message}`);
    productoId = r.json.producto.id;
    ok('CA-05 Alta de producto con stock inicial', `id=${productoId}, stock=${STOCK_INICIAL}`);
  });

  // ---- 3. Emision de la factura: regla de negocio financiera ----
  await caso('CA-06 Emision de factura con descuento del 10%', async () => {
    exigir(clienteId && productoId, 'faltan el cliente o el producto de la prueba');

    const r = await http('/api/facturas', {
      method: 'POST',
      body: {
        clienteId,
        items: [{ productoId, cantidad: CANTIDAD_VENDIDA }],
        descuento: DESCUENTO_PCT,
      },
    });

    exigir(r.status === 201, `HTTP ${r.status}: ${r.json && r.json.message}`);
    factura = r.json.factura;

    // Calculos esperados: subtotal, descuento en pesos, IVA sobre la base y total
    const subtotal = PRECIO_PRODUCTO * CANTIDAD_VENDIDA;
    const descuentoPesos = Math.round(subtotal * (DESCUENTO_PCT / 100));
    const base = subtotal - descuentoPesos;
    const iva = Math.round(base * IVA_RATE);
    const total = base + iva;

    exigir(factura.subtotal === subtotal, `subtotal ${moneda(factura.subtotal)} != ${moneda(subtotal)}`);
    exigir(factura.descuento === descuentoPesos, `descuento ${moneda(factura.descuento)} != ${moneda(descuentoPesos)}`);
    exigir(factura.iva === iva, `IVA ${moneda(factura.iva)} != ${moneda(iva)}`);
    exigir(factura.total === total, `total ${moneda(factura.total)} != ${moneda(total)}`);
    exigir(factura.estado === 'pendiente', `estado inicial inesperado: ${factura.estado}`);
    exigir(/^FAC-\d{6}-\d{5}$/.test(factura.numero), `numero de factura invalido: ${factura.numero}`);
    exigir(factura.items.length === 1, 'la factura no registro sus items');
    exigir(factura.items[0].precioUnitario === PRECIO_PRODUCTO, 'el precio unitario no proviene del catalogo');

    ok(
      'CA-06 Emision de factura con descuento del 10%',
      `${factura.numero}: subtotal ${moneda(subtotal)}, descuento ${moneda(descuentoPesos)}, IVA ${moneda(iva)}, total ${moneda(total)}`
    );
  });

  await caso('CA-07 El inventario descuenta el stock vendido (transaccion ACID)', async () => {
    exigir(productoId, 'no hay producto de prueba');
    const r = await http(`/api/productos/${productoId}`);
    exigir(r.status === 200, `HTTP ${r.status}`);
    const esperado = STOCK_INICIAL - CANTIDAD_VENDIDA;
    exigir(
      r.json.producto.stock === esperado,
      `stock ${r.json.producto.stock} != ${esperado} (la venta no actualizo el inventario)`
    );
    ok('CA-07 El inventario descuenta el stock vendido (transaccion ACID)', `stock=${esperado}`);
  });

  // ---- 4. Documento electronico: consulta y descargas ----
  await caso('CA-08 Consulta del detalle de la factura', async () => {
    exigir(factura, 'no se emitio la factura');
    const r = await http(`/api/facturas/${factura.id}`);
    exigir(r.status === 200, `HTTP ${r.status}`);
    exigir(r.json.factura.total === factura.total, 'el total consultado no coincide con el emitido');
    exigir(r.json.factura.items.length === 1, 'el detalle no incluye los items');
    ok('CA-08 Consulta del detalle de la factura', `total ${moneda(r.json.factura.total)}`);
  });

  await caso('CA-09 Descarga del PDF de la factura', async () => {
    exigir(factura, 'no se emitio la factura');
    const r = await http(`/api/facturas/${factura.id}/pdf`);
    exigir(r.status === 200, `HTTP ${r.status}`);
    exigir(r.texto.startsWith('%PDF'), 'el archivo descargado no es un PDF valido');
    ok('CA-09 Descarga del PDF de la factura', `${r.texto.length} bytes`);
  });

  await caso('CA-10 Descarga del XML de la factura (formato DIAN)', async () => {
    exigir(factura, 'no se emitio la factura');
    const r = await http(`/api/facturas/${factura.id}/xml`);
    exigir(r.status === 200, `HTTP ${r.status}`);
    exigir(r.texto.includes('<?xml'), 'el XML no incluye la declaracion de documento');
    exigir(r.texto.includes(factura.numero), 'el XML no incluye el numero de factura');
    exigir(r.texto.includes(String(factura.total)), 'el XML no incluye el total de la factura');
    ok('CA-10 Descarga del XML de la factura (formato DIAN)', `${r.texto.length} bytes`);
  });

  await caso('CA-11 Descarga del CSV de la factura', async () => {
    exigir(factura, 'no se emitio la factura');
    const r = await http(`/api/facturas/${factura.id}/csv`);
    exigir(r.status === 200, `HTTP ${r.status}`);
    exigir(r.texto.includes(factura.numero), 'el CSV no incluye el numero de factura');
    ok('CA-11 Descarga del CSV de la factura', `${r.texto.length} bytes`);
  });

  // ---- 5. Ciclo de vida DIAN y reglas de integridad ----
  await caso('CA-12 Cambio de estado a "enviada" (DIAN)', async () => {
    exigir(factura, 'no se emitio la factura');
    const r = await http(`/api/facturas/${factura.id}/estado`, {
      method: 'PUT',
      body: { estado: 'enviada' },
    });
    exigir(r.status === 200, `HTTP ${r.status}: ${r.json && r.json.message}`);
    exigir(r.json.factura.estado === 'enviada', `estado ${r.json.factura.estado}`);
    exigir(r.json.factura.firmaEstado === 'firmada', `firma ${r.json.factura.firmaEstado}`);
    exigir(Number(r.json.factura.intentosDian) === 1, `intentos DIAN ${r.json.factura.intentosDian}`);
    ok('CA-12 Cambio de estado a "enviada" (DIAN)', `intentos=${r.json.factura.intentosDian}`);
  });

  await caso('CA-13 Una factura enviada a la DIAN no se puede eliminar', async () => {
    exigir(factura, 'no se emitio la factura');
    const r = await http(`/api/facturas/${factura.id}`, { method: 'DELETE' });
    exigir(r.status === 409, `se esperaba 409 y se recibio ${r.status}`);
    exigir(/dian/i.test(r.json.message), `mensaje inesperado: ${r.json.message}`);
    ok('CA-13 Una factura enviada a la DIAN no se puede eliminar', r.json.message);
  });

  await caso('CA-14 Reportes reflejan las ventas registradas', async () => {
    const r = await http('/api/reportes/kpis');
    exigir(r.status === 200, `HTTP ${r.status}`);
    exigir(r.json.kpis, 'la respuesta no incluye los KPIs');

    const { ventasMes, productosVendidos, facturasEmitidas } = r.json.kpis;
    exigir(Number(ventasMes) > 0, 'el reporte no acumula ventas del mes');
    exigir(Number(productosVendidos) >= CANTIDAD_VENDIDA, 'los productos vendidos no se reflejan en el reporte');
    exigir(Number(facturasEmitidas) > 0, 'no se contabilizan facturas emitidas');

    ok(
      'CA-14 Reportes reflejan las ventas registradas',
      `ventasMes=${moneda(ventasMes)}, facturas=${facturasEmitidas}, productos=${productosVendidos}`
    );
  });

  // ---- 6. Control de acceso por rol ----
  await caso('CA-15 El rol vendedor no accede a los modulos administrativos (403)', async () => {
    const login = await http('/api/auth/login', {
      method: 'POST',
      bearer: null,
      body: { nit: VENDEDOR_NIT, password: VENDEDOR_PASSWORD },
      cabeceras: { 'X-Token-Response': 'true' },
    });
    if (login.status !== 200 || !login.json.token) {
      omitido('CA-15 El rol vendedor no accede a los modulos administrativos (403)', 'usuario vendedor no disponible en el seed');
      return;
    }
    tokenVendedor = login.json.token;

    // Usuarios, errores, logs y backup exigen el rol admin
    const r = await http('/api/usuarios', { bearer: tokenVendedor });
    exigir(r.status === 403, `se esperaba 403 y se recibio ${r.status}`);
    ok('CA-15 El rol vendedor no accede a los modulos administrativos (403)', r.json.message);
  });

  // ---- 7. Regresion: ciclo completo de estados y numeracion ----
  await caso('CA-16 El estado "rechazada" y el regreso a "pendiente" funcionan', async () => {
    // Regresion: la actualizacion de estado no traia firma_estado ni
    // intentos_dian, de modo que MySQL recibia NULL en una columna NOT NULL
    // y estos dos cambios respondian 500.
    exigir(factura, 'no se emitio la factura');

    const rechazo = await http(`/api/facturas/${factura.id}/estado`, {
      method: 'PUT',
      body: { estado: 'rechazada' },
    });
    exigir(rechazo.status === 200, `rechazada respondio HTTP ${rechazo.status}: ${rechazo.json && rechazo.json.message}`);
    exigir(rechazo.json.factura.estado === 'rechazada', `estado ${rechazo.json.factura.estado}`);
    exigir(rechazo.json.factura.firmaEstado === 'rechazada', `firma ${rechazo.json.factura.firmaEstado}`);

    const pendiente = await http(`/api/facturas/${factura.id}/estado`, {
      method: 'PUT',
      body: { estado: 'pendiente' },
    });
    exigir(pendiente.status === 200, `pendiente respondio HTTP ${pendiente.status}: ${pendiente.json && pendiente.json.message}`);
    exigir(pendiente.json.factura.estado === 'pendiente', `estado ${pendiente.json.factura.estado}`);

    ok('CA-16 El estado "rechazada" y el regreso a "pendiente" funcionan', 'rechazada -> pendiente sin errores');
  });

  await caso('CA-17 Los intentos de envio a la DIAN se acumulan', async () => {
    // Regresion: cada envio sobrescribia el contador con 1.
    const antes = await http(`/api/facturas/${factura.id}/estado`, {
      method: 'PUT',
      body: { estado: 'enviada' },
    });
    exigir(antes.status === 200, `HTTP ${antes.status}`);
    const primero = Number(antes.json.factura.intentosDian);

    const despues = await http(`/api/facturas/${factura.id}/estado`, {
      method: 'PUT',
      body: { estado: 'enviada' },
    });
    exigir(despues.status === 200, `HTTP ${despues.status}`);
    const segundo = Number(despues.json.factura.intentosDian);

    exigir(segundo === primero + 1, `los intentos no se acumulan (${primero} -> ${segundo})`);
    ok('CA-17 Los intentos de envio a la DIAN se acumulan', `intentos=${segundo}`);
  });

  await caso('CA-18 Eliminar una factura no rompe la numeracion consecutiva', async () => {
    // Regresion: el consecutivo se deducia con COUNT(*)+1, de modo que al
    // eliminar una factura intermedia la siguiente venta intentaba reutilizar
    // un numero existente y respondia 500 (clave duplicada).
    const primera = await http('/api/facturas', {
      method: 'POST',
      body: { clienteId, items: [{ productoId, cantidad: 1 }], descuento: 0 },
    });
    exigir(primera.status === 201, `no se pudo emitir la factura previa (HTTP ${primera.status})`);

    const baja = await http(`/api/facturas/${primera.json.factura.id}`, { method: 'DELETE' });
    exigir(baja.status === 200, `no se pudo eliminar la factura pendiente (HTTP ${baja.status})`);

    const segunda = await http('/api/facturas', {
      method: 'POST',
      body: { clienteId, items: [{ productoId, cantidad: 1 }], descuento: 0 },
    });
    exigir(
      segunda.status === 201,
      `la venta posterior a la eliminacion fallo (HTTP ${segunda.status}): ${segunda.json && segunda.json.message}`
    );
    exigir(
      segunda.json.factura.numero !== primera.json.factura.numero,
      'la numeracion reutilizo el numero de la factura eliminada'
    );

    ok(
      'CA-18 Eliminar una factura no rompe la numeracion consecutiva',
      `${primera.json.factura.numero} eliminada -> siguiente ${segunda.json.factura.numero}`
    );
  });

  await caso('CA-19 El IVA se calcula con la tarifa configurada del producto', async () => {
    // Regresion: se aplicaba siempre el 19% aunque el producto tributara otra
    // tarifa (0% o 5%).
    const conIva5 = await http('/api/productos', {
      method: 'POST',
      body: { codigo: `IVA5-${Date.now()}`, nombre: 'Producto gravamen 5%', precio: 100000, iva: 0.05, stock: 5 },
    });
    exigir(conIva5.status === 201, `no se pudo crear el producto al 5% (HTTP ${conIva5.status})`);

    const venta = await http('/api/facturas', {
      method: 'POST',
      body: { clienteId, items: [{ productoId: conIva5.json.producto.id, cantidad: 1 }], descuento: 0 },
    });
    exigir(venta.status === 201, `no se pudo emitir la venta (HTTP ${venta.status})`);
    exigir(Number(venta.json.factura.iva) === 5000, `el IVA deberia ser 5.000 y fue ${venta.json.factura.iva}`);
    exigir(
      Number(venta.json.factura.total) === 105000,
      `el total deberia ser 105.000 y fue ${venta.json.factura.total}`
    );

    ok('CA-19 El IVA se calcula con la tarifa configurada del producto', 'base 100.000 al 5% -> IVA 5.000');
  });

  await caso('CA-20 El detalle de la factura cuadra con la cabecera', async () => {
    // Regresion: con descuento, la suma del IVA de las lineas no coincidia
    // con el IVA de la cabecera.
    const venta = await http('/api/facturas', {
      method: 'POST',
      body: { clienteId, items: [{ productoId, cantidad: 2 }], descuento: 10 },
    });
    exigir(venta.status === 201, `HTTP ${venta.status}`);

    const f = venta.json.factura;
    const sumaSubtotales = f.items.reduce((s, i) => s + Number(i.subtotal), 0);
    const sumaIvas = f.items.reduce((s, i) => s + Number(i.iva), 0);

    exigir(sumaSubtotales === Number(f.subtotal), 'la suma de subtotales no cuadra con la cabecera');
    exigir(sumaIvas === Number(f.iva), `la suma de IVA (${sumaIvas}) no cuadra con la cabecera (${f.iva})`);
    exigir(
      Number(f.subtotal) - Number(f.descuento) + Number(f.iva) === Number(f.total),
      'la identidad contable subtotal - descuento + IVA = total no se cumple'
    );

    ok('CA-20 El detalle de la factura cuadra con la cabecera', `subtotal ${moneda(f.subtotal)}, IVA ${moneda(f.iva)}, total ${moneda(f.total)}`);
  });

  // ---- 8. Cierre de sesion y revocacion del token ----
  await caso('CA-21 El logout revoca el token (401 en la siguiente peticion)', async () => {
    const cierre = await http('/api/auth/logout', { method: 'POST' });
    exigir(cierre.status === 200, `HTTP ${cierre.status}`);

    const posterior = await http('/api/facturas');
    exigir(posterior.status === 401, `se esperaba 401 tras el logout y se recibio ${posterior.status}`);
    tokenAdmin = null;
    ok('CA-21 El logout revoca el token (401 en la siguiente peticion)', 'sesion invalidada correctamente');
  });

  return resumir();
}

/** Imprime el resumen de la ejecucion y define el codigo de salida. */
function resumir() {
  const total = resultados.length;
  const exitos = resultados.filter((r) => r.estado === 'OK').length;
  const fallos = resultados.filter((r) => r.estado === 'FALLO').length;
  const omitidos = resultados.filter((r) => r.estado === 'OMITIDO').length;

  console.log('\n============================================================');
  console.log(`Casos ejecutados : ${total}`);
  console.log(`Exitosos         : ${exitos}`);
  console.log(`Omitidos         : ${omitidos}`);
  console.log(`Fallidos         : ${fallos}`);
  console.log(`Resultado        : ${fallos === 0 ? 'ACEPTADO' : 'RECHAZADO'}`);
  console.log('============================================================\n');

  if (fallos > 0) {
    console.log('Casos fallidos:');
    for (const r of resultados.filter((x) => x.estado === 'FALLO')) {
      console.log(`  - ${r.nombre}: ${r.detalle}`);
    }
    console.log('');
  }

  process.exitCode = fallos === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\n[FALLO] Error inesperado en la suite de aceptacion: ${error.message}`);
  process.exitCode = 1;
});
