/**
 * scripts/seed.js
 * Script de poblacion de datos de ejemplo (seed).
 * Inserta los registros por defecto del sistema: empresa,
 * usuarios, clientes y productos. Es idempotente: si los datos
 * ya existen, no los duplica.
 *
 * Uso: npm run db:seed
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

const { validarPassword, BCRYPT_ROUNDS } = require('../config/password');
const {
  EMPRESA_DEFAULT,
  PRODUCTOS_DEFAULT,
  CLIENTES_DEFAULT,
  USUARIOS_DEFAULT,
} = require('../db/seedData');

dotenv.config();

/** Nombre de la base de datos (configurable por entorno) */
const DB_NAME = process.env.DB_NAME || 'facturaexpress_apirest';

/** Indica que la base de datos ya existe (servicio MySQL de CI o contenedor) */
const omitirCreacionBd = process.env.DB_SKIP_CREATE === '1';

/**
 * Configuracion de conexion tomada de las variables de entorno.
 *
 * Cuando la base ya existe (DB_SKIP_CREATE=1: servicio MySQL de CI o
 * contenedor de docker-compose) se selecciona al conectar, porque el
 * esquema no ejecuta CREATE DATABASE ni USE. Si la base no existe, la
 * conexion va sin "database" y es schema.sql quien la crea y la usa.
 */
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  ...(omitirCreacionBd ? { database: DB_NAME } : {}),
  multipleStatements: true,
};

/**
 * Ejecuta el script de esquema (schema.sql) para crear la
 * estructura de tablas si aun no existe. Las sentencias se
 * ejecutan de una en una para tolerar re-ejecuciones
 * (indices o elementos ya existentes).
 */
async function ejecutarEsquema(connection) {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Se eliminan los comentarios antes de dividir por ';' para que un
  // comentario que contenga punto y coma no parta una sentencia.
  const sinComentarios = schema
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('\n');

  let sentencias = sinComentarios
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // En contenedores (docker-compose) la base de datos ya existe y el
  // usuario de la app no tiene privilegio global CREATE DATABASE.
  if (omitirCreacionBd) {
    sentencias = sentencias.filter((s) => !/^CREATE DATABASE|^USE /i.test(s.trim()));

    // schema.sql selecciona la base con USE; al omitirlo hay que hacerlo de
    // forma explicita o las sentencias siguientes fallan con
    // "No database selected" (Error 1046).
    await connection.query(`USE \`${DB_NAME.replace(/`/g, '')}\``);
  }

  for (const sentencia of sentencias) {
    try {
      await connection.query(sentencia);
    } catch (error) {
      // Tolerar objetos ya creados en re-ejecuciones (idempotencia)
      const mensaje = error.message || '';
      if (!/duplicate key name|already exists|duplicate foreign key|check constraint/i.test(mensaje)) {
        throw error;
      }
    }
  }
  console.log('[seed] Esquema de base de datos verificado.');
}

/**
 * Pobla la tabla empresa con el registro unico (id = 1).
 */
async function seedEmpresa(connection) {
  const [rows] = await connection.query('SELECT id FROM empresa WHERE id = 1');
  if (rows.length > 0) {
    console.log('[seed] La empresa ya estaba registrada. Omitiendo.');
    return;
  }

  await connection.query(
    `INSERT INTO empresa
      (id, nit, razon_social, email_facturacion, telefono, resolucion_dian, fecha_expiracion_cert, ultima_sync)
     VALUES (1, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      EMPRESA_DEFAULT.nit,
      EMPRESA_DEFAULT.razonSocial,
      EMPRESA_DEFAULT.emailFacturacion,
      EMPRESA_DEFAULT.telefono,
      EMPRESA_DEFAULT.resolucionDian,
      EMPRESA_DEFAULT.fechaExpiracionCert,
    ]
  );
  console.log('[seed] Empresa registrada:', EMPRESA_DEFAULT.razonSocial);
}

/**
 * Resuelve la contrasena de un usuario del seed.
 *
 * Prioridad:
 *  1. La variable de entorno indicada en `envPassword` (util para CI,
 *     pruebas de aceptacion y despliegues reproducibles).
 *  2. Una contrasena aleatoria generada aqui, que se muestra una unica
 *     vez por consola.
 *
 * Nunca se usa una contrasena por defecto conocida: una instalacion
 * recien desplegada no puede quedar con credenciales publicas.
 *
 * @param {object} usuario - Definicion del usuario del seed.
 * @returns {{password: string, origen: 'entorno'|'generada'}}
 */
function resolverPassword(usuario) {
  const desdeEntorno = process.env[usuario.envPassword];
  if (desdeEntorno) {
    const error = validarPassword(desdeEntorno);
    if (!error) {
      return { password: String(desdeEntorno), origen: 'entorno' };
    }
    console.warn(
      `[seed] ${usuario.envPassword} no cumple la politica de contrasenas (${error}) ` +
        'Se generara una aleatoria.'
    );
  }
  return { password: generarPasswordAleatoria(), origen: 'generada' };
}

/**
 * Genera una contrasena aleatoria que cumple la politica: incluye
 * minuscula, mayuscula y digito, sobre un alfabeto sin caracteres
 * ambiguos.
 * @returns {string} Contrasena aleatoria.
 */
function generarPasswordAleatoria() {
  const minusculas = 'abcdefghijkmnpqrstuvwxyz';
  const mayusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digitos = '23456789';
  const todos = minusculas + mayusculas + digitos;

  const elegir = (alfabeto) => alfabeto[crypto.randomInt(alfabeto.length)];

  // Garantiza una de cada categoria y completa hasta 16 caracteres
  const caracteres = [elegir(minusculas), elegir(mayusculas), elegir(digitos)];
  while (caracteres.length < 16) caracteres.push(elegir(todos));

  // Mezcla para que las categorias no queden siempre al inicio
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}

/**
 * Pobla la tabla usuarios con contrasenas encriptadas.
 */
async function seedUsuarios(connection) {
  const [rows] = await connection.query('SELECT COUNT(*) AS total FROM usuarios');
  if (rows[0].total > 0) {
    console.log('[seed] Ya existen usuarios. Omitiendo.');
    return;
  }

  const credenciales = [];

  for (const usuario of USUARIOS_DEFAULT) {
    const { password, origen } = resolverPassword(usuario);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await connection.query(
      `INSERT INTO usuarios (nit, nombre, email, telefono, rol, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [usuario.nit, usuario.nombre, usuario.email, usuario.telefono, usuario.rol, passwordHash]
    );
    credenciales.push({ rol: usuario.rol, nit: usuario.nit, password, origen });
  }

  console.log(`[seed] ${USUARIOS_DEFAULT.length} usuarios creados (contrasenas encriptadas).`);

  const generadas = credenciales.filter((c) => c.origen === 'generada');
  if (generadas.length > 0) {
    console.log('');
    console.log('  ------------------------------------------------------------');
    console.log('  Credenciales generadas (se muestran una sola vez). Guardelas');
    console.log('  o defina SEED_ADMIN_PASSWORD / SEED_VENDEDOR_PASSWORD /');
    console.log('  SEED_CONTADOR_PASSWORD antes de volver a ejecutar el seed.');
    console.log('  ------------------------------------------------------------');
    for (const c of credenciales) {
      console.log(`  ${c.rol.padEnd(9)} NIT ${c.nit.padEnd(16)} clave ${c.password}`);
    }
    console.log('  ------------------------------------------------------------');
    console.log('');
  }
}

/**
 * Pobla la tabla clientes con el directorio de ejemplo.
 */
async function seedClientes(connection) {
  const [rows] = await connection.query('SELECT COUNT(*) AS total FROM clientes');
  if (rows[0].total > 0) {
    console.log('[seed] Ya existen clientes. Omitiendo.');
    return;
  }

  for (const cliente of CLIENTES_DEFAULT) {
    await connection.query(
      'INSERT INTO clientes (identificacion, nombre, email, telefono) VALUES (?, ?, ?, ?)',
      [cliente.identificacion, cliente.nombre, cliente.email, cliente.telefono]
    );
  }
  console.log(`[seed] ${CLIENTES_DEFAULT.length} clientes creados.`);
}

/**
 * Pobla la tabla productos con el catalogo de ejemplo.
 */
async function seedProductos(connection) {
  const [rows] = await connection.query('SELECT COUNT(*) AS total FROM productos');
  if (rows[0].total > 0) {
    console.log('[seed] Ya existen productos. Omitiendo.');
    return;
  }

  for (const producto of PRODUCTOS_DEFAULT) {
    await connection.query(
      'INSERT INTO productos (codigo, nombre, precio, iva, stock) VALUES (?, ?, ?, ?, ?)',
      [producto.codigo, producto.nombre, producto.precio, producto.iva, producto.stock]
    );
  }
  console.log(`[seed] ${PRODUCTOS_DEFAULT.length} productos creados.`);
}

/**
 * Funcion principal del seed.
 */
async function main() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('[seed] Conectado a MySQL.');

    await ejecutarEsquema(connection);
    await seedEmpresa(connection);
    await seedUsuarios(connection);
    await seedClientes(connection);
    await seedProductos(connection);

    console.log('[seed] Poblacion de datos completada con exito.');
  } catch (error) {
    console.error('[seed] Error durante la poblacion de datos:', error.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

main();
