#!/usr/bin/env node
/**
 * scripts/clean-ports.js
 * Mata los procesos que escuchan en los puertos 4000 (API) y 4200 (web).
 * Multiplataforma: usa netstat + taskkill en Windows y lsof + kill en
 * Linux/macOS, de modo que `npm run dev:clean` funcione igual en el
 * equipo de desarrollo (Windows) y en el equipo de pruebas (Linux).
 */
'use strict';

const { execSync } = require('node:child_process');

const PUERTOS = [4000, 4200];

function pidsWindows(puerto) {
  try {
    const salida = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const pids = new Set();
    for (const linea of salida.split(/\r?\n/)) {
      if (linea.includes(`:${puerto} `) && /LISTENING/i.test(linea)) {
        const partes = linea.trim().split(/\s+/);
        const pid = partes[partes.length - 1];
        if (/^\d+$/.test(pid)) pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function pidsUnix(puerto) {
  try {
    const salida = execSync(`lsof -ti tcp:${puerto}`, { encoding: 'utf8' });
    return salida.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const esWindows = process.platform === 'win32';
  let terminados = 0;

  for (const puerto of PUERTOS) {
    const pids = esWindows ? pidsWindows(puerto) : pidsUnix(puerto);
    for (const pid of pids) {
      try {
        execSync(esWindows ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`);
        console.log(`[clean-ports] Puerto ${puerto}: proceso ${pid} terminado.`);
        terminados++;
      } catch {
        console.log(`[clean-ports] Puerto ${puerto}: no se pudo terminar el proceso ${pid}.`);
      }
    }
  }

  if (terminados === 0) {
    console.log('[clean-ports] No habia procesos escuchando en los puertos 4000/4200.');
  }
}

main();