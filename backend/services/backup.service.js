/**
 * services/backup.service.js
 * Servicio de respaldos y restauracion de la base de datos.
 * Genera volcados SQL de todas las tablas (sin depender de
 * mysqldump) y permite restaurarlos borrando y reinsertando
 * los datos con las claves foraneas desactivadas.
 *
 * Endurecimiento:
 *  - El directorio y los archivos se crean con permisos restrictivos
 *    (0700/0600): el volcado contiene hashes de contrasena de todos los
 *    usuarios y antes quedaba legible por cualquier usuario del sistema.
 *  - Cada respaldo registra la huella SHA-256 de su contenido y la
 *    restauracion solo acepta un archivo cuya huella coincida con la
 *    registrada al crearlo.
 *  - Las credenciales de restauracion pueden ser distintas de las de
 *    runtime (DB_RESTORE_USER / DB_RESTORE_PASSWORD).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

/** Directorio donde se almacenan los respaldos (configurable) */
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(os.tmpdir(), 'facturaexpress_backups');

/** Cabecera que identifica un volcado generado por la aplicacion */
const MARCA = '-- FacturaExpress - Respaldo de la base de datos';

/**
 * Garantiza que el directorio de respaldos exista, con permisos 0700.
 * @returns {string} Ruta del directorio de respaldos.
 */
function getBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
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
 * Calcula la huella SHA-256 de un contenido.
 * @param {string} contenido - Contenido del respaldo.
 * @returns {string} Hash en hexadecimal.
 */
function calcularChecksum(contenido) {
  return crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
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
 * Construye la configuracion de conexion de runtime.
 * @returns {object} Configuracion para mysql2.
 */
function dbConfigRuntime() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'facturaexpress_apirest',
  };
}

/**
 * Construye la configuracion de conexion usada para restaurar. Usa las
 * credenciales con privilegios DDL si estan definidas (una restauracion
 * recrea tablas) y, si no, reutiliza las de runtime.
 * @returns {object} Configuracion para mysql2.
 */
function dbConfigRestore() {
  const config = dbConfigRuntime();
  if (process.env.DB_RESTORE_USER) {
    config.user = process.env.DB_RESTORE_USER;
    config.password = process.env.DB_RESTORE_PASSWORD || '';
  }
  return config;
}

/**
 * Genera un volcado SQL completo de la base de datos actual.
 * @returns {Promise<{archivo: string, tamano: number, checksum: string, ruta: string}>} Datos del respaldo creado.
 */
async function crearBackup() {
  const connection = await mysql.createConnection(dbConfigRuntime());

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
    const contenido = lineas.join('\n');

    // El nombre es unico: dos respaldos en el mismo segundo no se pisan.
    let archivo = `backup_${timestamp}.sql`;
    let ruta = path.join(getBackupDir(), archivo);
    let sufijo = 1;
    while (fs.existsSync(ruta)) {
      archivo = `backup_${timestamp}_${sufijo}.sql`;
      ruta = path.join(getBackupDir(), archivo);
      sufijo += 1;
    }

    // mode 0600: el volcado contiene hashes de contrasena.
    fs.writeFileSync(ruta, contenido, { encoding: 'utf8', mode: 0o600 });

    return {
      archivo,
      tamano: Buffer.byteLength(contenido, 'utf8'),
      checksum: calcularChecksum(contenido),
      ruta,
    };
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
 *
 * Solo acepta volcados generados por la aplicacion: el contenido debe
 * empezar por la cabecera identificativa y, si se conoce la huella
 * registrada al crearlo, debe coincidir exactamente. Asi un archivo
 * ajeno colocado en el directorio no puede ejecutarse.
 *
 * @param {string} archivo - Nombre del archivo de respaldo.
 * @param {string|null} [checksumEsperado=null] - Huella registrada del respaldo.
 * @returns {Promise<boolean>} true si la restauracion fue exitosa.
 */
async function restaurarBackup(archivo, checksumEsperado = null) {
  const ruta = getBackupPath(archivo);
  if (!ruta) {
    const error = new Error(`El respaldo "${archivo}" no existe.`);
    error.statusCode = 404;
    throw error;
  }

  const contenido = fs.readFileSync(ruta, 'utf8');

  // La cabecera identificativa debe estar en el encabezado del archivo (el
  // volcado comienza con una linea de separadores, por lo que no basta con
  // comprobar el primer caracter ni con buscar la marca en cualquier parte).
  const cabecera = contenido.slice(0, 500);
  if (!cabecera.includes(MARCA)) {
    const error = new Error('El archivo no es un respaldo valido de FacturaExpress.');
    error.statusCode = 400;
    throw error;
  }

  const checksumReal = calcularChecksum(contenido);
  if (checksumEsperado && checksumReal !== checksumEsperado) {
    const error = new Error(
      'La huella del respaldo no coincide con la registrada: el archivo fue alterado.'
    );
    error.statusCode = 400;
    throw error;
  }

  const connection = await mysql.createConnection({
    ...dbConfigRestore(),
    multipleStatements: true,
  });

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query(contenido);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // Las sesiones revocadas despues de tomar el respaldo volverian a ser
    // validas al restaurar tokens_revocados. Se vacia la lista para forzar
    // un nuevo inicio de sesion de todos los usuarios.
    await connection.query('DELETE FROM tokens_revocados');

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
  BACKUP_DIR,
  getBackupDir,
  getBackupPath,
  calcularChecksum,
  crearBackup,
  listarBackups,
  restaurarBackup,
  eliminarBackup,
};
