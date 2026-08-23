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

/** Calcula el IVA de un valor base. */
export function calcularIVA(base: number): number {
  return Math.round(base * IVA_RATE);
}

/** Calcula el porcentaje de cambio entre dos valores. */
export function calculateVariation(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
}
