#!/usr/bin/env node
/**
 * scripts/check-native-binaries.js
 * ============================================================
 * Portabilidad entre plataformas (Windows / Linux / macOS)
 * ============================================================
 * esbuild y rolldown (usados por el build de Angular) instalan un
 * binario nativo compilado para la plataforma en la que se ejecuta
 * `npm install`. Si `node_modules` se copia entre sistemas (por
 * ejemplo, desde un contenedor Docker Linux hacia un equipo Windows),
 * quedan los binarios de la plataforma de origen y el build falla con
 * "You installed esbuild for another platform".
 *
 * Este script verifica que los binarios nativos correspondan a la
 * plataforma actual y, si no, los restaura de forma aditiva con
 * `npm install --no-save --package-lock=false` (no modifica
 * package.json ni package-lock.json).
 *
 * Uso:
 *   node scripts/check-native-binaries.js
 *   npm run check:native                        # desde frontend/
 *   npm run check:native --prefix frontend      # desde la raiz
 */
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const NODE_MODULES = path.join(RAIZ, 'node_modules');

/**
 * Paquetes nativos y su paquete principal. La version esperada del
 * binario se lee de `optionalDependencies` del paquete principal, que
 * es la version exacta que el build de Angular necesita.
 */
const NATIVOS = {
  esbuild: {
    principal: 'esbuild',
    binarios: {
      'win32-x64': '@esbuild/win32-x64',
      'win32-arm64': '@esbuild/win32-arm64',
      'linux-x64': '@esbuild/linux-x64',
      'linux-arm64': '@esbuild/linux-arm64',
      'darwin-x64': '@esbuild/darwin-x64',
      'darwin-arm64': '@esbuild/darwin-arm64',
    },
  },
  rolldown: {
    principal: 'rolldown',
    binarios: {
      'win32-x64': '@rolldown/binding-win32-x64-msvc',
      'win32-arm64': '@rolldown/binding-win32-arm64-msvc',
      'linux-x64': '@rolldown/binding-linux-x64-gnu',
      'linux-arm64': '@rolldown/binding-linux-arm64-gnu',
      'darwin-x64': '@rolldown/binding-darwin-x64',
      'darwin-arm64': '@rolldown/binding-darwin-arm64',
    },
  },
};

function leerJson(rutaRelativa) {
  const ruta = path.join(NODE_MODULES, rutaRelativa);
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return null;
  }
}

function versionDe(paquete) {
  return leerJson(`${paquete}/package.json`)?.version;
}

/** Version que el paquete principal espera para el binario. */
function versionEsperada(principal, binario) {
  const pkg = leerJson(`${principal}/package.json`);
  const version = pkg?.optionalDependencies?.[binario];
  return version || pkg?.version || null;
}

function main() {
  const plataforma = process.platform || 'desconocida';
  const arch = process.arch || 'x64';
  const clave = `${plataforma}-${arch}`;
  let restaurados = 0;

  console.log(`[check-native] Plataforma detectada: ${plataforma} (${arch})`);

  for (const [nombre, cfg] of Object.entries(NATIVOS)) {
    const binario = cfg.binarios[clave];
    if (!binario) {
      console.log(`[check-native] ${nombre}: sin binario definido para ${clave}; omitiendo.`);
      continue;
    }
    const esperada = versionEsperada(cfg.principal, binario);
    if (!esperada) {
      console.log(`[check-native] ${nombre}: paquete principal no instalado; omitiendo.`);
      continue;
    }
    const actual = versionDe(binario);
    if (actual === esperada) {
      console.log(`[check-native] ${nombre}: correcto (${binario}@${actual}).`);
      continue;
    }
    console.log(
      `[check-native] ${nombre}: ${binario}@${actual || 'AUSENTE'} != ${esperada}. Restaurando...`
    );
    try {
      execSync(`npm install --no-save --package-lock=false ${binario}@${esperada}`, {
        cwd: RAIZ,
        stdio: 'inherit',
      });
      restaurados++;
    } catch (error) {
      console.error(
        `[check-native] No fue posible restaurar ${binario}@${esperada}. ` +
          'Ejecute manualmente: npm ci (reinstala todo el arbol) o ' +
          `npm install --no-save --package-lock=false ${binario}@${esperada}`
      );
    }
  }

  if (restaurados > 0) {
    console.log(`[check-native] Se restauraron ${restaurados} binario(s) nativo(s).`);
  } else {
    console.log('[check-native] Todos los binarios nativos son correctos.');
  }
}

main();