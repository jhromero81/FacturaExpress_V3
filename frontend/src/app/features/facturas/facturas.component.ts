/**
 * features/facturas/facturas.component.ts
 * Historial de facturas electronicas: busqueda, filtro por estado
 * DIAN, paginacion, exportacion CSV, descarga de documentos
 * (PDF/XML), cambio de estado y anulacion con nota credito.
 */

import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Factura } from '../../core/models';
import { formatDate, formatMoney, csvCell } from '../../core/formatters';
import { ROUTES } from '../../core/constants';

/** Cantidad de facturas por pagina */
const ITEMS_PER_PAGE = 10;

/** Limite maximo que admite la API por peticion */
const LIMITE_MAXIMO_API = 200;

/** Tope de filas que se exportan a CSV (evita barridos sin control) */
const MAX_FILAS_EXPORT = 2000;

interface RespuestaFacturas {
  success: boolean;
  facturas: Factura[];
  total: number;
  totalPaginas: number;
}

/** Etiqueta legible de un estado */
function estadoLabel(estado: string): string {
  return estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : '';
}

/** Etiqueta legible del medio de pago */
const MEDIO_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'Credito',
};

/** Nota credito que anula una factura */
interface NotaCredito {
  id: number;
  numero: string;
  fecha: string;
  motivo: string;
  subtotal: number;
  iva: number;
  total: number;
  usuario?: string;
}

@Component({
  selector: 'app-facturas',
  standalone: true,
  imports: [],
  templateUrl: './facturas.component.html',
  styleUrls: ['./facturas.component.css'],
})
export class FacturasComponent {

  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** Texto de busqueda (lo actualiza la plantilla, nunca un callback HTTP) */
  searchTerm = '';

  /** Filtro de estado DIAN activo (lo actualiza la plantilla) */
  statusFilter = 'todos';
  filtros = ['todos', 'pendiente', 'enviada', 'rechazada', 'anulada'];

  /**
   * Estado de la vista como senales. Angular marca la vista por si mismo
   * cuando una senal cambia, incluso dentro de un callback HTTP; con
   * propiedades planas el ciclo de deteccion de Angular 22 no recompone la
   * vista y la tabla se quedaba en "Cargando facturas..." con los datos ya
   * presentes en memoria.
   */
  readonly facturas = signal<Factura[]>([]);
  readonly loading = signal(true);
  readonly selected = signal<Factura | null>(null);
  readonly detailLoading = signal(false);

  /** Factura que se va a anular y motivo escrito por el usuario */
  readonly facturaAAnular = signal<Factura | null>(null);
  readonly motivoAnulacion = signal('');
  readonly anulando = signal(false);

  /** Notas credito de la factura abierta en el detalle */
  readonly notas = signal<NotaCredito[]>([]);

  /** Paginacion resuelta por el servidor */
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly currentPage = signal(1);

  /**
   * Identificador de la ultima peticion de detalle. Si el usuario abre dos
   * facturas seguidas, solo se aplica la respuesta de la ultima: antes la
   * respuesta mas lenta sobrescribia el modal con datos de otra factura.
   */
  private detalleSolicitado = 0;

  // Formateadores expuestos a la plantilla
  money = formatMoney;
  date = formatDate;

  constructor() {
    this.cargar();
  }

  /**
   * Carga la pagina actual desde el servidor aplicando la busqueda y el
   * filtro de estado. Antes se pedia un unico lote de 500 (recortado a 200
   * por la API) y se paginaba en el navegador: las facturas mas antiguas
   * no existian para la interfaz.
   */
  cargar(): void {
    this.loading.set(true);
    const params = new URLSearchParams({
      pagina: String(this.currentPage()),
      limite: String(ITEMS_PER_PAGE),
    });
    const termino = this.searchTerm.trim();
    if (termino) params.set('q', termino);
    if (this.statusFilter !== 'todos') params.set('estado', this.statusFilter);

    this.api.get<RespuestaFacturas>(`/facturas?${params.toString()}`).subscribe({
      next: (res) => {
        this.facturas.set(res.facturas ?? []);
        this.total.set(Number(res.total) || 0);
        this.totalPages.set(Math.max(Number(res.totalPaginas) || 1, 1));
        if (this.currentPage() > this.totalPages()) {
          this.currentPage.set(this.totalPages());
          this.cargar();
          return;
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading.set(false);
      },
    });
  }

  cambiarFiltro(filtro: string): void {
    this.statusFilter = filtro;
    this.currentPage.set(1);
    this.cargar();
  }

  onBuscar(valor: string): void {
    this.searchTerm = valor;
    this.currentPage.set(1);
    this.cargar();
  }

  goToPage(page: number): void {
    const destino = Math.max(1, Math.min(page, this.totalPages()));
    if (destino === this.currentPage()) return;
    this.currentPage.set(destino);
    this.cargar();
  }

  label(estado: string): string {
    return estadoLabel(estado);
  }

  /** Etiqueta legible del medio de pago de una factura */
  medioPagoLabel(medio?: string): string {
    return MEDIO_PAGO_LABEL[medio || 'efectivo'] || 'Efectivo';
  }

  /** Abre el modal de detalle cargando la factura completa. */
  openDetail(factura: Factura): void {
    this.selected.set(factura);
    this.notas.set([]);
    this.detailLoading.set(true);
    const solicitud = ++this.detalleSolicitado;

    this.api
      .get<{ success: boolean; factura: Factura }>(`/facturas/${factura.id}`)
      .subscribe({
        next: (res) => {
          if (solicitud !== this.detalleSolicitado) return; // respuesta obsoleta
          this.selected.set(res.factura);
          this.detailLoading.set(false);

          // Si esta anulada, se muestra la nota credito que la anulo
          if (res.factura.estado === 'anulada') {
            this.api
              .get<{ success: boolean; notas: NotaCredito[] }>(`/facturas/${factura.id}/notas-credito`)
              .subscribe({
                next: (resNotas) => {
                  if (solicitud !== this.detalleSolicitado) return;
                  this.notas.set(resNotas.notas ?? []);
                },
                error: () => this.notas.set([]),
              });
          }
        },
        error: (err) => {
          if (solicitud !== this.detalleSolicitado) return;
          this.toast.mostrar(mensajeError(err), 'error');
          this.detailLoading.set(false);
        },
      });
  }

  closeDetail(): void {
    // Invalida cualquier respuesta de detalle en vuelo.
    this.detalleSolicitado += 1;
    this.selected.set(null);
  }

  /** Descarga el PDF generado por el backend. */
  downloadPDF(factura: Factura): void {
    this.api
      .descargar(`/facturas/${factura.id}/pdf`)
      .then(() => this.toast.mostrar(`PDF descargado: ${factura.numero}`, 'success'))
      .catch((err) => this.toast.mostrar(mensajeError(err), 'error'));
  }

  /** Descarga el XML con formato DIAN. */
  downloadXML(factura: Factura): void {
    this.api
      .descargar(`/facturas/${factura.id}/xml`)
      .then(() => this.toast.mostrar(`XML descargado: ${factura.numero}`, 'success'))
      .catch((err) => this.toast.mostrar(mensajeError(err), 'error'));
  }

  /** Actualiza el estado DIAN de una factura (pendiente <-> enviada). */
  changeEstado(factura: Factura, estado: 'pendiente' | 'enviada'): void {
    this.api
      .put<{ success: boolean; message: string; factura: Factura }>(`/facturas/${factura.id}/estado`, { estado })
      .subscribe({
        next: (res) => {
          this.toast.mostrar(res.message || 'Estado actualizado', 'success');
          // Se recarga la pagina: el cambio de estado puede sacar la factura
          // del filtro activo.
          this.cargar();
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      });
  }

  /** Abre el modal de anulacion con el motivo vacio. */
  abrirAnular(factura: Factura): void {
    this.motivoAnulacion.set('');
    this.facturaAAnular.set(factura);
  }

  /** Cierra el modal de anulacion sin tocar la factura. */
  cerrarAnular(): void {
    this.facturaAAnular.set(null);
    this.motivoAnulacion.set('');
  }

  /**
   * Anula una factura emitiendo una nota credito.
   *
   * No se borra nada: el servidor marca la factura como anulada, guarda el
   * motivo en la nota y devuelve el stock al inventario. Borrar la factura
   * hacia retroceder el consecutivo y chocaba con el numero unico.
   */
  confirmarAnulacion(): void {
    const factura = this.facturaAAnular();
    if (!factura) return;

    const motivo = this.motivoAnulacion().trim();
    if (motivo.length < 5) {
      this.toast.mostrar('Indique el motivo de la anulacion (minimo 5 caracteres).', 'error');
      return;
    }

    this.anulando.set(true);
    this.api
      .post<{ success: boolean; message: string; factura: Factura }>(
        `/facturas/${factura.id}/nota-credito`,
        { motivo }
      )
      .subscribe({
        next: (res) => {
          this.anulando.set(false);
          this.toast.mostrar(res.message || 'Factura anulada', 'success');
          this.cerrarAnular();
          this.closeDetail();
          this.cargar();
        },
        error: (err) => {
          this.anulando.set(false);
          this.toast.mostrar(mensajeError(err), 'error');
        },
      });
  }

  /**
   * Exporta a CSV el resultado completo del filtro vigente.
   *
   * Recorre las paginas de la API hasta completar el total informado por
   * el servidor (con un tope de seguridad), de modo que el archivo no
   * dependa de las filas que estuvieran cargadas en pantalla: antes la
   * exportacion se limitaba al lote visible y lo presentaba como si fuera
   * el historial completo.
   */
  async exportCSV(): Promise<void> {
    if (this.total() === 0) {
      this.toast.mostrar('No hay facturas para exportar', 'warning');
      return;
    }

    let filas: Factura[];
    let truncado = false;

    try {
      filas = [];
      let pagina = 1;
      let totalServidor = Infinity;

      while (filas.length < Math.min(totalServidor, MAX_FILAS_EXPORT)) {
        const params = new URLSearchParams({
          pagina: String(pagina),
          limite: String(LIMITE_MAXIMO_API),
        });
        const termino = this.searchTerm.trim();
        if (termino) params.set('q', termino);
        if (this.statusFilter !== 'todos') params.set('estado', this.statusFilter);

        const res = await firstValueFrom(this.api.get<RespuestaFacturas>(`/facturas?${params.toString()}`));
        totalServidor = Number(res.total) || 0;
        const lote = res.facturas ?? [];
        if (lote.length === 0) break;
        filas.push(...lote);
        pagina += 1;
      }

      truncado = filas.length < totalServidor;
      if (filas.length > MAX_FILAS_EXPORT) {
        filas = filas.slice(0, MAX_FILAS_EXPORT);
      }
    } catch (err) {
      this.toast.mostrar(mensajeError(err), 'error');
      return;
    }

    if (filas.length === 0) {
      this.toast.mostrar('No hay facturas para exportar', 'warning');
      return;
    }

    const headers = ['Numero Factura', 'Fecha', 'Cliente', 'NIT', 'Estado', 'CUFE', 'Total'];
    const rows = filas.map((f) => [
      f.numero,
      formatDate(f.fecha),
      f.cliente?.nombre || '',
      f.cliente?.identificacion || '',
      f.estado,
      f.cufe || '',
      String(f.total),
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte_facturas.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    this.toast.mostrar(
      truncado
        ? `CSV exportado con ${filas.length} facturas (el filtro abarca ${this.total()}; se aplico el tope de ${MAX_FILAS_EXPORT}).`
        : `CSV exportado con ${filas.length} facturas.`,
      truncado ? 'warning' : 'success'
    );
  }

  irAVentas(): void {
    this.router.navigate([ROUTES.VENTAS]);
  }
}
