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
  periodoLabel,
  csvCell,
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

describe('formatters - etiqueta de periodo del grafico', () => {
  it('abrevia el periodo mensual con el nombre del mes', () => {
    expect(periodoLabel('2026-01')).toBe('Ene');
    expect(periodoLabel('2026-08')).toBe('Ago');
    expect(periodoLabel('2026-12')).toBe('Dic');
  });

  it('abrevia el trimestre (regresion: antes devolvia "SNaN")', () => {
    // El backend emite "2026-Q3"; al separar por "-" solo hay dos segmentos,
    // de modo que la Q caia en la posicion del mes y la etiqueta era "SNaN".
    expect(periodoLabel('2026-Q1')).toBe('T1');
    expect(periodoLabel('2026-Q3')).toBe('T3');
    expect(periodoLabel('2026-Q4')).toBe('T4');
  });

  it('mantiene el anio y numera la semana', () => {
    expect(periodoLabel('2026')).toBe('2026');
    expect(periodoLabel('2026-35')).toBe('S35');
  });

  it('tolera valores vacios o inesperados', () => {
    expect(periodoLabel(null)).toBe('');
    expect(periodoLabel(undefined)).toBe('');
    expect(periodoLabel('otro')).toBe('otro');
  });
});

describe('formatters - IVA por tarifa', () => {
  it('aplica la tarifa indicada en lugar de asumir siempre el 19%', () => {
    expect(calcularIVA(100000, 0.19)).toBe(19000);
    expect(calcularIVA(100000, 0.05)).toBe(5000);
    expect(calcularIVA(100000, 0)).toBe(0);
  });

  it('usa la tarifa general cuando no se indica', () => {
    expect(calcularIVA(100000)).toBe(19000);
  });
});

describe('formatters - celdas CSV', () => {
  it('entrecomilla los valores con comas, comillas o saltos de linea', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell('linea1\nlinea2')).toBe('"linea1\nlinea2"');
  });

  it('neutraliza la inyeccion de formulas', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3+cmd')).toBe("'-2+3+cmd");
    expect(csvCell('+1+1')).toBe("'+1+1");
  });

  it('no altera numeros ni valores vacios', () => {
    expect(csvCell(-1500)).toBe('-1500');
    expect(csvCell('-1500')).toBe('-1500');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});
