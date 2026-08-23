/**
 * config/db.js
 * Configuracion de la conexion a MySQL mediante un pool de
 * conexiones. El pool es la estrategia recomendada por mysql2
 * para aplicaciones Express: reutiliza conexiones y evita
 * agotar los recursos del servidor de base de datos.
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Cargar variables de entorno desde el archivo .env
dotenv.config();

/**
 * Pool de conexiones a MySQL.
 * - connectionLimit: numero maximo de conexiones simultaneas.
 * - namedPlaceholders: permite usar parametros con nombre (:campo).
 * - timezone: las fechas se reciben/guardan sin desfase horario.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'facturaexpress_apirest',
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: 'Z',
  dateStrings: false,
});

/**
 * Prueba la conexion a la base de datos.
 * Se ejecuta al arrancar el servidor para verificar que la
 * infraestructura esta disponible.
 * @returns {Promise<void>} Resuelve si la conexion es exitosa.
 */
async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    console.log('[db] Conexion exitosa a MySQL');
  } finally {
    connection.release();
  }
}

module.exports = { pool, testConnection };
