#!/usr/bin/env node
/**
 * check-contraste.mjs
 * Guard ejecutable de contraste (WCAG 2.1 AA, criterio 1.4.3).
 *
 * Lee los tres temas del CSS global (claro, oscuro y alto contraste) y
 * comprueba los pares texto/fondo que la interfaz usa de verdad. Falla con
 * codigo 1 si algun par baja de 4,5:1, de modo que el fallo no vuelva a
 * pasar inadvertido: el navegador descarta un color mal elegido sin avisar.
 *
 * Uso: node scripts/check-contraste.mjs [ruta-al-css]
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));

/** Hoja global: React la tiene en src/styles/index.css y Angular en src/styles.css */
const candidatas = ['../src/styles/index.css', '../src/styles.css'];
const rutaCss = process.argv[2]
  ? resolve(process.argv[2])
  : candidatas.map((c) => resolve(aqui, c)).find((c) => existsSync(c));

if (!rutaCss) {
  console.error('No se encontro la hoja global: pasa la ruta como argumento.');
  process.exit(1);
}

/** Umbrales de WCAG 2.1: 4,5:1 texto normal y 3:1 texto grande o componentes */
const AA_TEXTO = 4.5;
const AA_GRANDE = 3;

const aRgb = (hex) => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const luminancia = ({ r, g, b }) => {
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

const contraste = (a, b) => {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [alto, bajo] = la >= lb ? [la, lb] : [lb, la];
  return (alto + 0.05) / (bajo + 0.05);
};

/** Extrae las variables de color de un bloque de declaraciones */
const tokensDeBloque = (css, selector) => {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bloque = css.match(new RegExp(`${escapado}\\s*\\{([\\s\\S]*?)\\}`));
  if (!bloque) return {};
  const tokens = {};
  for (const m of bloque[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
};

const css = readFileSync(rutaCss, 'utf8');

const base = tokensDeBloque(css, ':root');
const temas = {
  claro: base,
  oscuro: { ...base, ...tokensDeBloque(css, 'body.fx-dark-mode') },
  'alto contraste': { ...base, ...tokensDeBloque(css, 'body.fx-high-contrast') },
};

/**
 * Pares que la interfaz usa, con su umbral.
 * Cualquier color nuevo debe entrar aqui para quedar cubierto.
 */
const pares = [
  ['text-dark', 'card-bg', AA_TEXTO, 'titulos y cuerpo sobre tarjeta'],
  ['text-dark', 'bg-main', AA_TEXTO, 'cuerpo sobre el fondo de pagina'],
  ['text-muted', 'card-bg', AA_TEXTO, 'texto secundario sobre tarjeta'],
  ['text-muted', 'bg-main', AA_TEXTO, 'texto secundario sobre el fondo'],
  ['accent-on', 'accent', AA_TEXTO, 'texto de boton principal'],
  ['accent-on', 'accent-dk', AA_TEXTO, 'texto sobre el degradado del acento (extremo oscuro)'],
  ['accent-ink', 'card-bg', AA_TEXTO, 'enlaces y acentos sobre tarjeta'],
  ['accent-ink', 'bg-main', AA_TEXTO, 'enlaces y acentos sobre el fondo'],
  ['success-ink', 'card-bg', AA_TEXTO, 'aviso de exito'],
  ['danger-ink', 'card-bg', AA_TEXTO, 'aviso de error'],
  ['warning-ink', 'card-bg', AA_TEXTO, 'aviso de advertencia'],
  ['info-ink', 'card-bg', AA_TEXTO, 'aviso informativo'],
  ['sidebar-text', 'sidebar-bg', AA_TEXTO, 'navegacion lateral'],
  ['sidebar-muted', 'sidebar-bg', AA_TEXTO, 'rotulos de grupo del menu'],
  ['accent-on-dark', 'sidebar-bg', AA_GRANDE, 'acento sobre fondo oscuro'],
];

let fallos = 0;
let comprobados = 0;

for (const [nombreTema, tokens] of Object.entries(temas)) {
  console.log(`\nTema: ${nombreTema}`);
  for (const [frente, fondo, minimo, uso] of pares) {
    const vFrente = tokens[frente];
    const vFondo = tokens[fondo];
    if (!vFrente || !vFondo) {
      console.log(`  ! ${frente} sobre ${fondo}: token sin definir`);
      fallos += 1;
      continue;
    }
    const cFrente = aRgb(vFrente);
    const cFondo = aRgb(vFondo);
    if (!cFrente || !cFondo) {
      console.log(`  ! ${frente} sobre ${fondo}: valor no hex (${vFrente} / ${vFondo})`);
      fallos += 1;
      continue;
    }
    const ratio = contraste(cFrente, cFondo);
    comprobados += 1;
    const ok = ratio >= minimo;
    if (!ok) fallos += 1;
    const marca = ok ? 'ok  ' : 'FALLA';
    console.log(
      `  ${marca} ${frente} sobre ${fondo}: ${ratio.toFixed(2)}:1 (min ${minimo}) — ${uso}`
    );
  }
}

if (fallos > 0) {
  console.error(`\nContraste: ${fallos} par(es) por debajo de AA en ${rutaCss}`);
  process.exit(1);
}
console.log(`\nOK: ${comprobados} pares de color cumplen WCAG AA en 3 temas (${rutaCss.split(/[\\/]/).pop()})`);
