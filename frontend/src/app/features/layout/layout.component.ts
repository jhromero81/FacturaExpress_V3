/**
 * features/layout/layout.component.ts
 * Layout principal para paginas autenticadas: barra lateral fija con
 * navegacion dividida en secciones Principal y Administracion, barra
 * superior con estado DIAN y controles de accesibilidad, pie de pagina
 * global y modal de confirmacion de cierre de sesion.
 */

import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { nombreRol } from '../../core/formatters';

interface ItemMenu {
  ruta: string;
  icono: string;
  etiqueta: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css'],
})
export class LayoutComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  readonly toasts = inject(ToastService);

  /** Control de visibilidad del modal de cierre de sesion. */
  readonly mostrarModalSalida = signal(false);

  /** Estado de "cerrando sesion" para la animacion del modal. */
  readonly cerrandoSesion = signal(false);

  /** Temporizador del cierre de sesion diferido, para poder cancelarlo. */
  private temporizadorSalida: ReturnType<typeof setTimeout> | null = null;

  /**
   * Cancela cualquier temporizador pendiente al destruir la vista: antes
   * seguia vivo y navegaba despues de salir del layout.
   */
  ngOnDestroy(): void {
    if (this.temporizadorSalida !== null) {
      clearTimeout(this.temporizadorSalida);
      this.temporizadorSalida = null;
    }
  }

  /** Programa el temporizador de cierre de sesion cancelando el anterior. */
  programarCierreSesion(accion: () => void, retardoMs: number): void {
    if (this.temporizadorSalida !== null) clearTimeout(this.temporizadorSalida);
    this.temporizadorSalida = setTimeout(() => {
      this.temporizadorSalida = null;
      accion();
    }, retardoMs);
  }

  private readonly menuPrincipal: ItemMenu[] = [
    { ruta: '/dashboard', icono: 'dashboard', etiqueta: 'Panel Principal' },
    { ruta: '/ventas', icono: 'shopping_cart', etiqueta: 'Gestion de Ventas' },
    { ruta: '/facturas', icono: 'description', etiqueta: 'Facturacion Electronica' },
    { ruta: '/clientes', icono: 'group', etiqueta: 'Clientes' },
    { ruta: '/productos', icono: 'inventory_2', etiqueta: 'Inventario' },
    { ruta: '/reportes', icono: 'bar_chart', etiqueta: 'Reportes y Estadisticas' },
  ];

  private readonly menuAdministracion: ItemMenu[] = [
    { ruta: '/errores', icono: 'error_outline', etiqueta: 'Errores del Sistema' },
    { ruta: '/auditoria', icono: 'fact_check', etiqueta: 'Auditoria' },
    { ruta: '/usuarios', icono: 'admin_panel_settings', etiqueta: 'Usuarios' },
    { ruta: '/backup', icono: 'backup', etiqueta: 'Respaldos' },
    { ruta: '/configuracion', icono: 'settings', etiqueta: 'Configuracion' },
  ];

  /** Items visibles segun el rol del usuario autenticado. */
  readonly itemsPrincipales = computed(() => this.menuPrincipal);

  readonly itemsAdministracion = computed(() =>
    this.auth.esAdmin() ? this.menuAdministracion : []
  );

  /** Rol legible del usuario actual. */
  get rolUsuario(): string {
    return nombreRol(this.auth.usuario()?.rol);
  }

  /** Anio en curso para el pie de pagina. */
  get anioActual(): number {
    return new Date().getFullYear();
  }

  /** Duracion legible de la sesion actual (ej: "2h 15min"). */
  get duracionSesion(): string {
    const login = this.auth.loginTime();
    if (!login) return 'Desconocido';
    const diff = Date.now() - new Date(login).getTime();
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(minutos / 60);
    if (horas > 0) return `${horas}h ${minutos % 60}min`;
    return `${minutos} min`;
  }

  abrirModalSalida(): void {
    this.mostrarModalSalida.set(true);
  }

  cerrarModalSalida(): void {
    if (!this.cerrandoSesion()) {
      this.mostrarModalSalida.set(false);
    }
  }

  /** Ejecuta el cierre de sesion tras una pequena animacion de carga. */
  confirmarSalida(): void {
    this.cerrandoSesion.set(true);
    this.programarCierreSesion(() => {
      this.mostrarModalSalida.set(false);
      this.cerrandoSesion.set(false);
      this.auth.logout();
    }, 800);
  }
}
