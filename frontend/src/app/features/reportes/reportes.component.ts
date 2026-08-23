/**
 * features/reportes/reportes.component.ts
 * Reportes y estadisticas: KPIs, grafico comparativo de ventas por
 * periodo con tooltip y detalle, productos mas vendidos, meta de
 * ventas mensual, exportacion PDF e historial de reportes.
 */

import { Component, ElementRef, inject, signal, ViewChild, ChangeDetectorRef } from '@angular/core';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { KPIs } from '../../core/models';
import { formatDate, formatMoney, formatShortMoney } from '../../core/formatters';
import { META_VENTAS_MENSUAL } from '../../core/constants';

/** Periodos disponibles para el reporte */
const PERIODOS = [
  { key: 'semanal', label: 'Semanal' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'trimestral', label: 'Trimestral' },
  { key: 'anual', label: 'Anual' },
];

interface VentaPeriodo {
  periodo: string;
  total: number;
  facturas: number;
  anterior: number;
  anteriorFacturas: number;
}

interface DatoGrafico {
  key: string;
  mes: string;
  actual: number;
  facturas: number;
  anterior: number;
  anteriorFacturas: number;
}

interface ProductoTop {
  id: number;
  nombre: string;
  vendidos: number;
}

interface ReporteHistorial {
  id: number;
  tipo: string;
  periodo: string;
  archivo: string;
  tamano: number;
  createdAt: string;
}

/**
 * Convierte una etiqueta de periodo ("2026-08", "2026-Q3", "2026")
 * en abreviatura legible para el grafico (Ene-Dic / T1-T4 / anio).
 */
function periodoLabel(periodo: unknown): string {
  const value = String(periodo ?? '');
  const [year, month, q] = value.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  if (q && q.startsWith('Q')) return `T${q.slice(1)}`;
  const num = Number(month);
  if (month && !isNaN(num) && num >= 1 && num <= 12) {
    return meses[num - 1] || value;
  }
  if (month) return `S${num}`;
  return year || value;
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.css'],
})
export class ReportesComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  /** Referencia al contenedor del grafico para el tooltip. */
  @ViewChild('chartRef') chartRef?: ElementRef<HTMLDivElement>;

  readonly periodos = PERIODOS;
  readonly metaVentas = META_VENTAS_MENSUAL;

  periodo = 'mensual';
  kpis = signal<KPIs | null>(null);
  ventasPeriodo = signal<VentaPeriodo[]>([]);
  topProducts = signal<ProductoTop[]>([]);
  historial = signal<ReporteHistorial[]>([]);
  loading = signal(true);
  showHistorial = signal(false);
  exporting = signal(false);

  tooltip = signal<{ x: number; y: number; dato: DatoGrafico } | null>(null);
  detailBar = signal<DatoGrafico | null>(null);

  // Formateadores expuestos a la plantilla
  money = formatMoney;
  shortMoney = formatShortMoney;
  date = formatDate;
  readonly Math = Math;

  constructor() {
    this.api.get<{ success: boolean; kpis: KPIs }>('/reportes/kpis').subscribe({
      next: (res) => this.kpis.set(res.kpis ?? null),
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });

    this.api
      .get<{ success: boolean; productos: ProductoTop[] }>('/reportes/productos-top?limite=5')
      .subscribe({
        next: (res) => this.topProducts.set(res.productos ?? []),
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      });

    this.api.get<{ success: boolean; reportes: ReporteHistorial[] }>('/reportes/historial').subscribe({
      next: (res) => {
        this.historial.set(res.reportes ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading.set(false);
      },
    });

    this.cargarVentasPeriodo();
  }

  /** Carga las ventas del periodo seleccionado. */
  cargarVentasPeriodo(): void {
    this.loading.set(true);
    this.api
      .get<{ success: boolean; ventas: VentaPeriodo[] }>(
        `/reportes/ventas-periodo?periodo=${this.periodo}`
      )
      .subscribe({
        next: (res) => {
          this.ventasPeriodo.set(res.ventas ?? []);
          this.loading.set(false);
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.loading.set(false);
        },
      });
  }

  setPeriodo(key: string): void {
    this.periodo = key;
    this.cargarVentasPeriodo();
  }

  /** Datos para el grafico comparativo. */
  get chartData(): DatoGrafico[] {
    return this.ventasPeriodo().map((v) => ({
      key: v.periodo,
      mes: periodoLabel(v.periodo),
      actual: Number(v.total) || 0,
      facturas: Number(v.facturas) || 0,
      anterior: Number(v.anterior) || 0,
      anteriorFacturas: Number(v.anteriorFacturas) || 0,
    }));
  }

  /** Valor maximo del grafico. */
  get maxChartValue(): number {
    return Math.max(...this.chartData.flatMap((d) => [d.actual, d.anterior]), 0);
  }

  /** Porcentaje de avance hacia la meta mensual. */
  get goalProgress(): number {
    return Math.min(Math.round(((this.kpis()?.ventasMes || 0) / META_VENTAS_MENSUAL) * 100), 100);
  }

  /** Monto que falta para alcanzar la meta. */
  get metaRestante(): number {
    return Math.max(META_VENTAS_MENSUAL - (this.kpis()?.ventasMes || 0), 0);
  }

  /** Posiciona el tooltip sobre una barra agrupada. */
  handleBarHover(event: MouseEvent, d: DatoGrafico): void {
    const rect = this.chartRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(event.clientX - rect.left, 100), rect.width - 100);
    this.tooltip.set({ x, y: event.clientY - rect.top, dato: d });
  }

  cerrarTooltip(): void {
    this.tooltip.set(null);
  }

  abrirDetalle(d: DatoGrafico): void {
    this.detailBar.set(d);
  }

  cerrarDetalle(): void {
    this.detailBar.set(null);
  }

  /** Descarga el PDF generado por el backend y refresca el historial. */
  exportReport(): void {
    this.exporting.set(true);
    this.api
      .descargar(`/reportes/pdf?periodo=${this.periodo}`)
      .then(() => this.toast.mostrar('Reporte PDF generado correctamente', 'success'))
      .then(() =>
        this.api
          .get<{ success: boolean; reportes: ReporteHistorial[] }>('/reportes/historial')
          .subscribe((res) => this.historial.set(res.reportes ?? []))
      )
      .catch((err) => this.toast.mostrar(mensajeError(err), 'error'))
      .finally(() => this.exporting.set(false));
  }
}
