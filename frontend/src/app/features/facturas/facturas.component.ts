/**
 * features/facturas/facturas.component.ts
 * Historial de facturas electronicas: busqueda, filtro por estado
 * DIAN, paginacion, exportacion CSV, descarga de documentos
 * (PDF/XML), cambio de estado y eliminacion de facturas pendientes.
 */

import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, mensajeError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Factura } from '../../core/models';
import { formatDate, formatMoney } from '../../core/formatters';
import { ROUTES } from '../../core/constants';

/** Cantidad de facturas por pagina */
const ITEMS_PER_PAGE = 5;

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

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  searchTerm = '';
  currentPage = 1;
  statusFilter = 'todos';
  filtros = ['todos', 'pendiente', 'enviada', 'rechazada'];

  facturas: Factura[] = [];
  loading = true;
  selected: Factura | null = null;
  detailLoading = false;

  // Formateadores expuestos a la plantilla
  money = formatMoney;
  date = formatDate;

  /** Facturas filtradas por estado y texto de busqueda. */
  get filteredFacturas(): Factura[] {
    let result = this.facturas;

    if (this.statusFilter !== 'todos') {
      result = result.filter((f) => f.estado === this.statusFilter);
    }

    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (f) =>
          (!!f.numero && f.numero.toLowerCase().includes(term)) ||
          (!!f.cliente?.nombre && f.cliente.nombre.toLowerCase().includes(term))
      );
    }

    return result;
  }

  get totalPages(): number {
    return Math.ceil(this.filteredFacturas.length / ITEMS_PER_PAGE);
  }

  get paginatedFacturas(): Factura[] {
    const start = (this.currentPage - 1) * ITEMS_PER_PAGE;
    return this.filteredFacturas.slice(start, start + ITEMS_PER_PAGE);
  }

  constructor() {
    this.api.get<{ success: boolean; facturas: Factura[] }>('/facturas?limite=500').subscribe({
      next: (res) => {
        this.facturas = res.facturas ?? [];
        this.loading = false;
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading = false;
      },
    });
  }

  cambiarFiltro(filtro: string): void {
    this.statusFilter = filtro;
    this.currentPage = 1;
  }

  onBuscar(valor: string): void {
    this.searchTerm = valor;
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    this.currentPage = Math.max(1, Math.min(page, this.totalPages));
  }

  label(estado: string): string {
    return estadoLabel(estado);
  }

  /** Abre el modal de detalle cargando la factura completa. */
  openDetail(factura: Factura): void {
    this.selected = factura;
    this.detailLoading = true;
    this.api
      .get<{ success: boolean; factura: Factura }>(`/facturas/${factura.id}`)
      .subscribe({
        next: (res) => {
          this.selected = res.factura;
          this.detailLoading = false;
        },
        error: (err) => {
          this.toast.mostrar(mensajeError(err), 'error');
          this.detailLoading = false;
        },
      });
  }

  closeDetail(): void {
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
          this.facturas = this.facturas.map((f) => (f.id === factura.id ? res.factura : f));
          if (this.selected?.id === factura.id) {
            this.selected = { ...this.selected, ...res.factura };
          }
          this.toast.mostrar(res.message || 'Estado actualizado', 'success');
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
        this.facturas = this.facturas.filter((f) => f.id !== factura.id);
        if (this.selected?.id === factura.id) this.selected = null;
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }

  /** Exporta todas las facturas filtradas como archivo CSV. */
  exportCSV(): void {
    if (this.filteredFacturas.length === 0) {
      this.toast.mostrar('No hay facturas para exportar', 'warning');
      return;
    }

    const headers = ['Numero Factura', 'Fecha', 'Cliente', 'NIT', 'Estado', 'CUNE', 'Total'];
    const rows = this.filteredFacturas.map((f) => [
      f.numero,
      formatDate(f.fecha),
      f.cliente?.nombre || '',
      f.cliente?.identificacion || '',
      f.estado,
      f.cufe || '',
      String(f.total),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte_facturas.csv';
    a.click();
    URL.revokeObjectURL(url);
    this.toast.mostrar('Reporte CSV exportado correctamente', 'success');
  }

  irAVentas(): void {
    this.router.navigate([ROUTES.VENTAS]);
  }
}
