/**
 * features/dashboard/dashboard.component.ts
 * Panel principal de FacturaExpress: KPIs del dia, grafico SVG de
 * ventas semanales con tooltip y detalle por dia, ultimas
 * transacciones y productos mas vendidos.
 */

import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { KPIs } from '../../core/models';
import {
  calculateVariation,
  formatDate,
  formatMoney,
  formatShortMoney,
  timeAgo,
} from '../../core/formatters';

interface DiaSemana {
  key: string;
  day: string;
  fecha: string;
  value: number;
  facturas: number;
}

/** Tarjeta de indicador: `variacion` es null cuando no hay base de comparacion. */
interface TarjetaKpi {
  key: string;
  label: string;
  value: string | number;
  icon: string;
  variacion: number | null;
  baseComparacion?: string;
}

interface Transaccion {
  id: number;
  numero: string;
  fecha: string;
  cliente: string;
  total: number;
  estado: string;
}

interface ProductoTop {
  id: number;
  codigo: string;
  nombre: string;
  vendidos: number;
  ingresos: number;
}

/** Abreviacion del dia de la semana en espanol a partir de una fecha ISO. */
function shortDay(fechaStr: string): string {
  const fecha = new Date(`${fechaStr}T00:00:00`);
  if (isNaN(fecha.getTime())) return '--';
  return ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][fecha.getDay()];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {

  private api = inject(ApiService);

  /** Referencia al contenedor del grafico para posicionar el tooltip. */
  @ViewChild('chartRef') chartRef?: ElementRef<HTMLDivElement>;

  loading = signal(true);
  kpis = signal<KPIs | null>(null);
  ventasSemanales = signal<Array<{ dia: string; facturas: number; total: number }>>([]);
  transacciones = signal<Transaccion[]>([]);
  topProducts = signal<ProductoTop[]>([]);

  /** Lineas de referencia horizontales del grafico (constantes). */
  readonly lineasReferencia = [0, 1, 2, 3, 4];

  /**
   * Peticiones aun en curso. Antes cada respuesta apagaba el indicador de
   * carga, de modo que desaparecia con la primera en llegar y el panel
   * mostraba datos incompletos.
   */
  private peticionesPendientes = 0;

  /** Tooltip del grafico (posicion + datos del dia). */
  tooltip = signal<{ x: number; y: number; dia: DiaSemana } | null>(null);

  /** Dia seleccionado al hacer clic en una barra. */
  detailBar = signal<DiaSemana | null>(null);

  constructor() {
    this.peticionesPendientes = 4;

    this.api.get<{ success: boolean; kpis: KPIs }>('/reportes/kpis').subscribe({
      next: (res) => this.kpis.set(res.kpis ?? null),
      complete: () => this.finalizarPeticion(),
      error: () => this.finalizarPeticion(),
    });

    this.api
      .get<{ success: boolean; ventas: Array<{ dia: string; facturas: number; total: number }> }>(
        '/reportes/ventas-semanales'
      )
      .subscribe({
        next: (res) => this.ventasSemanales.set(res.ventas ?? []),
        complete: () => this.finalizarPeticion(),
        error: () => this.finalizarPeticion(),
      });

    this.api
      .get<{ success: boolean; transacciones: Transaccion[] }>(
        '/reportes/ultimas-transacciones?limite=4'
      )
      .subscribe({
        next: (res) => this.transacciones.set(res.transacciones ?? []),
        complete: () => this.finalizarPeticion(),
        error: () => this.finalizarPeticion(),
      });

    this.api
      .get<{ success: boolean; productos: ProductoTop[] }>('/reportes/productos-top?limite=4')
      .subscribe({
        next: (res) => this.topProducts.set(res.productos ?? []),
        complete: () => this.finalizarPeticion(),
        error: () => this.finalizarPeticion(),
      });
  }

  /** Marca una peticion como terminada y apaga la carga con la ultima. */
  private finalizarPeticion(): void {
    this.peticionesPendientes = Math.max(this.peticionesPendientes - 1, 0);
    if (this.peticionesPendientes === 0) this.loading.set(false);
  }

  /**
   * Datos del grafico. El servidor devuelve siempre los ultimos 7 dias
   * (con ceros incluidos) calculados con su propio reloj, por lo que la
   * serie se usa tal cual: antes el navegador reconstruia las etiquetas
   * con su fecha local y podian no coincidir con las del servidor.
   */
  get chartData(): DiaSemana[] {
    return this.ventasSemanales().map((v) => ({
      key: v.dia,
      day: shortDay(v.dia),
      fecha: v.dia,
      value: Number(v.total) || 0,
      facturas: Number(v.facturas) || 0,
    }));
  }

  /** Total de ventas de la semana. */
  get semanaTotal(): number {
    return this.chartData.reduce((sum, d) => sum + d.value, 0);
  }

  /** Dia con mayores ventas de la semana. */
  get mejorDia(): DiaSemana | undefined {
    return this.chartData.reduce<DiaSemana | undefined>(
      (best, d) => (!best || d.value > best.value ? d : best),
      undefined
    );
  }

  /** Valor maximo para escalar las barras. */
  get maxChartValue(): number {
    return Math.max(...this.chartData.map((d) => d.value), 0);
  }

  /**
   * Posiciona el tooltip segun el mouse sobre la barra,
   * manteniendolo dentro de los limites del contenedor.
   */
  handleBarHover(event: MouseEvent, d: DiaSemana): void {
    const rect = this.chartRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(event.clientX - rect.left, 95), rect.width - 95);
    const y = Math.max(event.clientY - rect.top, 80);
    this.tooltip.set({ x, y, dia: d });
  }

  cerrarTooltip(): void {
    this.tooltip.set(null);
  }

  abrirDetalle(d: DiaSemana): void {
    this.detailBar.set(d);
  }

  cerrarDetalle(): void {
    this.detailBar.set(null);
  }

  // Formateadores expuestos a la plantilla
  money = formatMoney;
  shortMoney = formatShortMoney;
  date = formatDate;
  ago = timeAgo;

  /** Referencia a Math para uso en la plantilla. */
  readonly Math = Math;

  /**
   * Tarjetas KPI calculadas a partir de los indicadores de la API. La
   * variacion se calcula contra el dia anterior y solo se muestra cuando
   * existe una base de comparacion real: antes todas las tarjetas
   * mostraban un "+0%" fijo que aparentaba una tendencia inexistente.
   */
  get kpiCards(): TarjetaKpi[] {
    const k = this.kpis();
    const ventasDia = Number(k?.ventasDia ?? 0);
    const ventasAyer = k?.ventasAyer;
    const variacionVentas =
      ventasAyer === undefined || Number(ventasAyer) <= 0
        ? null
        : calculateVariation(ventasDia, Number(ventasAyer));

    return [
      {
        key: 'ventas',
        label: 'Ventas del Dia',
        value: formatMoney(ventasDia),
        icon: 'attach_money',
        variacion: variacionVentas,
        baseComparacion: 'vs. ayer',
      },
      {
        key: 'facturas',
        label: 'Facturas Emitidas',
        value: k?.facturasEmitidasHoy ?? 0,
        icon: 'receipt_long',
        variacion: null,
      },
      {
        key: 'pendientes',
        label: 'Pendientes DIAN',
        value: k?.pendientesDIAN ?? 0,
        icon: 'pending_actions',
        variacion: null,
      },
      {
        key: 'ticket',
        label: 'Ticket Promedio',
        value: formatMoney(k?.ticketPromedio ?? 0),
        icon: 'speed',
        variacion: null,
      },
    ];
  }

  /** Altura en px de la barra para un dia (maximo 160px). */
  barHeight(d: DiaSemana): number {
    return this.maxChartValue > 0 ? (d.value / this.maxChartValue) * 160 : 0;
  }

  /** Coordenada X del centro de la barra i. */
  barCenter(i: number): number {
    const step = 520 / this.chartData.length;
    return 60 + i * step + step / 2;
  }

  /** Coordenada X inicial de la barra i (ancho fijo 42px). */
  barX(i: number): number {
    return this.barCenter(i) - 21;
  }
}
