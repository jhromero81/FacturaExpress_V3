/**
 * core/formatters.ts
 * Funciones de formateo para datos monetarios, fechas y textos.
 * Utilizadas en toda la aplicacion para mantener consistencia visual.
 */

import { IVA_RATE, PERFILES_USUARIO } from './constants';

/** Devuelve el nombre legible de un rol (admin -> Administrador). */
export function nombreRol(rol: string | null | undefined): string {
  if (!rol) return '--';
  return PERFILES_USUARIO[rol.toUpperCase()]?.nombre || rol;
}

/** Formatea un valor numerico como moneda colombiana (COP). */
export function formatMoney(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Formatea un valor en formato corto para etiquetas de graficos ($1,2 M / $500 K). */
export function formatShortMoney(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)} K`;
  return `$${Math.round(n)}`;
}

/** Formatea una cadena ISO o Date a formato local colombiano (dd/mm/yyyy). */
export function formatDate(fechaStr: string | Date | null | undefined): string {
  if (!fechaStr) return '--';
  const fecha = new Date(fechaStr);
  if (isNaN(fecha.getTime())) return '--';
  return fecha.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Genera un timestamp relativo (hace X minutos, horas, etc.). */
export function timeAgo(fechaStr: string | Date | null | undefined): string {
  if (!fechaStr) return '';
  const ahora = new Date();
  const fecha = new Date(fechaStr);
  const diffMs = ahora.getTime() - fecha.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDias = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Reciente';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  if (diffDias < 7) return `Hace ${diffDias}d`;
  return formatDate(fechaStr);
}

/** Trunca un texto largo agregando puntos suspensivos. */
export function truncateText(texto: string, maxLen = 50): string {
  if (!texto || texto.length <= maxLen) return texto || '';
  return texto.substring(0, maxLen) + '...';
}

/**
 * Calcula el IVA de un valor base con la tarifa indicada.
 * La tarifa es parametrizable porque cada producto puede tributar una
 * distinta (0%, 5% o 19%); el valor por defecto es la tarifa general.
 * @param base - Valor base sin IVA.
 * @param tasa - Tarifa en tanto por uno.
 */
export function calcularIVA(base: number, tasa: number = IVA_RATE): number {
  const tarifa = Number.isFinite(tasa) ? tasa : IVA_RATE;
  return Math.round(Number(base || 0) * tarifa);
}

/** Calcula el porcentaje de cambio entre dos valores. */
export function calculateVariation(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/**
 * Escapa una celda para CSV (RFC 4180) y neutraliza la inyeccion de
 * formulas: los valores que no son numeros y comienzan por = + @,
 * tabulador o un menos seguido de texto reciben una comilla simple.
 * Se entrecomillan los que contienen comas, comillas dobles o saltos
 * de linea.
 */
export function csvCell(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return String(valor);

  let str = String(valor);
  const esNumero = /^-?\d+(\.\d+)?$/.test(str);
  if (!esNumero && (/^[=+@\t\r]/.test(str) || str.startsWith('-'))) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convierte la etiqueta de periodo que emite la API en una abreviatura
 * legible para los graficos:
 *   - mensual:    "2026-08"  -> "Ago"
 *   - trimestral: "2026-Q3"  -> "T3"
 *   - semanal:    "2026-35"  -> "S35"
 *   - anual:      "2026"     -> "2026"
 *
 * El formato trimestral tiene dos segmentos, por lo que separar por "-"
 * y leer la tercera posicion devolvia "SNaN" en el eje del grafico.
 */
export function periodoLabel(periodo: unknown): string {
  const value = String(periodo ?? '').trim();
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const trimestre = /^(\d{4})-Q([1-4])$/i.exec(value);
  if (trimestre) return `T${trimestre[2]}`;

  if (/^\d{4}$/.test(value)) return value;

  const partes = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (partes) {
    const numero = Number(partes[2]);
    if (numero >= 1 && numero <= 12) return meses[numero - 1] ?? value;
    return `S${numero}`;
  }

  return value;
}
