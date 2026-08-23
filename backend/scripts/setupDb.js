/**
 * scripts/setupDb.js
 * Script de preparacion de la base de datos en un solo paso.
 * 1. Crea la base de datos y las tablas (ejecuta db/schema.sql).
 * 2. Pobla los datos de ejemplo (invoca scripts/seed.js).
 *
 * Uso: npm run db:setup
 */

const { spawnSync } = require('child_process');
const path = require('path');

const node = process.execPath;
const seedPath = path.join(__dirname, 'seed.js');

console.log('==============================================');
console.log(' FacturaExpress - Configuracion de la base de datos');
console.log('==============================================\n');

// Ejecutar el seed, que internamente aplica el esquema y puebla datos
const resultado = spawnSync(node, [seedPath], { stdio: 'inherit' });

if (resultado.status === 0) {
  console.log('\n[setup] Base de datos lista. Inicie la API con: npm start');
} else {
  console.error('\n[setup] Fallo la configuracion. Revise el mensaje anterior.');
  process.exit(1);
}
