/**
 * features/dashboard/dashboard.component.ts
 * Panel principal de FacturaExpress: KPIs del dia, grafico SVG de
 * ventas semanales con tooltip y detalle por dia, ultimas
 * transacciones y productos mas vendidos.
 */

import { Component, ElementRef, inject, signal, ViewChild, ChangeDetectorRef } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { KPIs } from '../../core/models';
import {
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

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);

  /** Referencia al contenedor del grafico para posicionar el tooltip. */
  @ViewChild('chartRef') chartRef?: ElementRef<HTMLDivElement>;

  loading = signal(true);
  kpis = signal<KPIs | null>(null);
  ventasSemanales = signal<Array<{ dia: string; facturas: number; total: number }>>([]);
  transacciones = signal<Transaccion[]>([]);
  topProducts = signal<ProductoTop[]>([]);

  /** Tooltip del grafico (posicion + datos del dia). */
  tooltip = signal<{ x: number; y: number; dia: DiaSemana } | null>(null);

  /** Dia seleccionado al hacer clic en una barra. */
  detailBar = signal<DiaSemana | null>(null);

  constructor() {
    this.api.get<{ success: boolean; kpis: KPIs }>('/reportes/kpis').subscribe({
      next: (res) => this.kpis.set(res.kpis ?? null),
    });

    this.api
      .get<{ success: boolean; ventas: Array<{ dia: string; facturas: number; total: number }> }>(
        '/reportes/ventas-semanales'
      )
      .subscribe((res) => this.ventasSemanales.set(res.ventas ?? []));

    this.api
      .get<{ success: boolean; transacciones: Transaccion[] }>(
        '/reportes/ultimas-transacciones?limite=4'
      )
      .subscribe((res) => this.transacciones.set(res.transacciones ?? []));

    this.api
      .get<{ success: boolean; productos: ProductoTop[] }>('/reportes/productos-top?limite=4')
      .subscribe((res) => {
        this.topProducts.set(res.productos ?? []);
        this.loading.set(false);
      });
  }

  /** Datos del grafico: siempre los ultimos 7 dias en orden. */
  get chartData(): DiaSemana[] {
    const byDate = new Map(this.ventasSemanales().map((v) => [v.dia, v]));
    const dias: DiaSemana[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
      const row = byDate.get(iso);
      dias.push({
        key: iso,
        day: shortDay(iso),
        fecha: iso,
        value: Number(row?.total) || 0,
        facturas: Number(row?.facturas) || 0,
      });
    }
    return dias;
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

  /** Tarjetas KPI calculadas a partir de los indicadores de la API. */
  get kpiCards() {
    const k = this.kpis();
    return [
      {
        key: 'ventas',
        label: 'Ventas del Dia',
        value: formatMoney(k?.ventasDia ?? 0),
        icon: 'attach_money',
        variacion: 0,
      },
      {
        key: 'facturas',
        label: 'Facturas Emitidas',
        value: k?.facturasEmitidasHoy ?? 0,
        icon: 'receipt_long',
        variacion: 0,
      },
      {
        key: 'pendientes',
        label: 'Pendientes DIAN',
        value: k?.pendientesDIAN ?? 0,
        icon: 'pending_actions',
        variacion: 0,
      },
      {
        key: 'ticket',
        label: 'Ticket Promedio',
        value: formatMoney(k?.ticketPromedio ?? 0),
        icon: 'speed',
        variacion: 0,
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
