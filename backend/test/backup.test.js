/**
 * test/backup.test.js
 * Pruebas del servicio de respaldos.
 *
 * Verifican las defensas de la restauracion (que es la operacion que
 * ejecuta SQL de un archivo): directorio restringido, rechazo de
 * archivos ajenos y verificacion de la huella SHA-256 registrada al
 * crear el respaldo.
 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// El directorio se fija ANTES de cargar el servicio (lo lee al importarse).
const DIR_PRUEBAS = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-backup-test-'));
process.env.BACKUP_DIR = DIR_PRUEBAS;

const backupService = require('../services/backup.service');

/** Cabecera que el servicio exige a un respaldo valido */
const CABECERA = [
  '-- ============================================================',
  '-- FacturaExpress - Respaldo de la base de datos (2026-09-20T00:00:00.000Z)',
  '-- ============================================================',
  'SET FOREIGN_KEY_CHECKS = 0;',
].join('\n');

/**
 * Escribe un archivo de respaldo en el directorio de pruebas.
 * @param {string} nombre - Nombre del archivo.
 * @param {string} contenido - Contenido.
 * @returns {string} Ruta absoluta.
 */
function escribirRespaldo(nombre, contenido) {
  const ruta = path.join(DIR_PRUEBAS, nombre);
  fs.writeFileSync(ruta, contenido, 'utf8');
  return ruta;
}

before(() => {
  fs.mkdirSync(DIR_PRUEBAS, { recursive: true });
});

after(() => {
  fs.rmSync(DIR_PRUEBAS, { recursive: true, force: true });
});

test('calcularChecksum es determinista y distingue contenidos', () => {
  const a = backupService.calcularChecksum('contenido');
  const b = backupService.calcularChecksum('contenido');
  const c = backupService.calcularChecksum('contenido ');

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64, 'debe ser un SHA-256 en hexadecimal');
});

test('getBackupPath impide el path traversal', () => {
  assert.equal(backupService.getBackupPath('../../etc/passwd'), null);
  assert.equal(backupService.getBackupPath('/etc/passwd'), null);
  assert.equal(backupService.getBackupPath(''), null);
  assert.equal(backupService.getBackupPath(null), null);
});

test('getBackupPath devuelve null si el respaldo no existe', () => {
  assert.equal(backupService.getBackupPath('no_existe.sql'), null);
});

test('la restauracion rechaza un archivo que no es un respaldo', async () => {
  escribirRespaldo('ajeno.sql', 'DROP TABLE clientes;\nSELECT 1;');

  await assert.rejects(
    () => backupService.restaurarBackup('ajeno.sql'),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /no es un respaldo valido/i);
      return true;
    }
  );
});

test('la restauracion rechaza un archivo con la cabecera alterada', async () => {
  // La marca debe estar en el ENCABEZADO: un archivo que ejecute SQL antes
  // y solo incluya la cabecera mas adelante no es un respaldo valido.
  const relleno = Array.from({ length: 40 }, (_, i) => `DROP TABLE t${i};`).join('\n');
  escribirRespaldo('tardio.sql', `${relleno}\n${CABECERA}\n`);

  await assert.rejects(
    () => backupService.restaurarBackup('tardio.sql'),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /no es un respaldo valido/i);
      return true;
    }
  );
});

test('la restauracion rechaza un respaldo cuya huella no coincide', async () => {
  const contenido = `${CABECERA}\nSELECT 1;\n`;
  escribirRespaldo('alterado.sql', contenido);

  await assert.rejects(
    () => backupService.restaurarBackup('alterado.sql', '0'.repeat(64)),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /huella del respaldo no coincide/i);
      return true;
    }
  );
});

test('un respaldo inexistente responde 404', async () => {
  await assert.rejects(
    () => backupService.restaurarBackup('fantasma.sql'),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test('con la huella correcta la restauracion supera las validaciones', async () => {
  const contenido = `${CABECERA}\nSELECT 1;\n`;
  escribirRespaldo('valido.sql', contenido);
  const checksum = backupService.calcularChecksum(contenido);

  // Las comprobaciones de formato y huella pasan; el fallo posterior es de
  // conexion con MySQL, lo que demuestra que las defensas no rechazaron el
  // archivo. El destino se apunta a un puerto sin servicio para que ese fallo
  // sea determinista: antes se asumia que en la maquina no habia MySQL, de
  // modo que en un equipo con el servidor levantado y credenciales validas la
  // prueba ejecutaba una restauracion REAL contra esa base de datos.
  const hostOriginal = process.env.DB_HOST;
  const puertoOriginal = process.env.DB_PORT;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '1';

  try {
    await assert.rejects(
      () => backupService.restaurarBackup('valido.sql', checksum),
      (error) => {
        assert.notEqual(error.statusCode, 400, 'no debe rechazarse por formato o huella');
        assert.notEqual(error.statusCode, 404, 'el archivo existe');
        return true;
      }
    );
  } finally {
    if (hostOriginal === undefined) delete process.env.DB_HOST;
    else process.env.DB_HOST = hostOriginal;
    if (puertoOriginal === undefined) delete process.env.DB_PORT;
    else process.env.DB_PORT = puertoOriginal;
  }
});
