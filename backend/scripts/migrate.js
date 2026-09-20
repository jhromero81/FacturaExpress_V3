/**
 * scripts/migrate.js
 * Migracion idempotente del esquema a la version 3.x.
 *
 * Aplica sobre bases de datos ya creadas los cambios que
 * `CREATE TABLE IF NOT EXISTS` no puede aplicar:
 *   - Nuevas columnas DIAN en la tabla facturas (v2).
 *   - Cambio del ENUM de estado (enviado/rechazado/procesando/anulada ->
 *     pendiente/enviada/rechazada), alineado al modelo Java (v2).
 *   - Creacion de las tablas errores_sistema, logs_auditoria,
 *     reportes, backups y tokens_revocados (v2).
 *   - v3: tabla secuencias_facturas (numeracion persistente), bloqueo
 *     de cuenta en usuarios, rol y firma_estado como ENUM, checksum de
 *     respaldos, invariante de stock no negativo e indices faltantes.
 *
 * Uso: npm run db:migrate
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'facturaexpress_apirest',
  multipleStatements: true,
};

/**
 * Verifica si una tabla existe en la base de datos.
 * @param {object} connection - Conexion MySQL.
 * @param {string} tabla - Nombre de la tabla.
 * @returns {Promise<boolean>}
 */
async function existeTabla(connection, tabla) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [tabla]
  );
  return Number(rows[0].total) > 0;
}

/**
 * Verifica si una columna existe en una tabla.
 * @param {object} connection - Conexion MySQL.
 * @param {string} tabla - Nombre de la tabla.
 * @param {string} columna - Nombre de la columna.
 * @returns {Promise<boolean>}
 */
async function existeColumna(connection, tabla, columna) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tabla, columna]
  );
  return Number(rows[0].total) > 0;
}

/**
 * Consulta el tipo actual de una columna.
 * @param {object} connection - Conexion MySQL.
 * @param {string} tabla - Nombre de la tabla.
 * @param {string} columna - Nombre de la columna.
 * @returns {Promise<string>} Tipo de la columna.
 */
async function tipoColumna(connection, tabla, columna) {
  const [rows] = await connection.query(
    `SELECT column_type AS tipo
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tabla, columna]
  );
  return rows.length > 0 ? String(rows[0].tipo) : '';
}

/**
 * Verifica si un indice existe en una tabla.
 * @param {object} connection - Conexion MySQL.
 * @param {string} tabla - Nombre de la tabla.
 * @param {string} indice - Nombre del indice.
 * @returns {Promise<boolean>}
 */
async function existeIndice(connection, tabla, indice) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tabla, indice]
  );
  return Number(rows[0].total) > 0;
}

/**
 * Ejecuta una sentencia tolerando que el objeto ya exista.
 * @param {object} connection - Conexion MySQL.
 * @param {string} sql - Sentencia DDL.
 * @param {RegExp} tolerar - Patrones de error considerados benignos.
 * @returns {Promise<boolean>} true si se aplico el cambio.
 */
async function aplicar(connection, sql, tolerar = /duplicate|already exists|check constraint/i) {
  try {
    await connection.query(sql);
    return true;
  } catch (error) {
    if (tolerar.test(error.message || '')) return false;
    throw error;
  }
}

/** Cambios de la version 2 (columnas DIAN y ENUM de estado). */
async function migrarV2(connection) {
  if (!(await existeTabla(connection, 'facturas'))) return;

  const columnasFacturas = [
    ['firma_estado', "VARCHAR(20) NOT NULL DEFAULT 'pendiente'"],
    ['intentos_dian', 'INT NOT NULL DEFAULT 0'],
    ['correo_enviado', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ];
  for (const [columna, definicion] of columnasFacturas) {
    if (!(await existeColumna(connection, 'facturas', columna))) {
      await connection.query(`ALTER TABLE facturas ADD COLUMN ${columna} ${definicion}`);
      console.log(`[migrate] Columna facturas.${columna} agregada.`);
    }
  }

  const tipo = await tipoColumna(connection, 'facturas', 'estado');
  if (tipo.includes('enviado')) {
    console.log('[migrate] Migrando estados de factura al modelo Java (pendiente/enviada/rechazada)...');
    await connection.query(
      `UPDATE facturas
          SET estado = CASE estado
                WHEN 'enviado' THEN 'enviada'
                WHEN 'rechazado' THEN 'rechazada'
                WHEN 'procesando' THEN 'pendiente'
                WHEN 'anulada' THEN 'rechazada'
                ELSE 'pendiente'
              END`
    );
    await connection.query(
      `ALTER TABLE facturas
         MODIFY COLUMN estado ENUM('pendiente','enviada','rechazada')
         NOT NULL DEFAULT 'pendiente'`
    );
    console.log('[migrate] ENUM de estado actualizado.');
  } else if (tipo && !tipo.includes('pendiente')) {
    await connection.query(
      `ALTER TABLE facturas
         MODIFY COLUMN estado ENUM('pendiente','enviada','rechazada')
         NOT NULL DEFAULT 'pendiente'`
    );
    console.log('[migrate] ENUM de estado verificado.');
  }
}

/** Tablas que introduce la version 2. */
async function tablasV2(connection) {
  const tablas = {
    errores_sistema: `
      CREATE TABLE IF NOT EXISTS errores_sistema (
        id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        mensaje           TEXT NOT NULL,
        tipo              VARCHAR(50) NOT NULL DEFAULT 'otro',
        factura_id        INT UNSIGNED NULL,
        resuelto          TINYINT(1)  NOT NULL DEFAULT 0,
        fecha_resolucion  DATETIME    NULL,
        created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_errores_factura
          FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    logs_auditoria: `
      CREATE TABLE IF NOT EXISTS logs_auditoria (
        id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id     INT UNSIGNED NULL,
        accion         VARCHAR(200) NOT NULL,
        tabla_afectada VARCHAR(50)  NOT NULL DEFAULT 'general',
        registro_id    BIGINT       NULL,
        ip_origen      VARCHAR(45)  NULL,
        created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_logs_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    reportes: `
      CREATE TABLE IF NOT EXISTS reportes (
        id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tipo           VARCHAR(50)  NOT NULL,
        periodo        VARCHAR(20)  NULL,
        fecha_inicio   DATE         NULL,
        fecha_fin      DATE         NULL,
        archivo        VARCHAR(255) NULL,
        tamano         BIGINT       NOT NULL DEFAULT 0,
        usuario_id     INT UNSIGNED NULL,
        created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_reportes_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    tokens_revocados: `
      CREATE TABLE IF NOT EXISTS tokens_revocados (
        jti        VARCHAR(64) NOT NULL PRIMARY KEY,
        expira_en  DATETIME    NOT NULL,
        created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  };

  for (const [tabla, ddl] of Object.entries(tablas)) {
    if (!(await existeTabla(connection, tabla))) {
      await connection.query(ddl);
      console.log(`[migrate] Tabla ${tabla} creada.`);
    }
  }
}

/**
 * Version 3: numeracion persistente, bloqueo de cuenta, ENUMs,
 * checksum de respaldos, invariante de stock e indices.
 */
async function migrarV3(connection) {
  // ---- Tabla de respaldos con checksum y nombre unico ----
  if (!(await existeTabla(connection, 'backups'))) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        archivo     VARCHAR(255) NOT NULL UNIQUE,
        tamano      BIGINT       NOT NULL DEFAULT 0,
        checksum    CHAR(64)     NULL,
        usuario_id  INT UNSIGNED NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_backups_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[migrate] Tabla backups creada.');
  } else {
    if (!(await existeColumna(connection, 'backups', 'checksum'))) {
      await connection.query('ALTER TABLE backups ADD COLUMN checksum CHAR(64) NULL');
      console.log('[migrate] Columna backups.checksum agregada.');
    }
    if (!(await existeIndice(connection, 'backups', 'archivo'))) {
      const aplicado = await aplicar(connection, 'ALTER TABLE backups ADD UNIQUE KEY archivo (archivo)');
      console.log(
        aplicado
          ? '[migrate] UNIQUE en backups.archivo agregado.'
          : '[migrate] No se pudo agregar UNIQUE en backups.archivo (hay duplicados): revise manualmente.'
      );
    }
  }

  // ---- Secuencia persistente de numeracion de facturas ----
  if (!(await existeTabla(connection, 'secuencias_facturas'))) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS secuencias_facturas (
        prefijo    VARCHAR(20)  NOT NULL PRIMARY KEY,
        ultimo     INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[migrate] Tabla secuencias_facturas creada.');
  }

  // Sembrar la secuencia con el ultimo numero ya emitido para no
  // reiniciar el consecutivo ni chocar con facturas existentes.
  if (await existeTabla(connection, 'facturas')) {
    const [res] = await connection.query(
      `INSERT INTO secuencias_facturas (prefijo, ultimo)
       SELECT CONCAT(SUBSTRING_INDEX(numero, '-', 2), '-') AS prefijo,
              MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS ultimo
         FROM facturas
        WHERE numero LIKE 'FAC-%-%'
        GROUP BY prefijo
       ON DUPLICATE KEY UPDATE ultimo = GREATEST(ultimo, VALUES(ultimo))`
    );
    if (res.affectedRows > 0) {
      console.log('[migrate] Secuencia de numeracion sincronizada con las facturas existentes.');
    }
  }

  // ---- usuarios: bloqueo de cuenta y rol como ENUM ----
  if (await existeTabla(connection, 'usuarios')) {
    if (!(await existeColumna(connection, 'usuarios', 'intentos_fallidos'))) {
      await connection.query(
        'ALTER TABLE usuarios ADD COLUMN intentos_fallidos INT UNSIGNED NOT NULL DEFAULT 0'
      );
      console.log('[migrate] Columna usuarios.intentos_fallidos agregada.');
    }
    if (!(await existeColumna(connection, 'usuarios', 'bloqueado_hasta'))) {
      await connection.query('ALTER TABLE usuarios ADD COLUMN bloqueado_hasta DATETIME NULL');
      console.log('[migrate] Columna usuarios.bloqueado_hasta agregada.');
    }
    const tipoRol = await tipoColumna(connection, 'usuarios', 'rol');
    if (tipoRol && !tipoRol.startsWith('enum')) {
      await connection.query(
        "ALTER TABLE usuarios MODIFY COLUMN rol ENUM('admin','vendedor','contador') NOT NULL DEFAULT 'vendedor'"
      );
      console.log('[migrate] Columna usuarios.rol convertida a ENUM.');
    }
  }

  // ---- facturas.firma_estado como ENUM ----
  if (await existeTabla(connection, 'facturas')) {
    const tipoFirma = await tipoColumna(connection, 'facturas', 'firma_estado');
    if (tipoFirma && !tipoFirma.startsWith('enum')) {
      await connection.query(
        "ALTER TABLE facturas MODIFY COLUMN firma_estado ENUM('pendiente','firmada','rechazada') NOT NULL DEFAULT 'pendiente'"
      );
      console.log('[migrate] Columna facturas.firma_estado convertida a ENUM.');
    }
  }

  // ---- productos: invariante de stock no negativo ----
  if (await existeTabla(connection, 'productos')) {
    const [chk] = await connection.query(
      `SELECT COUNT(*) AS total
         FROM information_schema.table_constraints
        WHERE table_schema = DATABASE() AND table_name = 'productos'
          AND constraint_name = 'chk_productos_stock'`
    );
    if (Number(chk[0].total) === 0) {
      await connection.query('UPDATE productos SET stock = 0 WHERE stock < 0');
      const aplicado = await aplicar(
        connection,
        'ALTER TABLE productos ADD CONSTRAINT chk_productos_stock CHECK (stock >= 0)'
      );
      console.log(
        aplicado
          ? '[migrate] Restriccion chk_productos_stock agregada.'
          : '[migrate] La restriccion chk_productos_stock ya existia.'
      );
    }
  }

  // ---- Indices faltantes ----
  const indices = [
    ['reportes', 'idx_reportes_fecha', 'reportes (created_at)'],
    ['tokens_revocados', 'idx_tokens_expira', 'tokens_revocados (expira_en)'],
    ['facturas', 'idx_facturas_cliente', 'facturas (cliente_id)'],
  ];
  for (const [tabla, nombre, definicion] of indices) {
    if (!(await existeTabla(connection, tabla))) continue;
    if (await existeIndice(connection, tabla, nombre)) continue;
    const aplicado = await aplicar(connection, `CREATE INDEX ${nombre} ON ${definicion}`);
    if (aplicado) console.log(`[migrate] Indice ${nombre} creado.`);
  }
}

/**
 * Aplica la migracion de forma idempotente.
 */
async function main() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    console.log('[migrate] Conectado a MySQL.');

    await migrarV2(connection);
    await tablasV2(connection);
    await migrarV3(connection);

    console.log('[migrate] Migracion completada con exito.');
  } catch (error) {
    console.error('[migrate] Error durante la migracion:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
