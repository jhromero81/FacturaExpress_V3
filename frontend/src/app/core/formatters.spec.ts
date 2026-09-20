/**
 * formatters.spec.ts
 * Pruebas unitarias (base de la piramide) de las funciones de formateo y
 * de las reglas de calculo usadas por la interfaz: moneda COP, fechas,
 * tiempo relativo, truncado de texto, IVA y variacion porcentual.
 */

import {
  nombreRol,
  formatMoney,
  formatShortMoney,
  formatDate,
  timeAgo,
  truncateText,
  calcularIVA,
  calculateVariation,
} from './formatters';

describe('formatters - textos y roles', () => {
  it('nombreRol traduce el rol a su nombre legible', () => {
    expect(nombreRol('admin')).toBe('Administrador');
    expect(nombreRol('VENDEDOR')).toBe('Vendedor');
    expect(nombreRol('contador')).toBe('Contador/Reportes');
  });

  it('nombreRol devuelve "--" para roles ausentes y conserva los desconocidos', () => {
    expect(nombreRol(null)).toBe('--');
    expect(nombreRol(undefined)).toBe('--');
    expect(nombreRol('')).toBe('--');
    expect(nombreRol('auditor')).toBe('auditor');
  });

  it('truncateText recorta el texto largo y respeta el corto', () => {
    expect(truncateText('texto corto', 50)).toBe('texto corto');
    expect(truncateText('', 10)).toBe('');
    expect(truncateText(undefined as unknown as string, 10)).toBe('');
    expect(truncateText('abcdefghij', 5)).toBe('abcde...');
  });
});

describe('formatters - moneda', () => {
  it('formatMoney aplica el formato de moneda colombiano sin decimales', () => {
    const resultado = formatMoney(1500000);

    expect(resultado).toContain('1.500.000');
    expect(resultado).toContain('$');
    expect(resultado).not.toContain(',00');
  });

  it('formatMoney tolera valores nulos o no numericos', () => {
    // Nota: Intl inserta un espacio no separable entre el simbolo y el numero
    // cuando formatea (ej. "$ 0"), mientras que el valor de respaldo para
    // entradas no numericas es "$0" sin espacio. La comparacion normaliza el
    // espaciado para validar unicamente el valor monetario.
    const compacto = (valor: unknown) => formatMoney(valor).replace(/\s/g, '');

    expect(compacto(null)).toBe('$0');
    expect(compacto(undefined)).toBe('$0');
    expect(compacto('no-es-numero')).toBe('$0');
    expect(compacto('25000')).toContain('25.000');
  });

  it('formatShortMoney abrevia en K y M para las etiquetas de graficos', () => {
    expect(formatShortMoney(1_500_000)).toBe('$1,5 M');
    expect(formatShortMoney(2_000_000)).toBe('$2,0 M');
    expect(formatShortMoney(5000)).toBe('$5 K');
    expect(formatShortMoney(500)).toBe('$500');
  });

  it('formatShortMoney devuelve "$0" para valores no positivos', () => {
    expect(formatShortMoney(0)).toBe('$0');
    expect(formatShortMoney(-100)).toBe('$0');
    expect(formatShortMoney(NaN)).toBe('$0');
  });
});

describe('formatters - fechas', () => {
  it('formatDate presenta la fecha en formato local dd/mm/yyyy', () => {
    expect(formatDate(new Date(2026, 8, 20, 15, 30))).toBe('20/09/2026');
    expect(formatDate('2026-01-05T12:00:00')).toBe('05/01/2026');
  });

  it('formatDate devuelve "--" para valores ausentes o invalidos', () => {
    expect(formatDate(null)).toBe('--');
    expect(formatDate(undefined)).toBe('--');
    expect(formatDate('fecha-invalida')).toBe('--');
  });

  it('timeAgo describe intervalos recientes, minutos, horas y dias', () => {
    const ahora = Date.now();

    expect(timeAgo(null)).toBe('');
    expect(timeAgo(new Date(ahora))).toBe('Reciente');
    expect(timeAgo(new Date(ahora - 5 * 60 * 1000))).toBe('Hace 5 min');
    expect(timeAgo(new Date(ahora - 3 * 3600 * 1000))).toBe('Hace 3h');
    expect(timeAgo(new Date(ahora - 2 * 86400 * 1000))).toBe('Hace 2d');
  });

  it('timeAgo cae al formato de fecha despues de una semana', () => {
    const haceDiezDias = new Date(Date.now() - 10 * 86400 * 1000);
    expect(timeAgo(haceDiezDias)).toBe(formatDate(haceDiezDias));
  });
});

describe('formatters - reglas de calculo financiero', () => {
  it('calcularIVA aplica la tarifa del 19% redondeando a enteros', () => {
    expect(calcularIVA(100000)).toBe(19000);
    expect(calcularIVA(0)).toBe(0);
    expect(calcularIVA(53)).toBe(10);
    expect(calcularIVA(1)).toBe(0);
  });

  it('calculateVariation calcula el cambio porcentual redondeado', () => {
    expect(calculateVariation(150, 100)).toBe(50);
    expect(calculateVariation(50, 100)).toBe(-50);
    expect(calculateVariation(100, 100)).toBe(0);
  });

  it('calculateVariation evita la division por cero', () => {
    expect(calculateVariation(100, 0)).toBe(100);
    expect(calculateVariation(0, 0)).toBe(0);
  });
});
