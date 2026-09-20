/**
 * features/facturas/facturas.component.ts
 * Historial de facturas electronicas: busqueda, filtro por estado
 * DIAN, paginacion, exportacion CSV, descarga de documentos
 * (PDF/XML), cambio de estado y eliminacion de facturas pendientes.
 */

import { ChangeDetectorRef, Component, inject } from '@angular/core';
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

  /**
   * Necesario para marcar la vista tras las respuestas HTTP. En Angular 22
   * el ciclo de deteccion solo revisa las vistas marcadas como sucias y una
   * mutacion de propiedades planas dentro de un callback asincrono no marca
   * la vista, de modo que la tabla se quedaba en "Cargando facturas..." con
   * los datos ya presentes en memoria. Las senales no lo necesitan porque
   * marcan la vista por si mismas; markForCheck() ademas programa el ciclo.
   */
  private cdr = inject(ChangeDetectorRef);

  searchTerm = '';
  currentPage = 1;
  statusFilter = 'todos';
  filtros = ['todos', 'pendiente', 'enviada', 'rechazada'];

  facturas: Factura[] = [];
  loading = true;
  selected: Factura | null = null;
  detailLoading = false;

  /** Paginacion resuelta por el servidor */
  total = 0;
  totalPages = 1;

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
    this.loading = true;
    const params = new URLSearchParams({
      pagina: String(this.currentPage),
      limite: String(ITEMS_PER_PAGE),
    });
    const termino = this.searchTerm.trim();
    if (termino) params.set('q', termino);
    if (this.statusFilter !== 'todos') params.set('estado', this.statusFilter);

    this.api.get<RespuestaFacturas>(`/facturas?${params.toString()}`).subscribe({
      next: (res) => {
        this.facturas = res.facturas ?? [];
        this.total = Number(res.total) || 0;
        this.totalPages = Math.max(Number(res.totalPaginas) || 1, 1);
        if (this.currentPage > this.totalPages) {
          this.currentPage = this.totalPages;
          this.cargar();
          return;
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  cambiarFiltro(filtro: string): void {
    this.statusFilter = filtro;
    this.currentPage = 1;
    this.cargar();
  }

  onBuscar(valor: string): void {
    this.searchTerm = valor;
    this.currentPage = 1;
    this.cargar();
  }

  goToPage(page: number): void {
    const destino = Math.max(1, Math.min(page, this.totalPages));
    if (destino === this.currentPage) return;
    this.currentPage = destino;
    this.cargar();
  }

  label(estado: string): string {
    return estadoLabel(estado);
  }

  /** Abre el modal de detalle cargando la factura completa. */
  openDetail(factura: Factura): void {
    this.selected = factura;
    this.detailLoading = true;
    const solicitud = ++this.detalleSolicitado;

    this.api
      .get<{ success: boolean; factura: Factura }>(`/facturas/${factura.id}`)
      .subscribe({
        next: (res) => {
          if (solicitud !== this.detalleSolicitado) return; // respuesta obsoleta
          this.selected = res.factura;
          this.detailLoading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (solicitud !== this.detalleSolicitado) return;
          this.toast.mostrar(mensajeError(err), 'error');
          this.detailLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  closeDetail(): void {
    // Invalida cualquier respuesta de detalle en vuelo.
    this.detalleSolicitado += 1;
    this.selected = null;
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

  /** Elimina una factura no enviada (con confirmacion). */
  handleDelete(factura: Factura): void {
    if (!window.confirm(`Desea eliminar la factura ${factura.numero}?\nEsta accion no se puede deshacer.`)) {
      return;
    }
    this.api.delete<{ success: boolean; message: string }>(`/facturas/${factura.id}`).subscribe({
      next: (res) => {
        this.toast.mostrar(res.message || 'Factura eliminada', 'success');
        if (this.selected?.id === factura.id) this.selected = null;
        this.cargar();
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
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
    if (this.total === 0) {
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
        ? `CSV exportado con ${filas.length} facturas (el filtro abarca ${this.total}; se aplico el tope de ${MAX_FILAS_EXPORT}).`
        : `CSV exportado con ${filas.length} facturas.`,
      truncado ? 'warning' : 'success'
    );
  }

  irAVentas(): void {
    this.router.navigate([ROUTES.VENTAS]);
  }
}
