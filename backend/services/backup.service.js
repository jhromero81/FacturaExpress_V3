/**
 * services/backup.service.js
 * Servicio de respaldos y restauracion de la base de datos.
 * Genera volcados SQL de todas las tablas (sin depender de
 * mysqldump) y permite restaurarlos borrando y reinsertando
 * los datos con las claves foraneas desactivadas.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

/** Directorio donde se almacenan los respaldos */
const BACKUP_DIR = path.join(os.tmpdir(), 'facturaexpress_backups');

/**
 * Garantiza que el directorio de respaldos exista.
 * @returns {string} Ruta del directorio de respaldos.
 */
function getBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
}

/**
 * Valida que un nombre de archivo corresponda a un respaldo
 * existente dentro del directorio (evita path traversal).
 * @param {string} archivo - Nombre del archivo de respaldo.
 * @returns {string|null} Ruta absoluta del archivo o null si es invalido.
 */
function getBackupPath(archivo) {
  const nombre = path.basename(String(archivo || ''));
  if (!nombre) return null;
  const ruta = path.join(getBackupDir(), nombre);
  if (!fs.existsSync(ruta)) return null;
  return ruta;
}

/**
 * Escapa un valor para incrustarlo en una sentencia INSERT.
 * @param {object} connection - Conexion MySQL.
 * @param {*} valor - Valor a escapar.
 * @returns {string} Valor escapado para SQL.
 */
function escaparValor(connection, valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (Buffer.isBuffer(valor)) return `X'${valor.toString('hex')}'`;
  return connection.escape(valor);
}

/**
 * Genera un volcado SQL completo de la base de datos actual.
 * @returns {Promise<{archivo: string, tamano: number, ruta: string}>} Datos del respaldo creado.
 */
async function crearBackup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'facturaexpress_apirest',
  });

  try {
    const [tablas] = await connection.query(
      `SELECT table_name AS nombre
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name`
    );

    const lineas = [];
    lineas.push('-- ============================================================');
    lineas.push(`-- FacturaExpress - Respaldo de la base de datos (${new Date().toISOString()})`);
    lineas.push('-- ============================================================');
    lineas.push('SET FOREIGN_KEY_CHECKS = 0;');
    lineas.push('');

    for (const { nombre } of tablas) {
      const [crear] = await connection.query(`SHOW CREATE TABLE \`${nombre}\``);
      const createSql = crear[0]['Create Table'];
      lineas.push(`DROP TABLE IF EXISTS \`${nombre}\`;`);
      lineas.push(`${createSql};`);
      lineas.push('');

      const [filas] = await connection.query(`SELECT * FROM \`${nombre}\``);
      if (filas.length > 0) {
        const columnas = Object.keys(filas[0]);
        const columnasSql = columnas.map((c) => `\`${c}\``).join(', ');
        const bloques = [];
        for (const fila of filas) {
          const valores = columnas.map((c) => escaparValor(connection, fila[c]));
          bloques.push(`(${valores.join(', ')})`);
          if (bloques.length >= 500) {
            lineas.push(`INSERT INTO \`${nombre}\` (${columnasSql}) VALUES`);
            lineas.push(bloques.join(',\n') + ';');
            bloques.length = 0;
          }
        }
        if (bloques.length > 0) {
          lineas.push(`INSERT INTO \`${nombre}\` (${columnasSql}) VALUES`);
          lineas.push(bloques.join(',\n') + ';');
        }
        lineas.push('');
      }
    }

    lineas.push('SET FOREIGN_KEY_CHECKS = 1;');

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const archivo = `backup_${timestamp}.sql`;
    const ruta = path.join(getBackupDir(), archivo);
    const contenido = lineas.join('\n');

    fs.writeFileSync(ruta, contenido, 'utf8');

    return { archivo, tamano: Buffer.byteLength(contenido, 'utf8'), ruta };
  } finally {
    await connection.end();
  }
}

/**
 * Lista los archivos de respaldo existentes (mas recientes primero).
 * @returns {Array<{archivo: string, tamano: number, fecha: Date}>} Respaldo disponibles.
 */
function listarBackups() {
  const dir = getBackupDir();
  const archivos = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return { archivo: f, tamano: stat.size, fecha: stat.mtime };
    })
    .sort((a, b) => b.fecha - a.fecha);
  return archivos;
}

/**
 * Restaura la base de datos desde un archivo de respaldo.
 * @param {string} archivo - Nombre del archivo de respaldo.
 * @returns {Promise<boolean>} true si la restauracion fue exitosa.
 */
async function restaurarBackup(archivo) {
  const ruta = getBackupPath(archivo);
  if (!ruta) {
    const error = new Error(`El respaldo "${archivo}" no existe.`);
    error.statusCode = 404;
    throw error;
  }

  const contenido = fs.readFileSync(ruta, 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'facturaexpress_apirest',
    multipleStatements: true,
  });

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query(contenido);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    return true;
  } finally {
    await connection.end();
  }
}

/**
 * Elimina un archivo de respaldo.
 * @param {string} archivo - Nombre del archivo de respaldo.
 * @returns {boolean} true si se elimino.
 */
function eliminarBackup(archivo) {
  const ruta = getBackupPath(archivo);
  if (!ruta) {
    const error = new Error(`El respaldo "${archivo}" no existe.`);
    error.statusCode = 404;
    throw error;
  }
  fs.unlinkSync(ruta);
  return true;
}

module.exports = {
  getBackupDir,
  getBackupPath,
  crearBackup,
  listarBackups,
  restaurarBackup,
  eliminarBackup,
};
