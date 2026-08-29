/**
 * features/configuracion/configuracion.component.ts
 * Configuracion del sistema con 6 secciones: datos de empresa,
 * configuracion fiscal DIAN, perfiles de usuario, notificaciones,
 * seguridad y accesibilidad (toggles + tamano de texto).
 */

import { Component, inject, signal, ChangeDetectorRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, mensajeError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { Empresa } from '../../core/models';
import { EMPRESA_DEFAULT } from '../../core/constants';

interface ConfigFiscal {
  resolucionDIAN: string;
  fechaExpiracionCert: string;
  ultimaSync: string | null;
}

interface Notificaciones {
  email: boolean;
  push: boolean;
  dianAlerts: boolean;
  recordatorios: boolean;
}

interface Seguridad {
  ultimoCambioPass: string;
  dispositivosConectados: number;
  ultimaIP: string;
}

const CLAVE_CONFIG = 'fx_config';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './configuracion.component.html',
  styleUrls: ['./configuracion.component.css'],
})
export class ConfiguracionComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private router = inject(Router);
  readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  empresa: Empresa = { ...EMPRESA_DEFAULT };
  fiscal: ConfigFiscal = {
    resolucionDIAN: 'RES-2024-001234',
    fechaExpiracionCert: '2026-12-31',
    ultimaSync: new Date().toISOString(),
  };
notificaciones: Notificaciones = this.leerNotificaciones();
  seguridad: Seguridad = {
    ultimoCambioPass: '2026-01-15',
    dispositivosConectados: 3,
    ultimaIP: '192.168.1.105',
  };

  activeSection = signal('empresa');
  syncing = signal(false);

  readonly sections = [
    { key: 'empresa', label: 'Datos de la Empresa', icon: 'business' },
    { key: 'fiscal', label: 'Configuracion Fiscal (DIAN)', icon: 'verified' },
    { key: 'usuarios', label: 'Perfiles de Usuario', icon: 'admin_panel_settings' },
    { key: 'notificaciones', label: 'Notificaciones', icon: 'notifications' },
    { key: 'seguridad', label: 'Seguridad', icon: 'shield' },
    { key: 'accesibilidad', label: 'Accesibilidad', icon: 'accessibility_new' },
  ];

  readonly tamanosTexto = [
    { key: 'small', label: 'S' },
    { key: 'medium', label: 'M' },
    { key: 'large', label: 'L' },
  ] as const;

  constructor() {
    this.api
      .get<{ success: boolean; configuracion: { empresa: Empresa; fiscal: ConfigFiscal } }>(
        '/configuracion'
      )
      .subscribe({
        next: (res) => {
          this.empresa = res.configuracion.empresa;
          this.fiscal = res.configuracion.fiscal;
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
      });
  }

  setActive(key: string): void {
    this.activeSection.set(key);
  }

  /** Guarda los datos de la empresa via la API. */
  saveEmpresa(): void {
    this.api.put<{ success: boolean; message: string; empresa: Empresa }>('/configuracion/empresa', this.empresa).subscribe({
      next: (res) => {
        this.empresa = res.empresa;
        this.toast.mostrar('Datos de la empresa guardados', 'success');
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }

  /** Sincroniza la configuracion fiscal con la DIAN. */
  syncDIAN(): void {
    this.syncing.set(true);
    this.api
      .post<{ success: boolean; message: string; fiscal: { ultimaSync: string } }>('/configuracion/dian/sync', {})
      .subscribe({
        next: (res) => {
          this.fiscal = { ...this.fiscal, ultimaSync: res.fiscal.ultimaSync };
          this.toast.mostrar('Sincronizacion con DIAN completada', 'success');
        },
        error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
        complete: () => this.syncing.set(false),
      });
  }

guardarNotificaciones(): void {
    localStorage.setItem(
      CLAVE_CONFIG,
      JSON.stringify({ notificaciones: this.notificaciones })
    );
    this.toast.mostrar('Preferencias de notificacion guardadas', 'success');
  }

  /** Restaura las preferencias de notificacion persistidas en localStorage. */
  private leerNotificaciones(): Notificaciones {
    const def: Notificaciones = {
      email: true,
      push: true,
      dianAlerts: true,
      recordatorios: false,
    };
    try {
      const crudo = localStorage.getItem(CLAVE_CONFIG);
      if (!crudo) return def;
      const guardado = JSON.parse(crudo) as { notificaciones?: Partial<Notificaciones> };
      return { ...def, ...(guardado.notificaciones ?? {}) };
    } catch {
      return def;
    }
  }

  irA(ruta: string): void {
    this.router.navigate([ruta]);
  }
}
