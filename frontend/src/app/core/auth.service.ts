/**
 * core/auth.service.ts
 * Gestion de la sesion del usuario y preferencias de accesibilidad.
 * La API entrega el token JWT en una cookie httpOnly (no accesible
 * desde JS), lo que reduce la exposicion a XSS; en sessionStorage solo
 * se conserva el perfil para restaurar la sesion al recargar. Las
 * preferencias visuales (modo oscuro, alto contraste, tamano de texto)
 * se persisten en localStorage.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { LoginResponse, Usuario } from './models';

const CLAVE_USUARIO = 'fx_usuario';
const CLAVE_LOGIN = 'fx_login_time';
const CLAVE_PREFS = 'fx_prefs';

export interface Preferencias {
  modoOscuro: boolean;
  altoContraste: boolean;
  tamanoTexto: 'small' | 'medium' | 'large';
}

const PREFS_DEFECTO: Preferencias = {
  modoOscuro: false,
  altoContraste: false,
  tamanoTexto: 'medium',
};

const TAMANOS_FUENTE: Record<Preferencias['tamanoTexto'], string> = {
  small: '12px',
  medium: '15px',
  large: '18px',
};

/**
 * Modo oscuro y alto contraste son excluyentes: cada uno define la paleta
 * completa, y aplicarlos a la vez mezcla tokens de los dos (texto claro del
 * modo oscuro sobre el fondo blanco del alto contraste, bordes negros sobre
 * fondo negro...). Si por un estado guardado antiguo llegan los dos activos,
 * se conserva el alto contraste, que es el modo de accesibilidad.
 * Devuelve el mismo objeto si no hay nada que corregir.
 */
function normalizarPreferencias(prefs: Preferencias): Preferencias {
  return prefs.modoOscuro && prefs.altoContraste ? { ...prefs, modoOscuro: false } : prefs;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  /** Perfil del usuario autenticado (null si no hay sesion). */
  readonly usuario = signal<Usuario | null>(this.leerUsuarioGuardado());

  /** true si existe una sesion activa. */
  readonly estaAutenticado = computed(() => this.usuario() !== null);

  /** true si el rol del usuario es administrador. */
  readonly esAdmin = computed(() => this.usuario()?.rol === 'admin');

  /** Momento ISO en que se inicio la sesion actual. */
  readonly loginTime = signal<string | null>(sessionStorage.getItem(CLAVE_LOGIN));

  /** Preferencias de accesibilidad del usuario. */
  readonly preferencias = signal<Preferencias>(this.leerPreferencias());

  constructor() {
    // Aplica las clases de tema al body y el tamano de fuente raiz
    effect(() => {
      const prefs = this.preferencias();
      document.body.classList.toggle('fx-dark-mode', prefs.modoOscuro);
      document.body.classList.toggle('fx-high-contrast', prefs.altoContraste);
      document.documentElement.style.fontSize =
        TAMANOS_FUENTE[prefs.tamanoTexto] || TAMANOS_FUENTE.medium;
    });

    // Al arrancar la aplicacion valida la sesion contra el servidor
    this.restaurarSesion();
  }

  /**
   * Inicia sesion. El backend responde con el token y el perfil,
   * y fija la cookie httpOnly de sesion.
   */
  login(nit: string, password: string) {
    return this.api.post<LoginResponse>('/auth/login', { nit, password });
  }

  /** Guarda la sesion tras un login exitoso. El token queda solo en
   *  la cookie httpOnly; aqui se conserva el perfil para restaurarlo
   *  al recargar la pagina. */
  establecerSesion(respuesta: LoginResponse) {
    const ahora = new Date().toISOString();
    sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(respuesta.usuario));
    sessionStorage.setItem(CLAVE_LOGIN, ahora);
    this.loginTime.set(ahora);
    this.usuario.set(respuesta.usuario);
  }

  /** Cierra la sesion en el servidor y limpia el estado local. */
  logout() {
    this.api.post('/auth/logout', {}).subscribe({
      next: () => this.limpiarSesion(),
      error: () => this.limpiarSesion(),
    });
  }

  /** Limpia el estado local y redirige al login. */
  limpiarSesion() {
    sessionStorage.removeItem(CLAVE_USUARIO);
    sessionStorage.removeItem(CLAVE_LOGIN);
    this.loginTime.set(null);
    this.usuario.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Alterna el modo oscuro y persiste la preferencia.
   * Encenderlo apaga el alto contraste: los dos modos definen la paleta
   * completa y combinados mezclan tokens de ambos (texto claro del oscuro
   * sobre el fondo blanco del alto contraste, bordes negros sobre negro).
   */
  alternarModoOscuro(): void {
    const activar = !this.preferencias().modoOscuro;
    this.actualizarPreferencias(
      activar
        ? { modoOscuro: true, altoContraste: false }
        : { modoOscuro: false }
    );
  }

  /** Alterna el alto contraste y persiste la preferencia. Encenderlo apaga el modo oscuro. */
  alternarAltoContraste(): void {
    const activar = !this.preferencias().altoContraste;
    this.actualizarPreferencias(
      activar
        ? { altoContraste: true, modoOscuro: false }
        : { altoContraste: false }
    );
  }

  /** Establece el tamano del texto (small | medium | large). */
  establecerTamanoTexto(tamano: Preferencias['tamanoTexto']): void {
    this.actualizarPreferencias({ tamanoTexto: tamano });
  }

  private actualizarPreferencias(cambios: Partial<Preferencias>): void {
    // Red de seguridad: ningun camino puede dejar los dos modos activos.
    // Si el cambio enciende un modo, el otro se apaga.
    const nuevas = normalizarPreferencias({ ...this.preferencias(), ...cambios });
    if (cambios.modoOscuro === true) nuevas.altoContraste = false;
    if (cambios.altoContraste === true) nuevas.modoOscuro = false;
    localStorage.setItem(CLAVE_PREFS, JSON.stringify(nuevas));
    this.preferencias.set(nuevas);
  }

  private leerPreferencias(): Preferencias {
    try {
      const crudo = localStorage.getItem(CLAVE_PREFS);
      if (!crudo) return PREFS_DEFECTO;
      const guardadas = { ...PREFS_DEFECTO, ...(JSON.parse(crudo) as Partial<Preferencias>) };
      const normalizadas = normalizarPreferencias(guardadas);
      // Una version anterior permitia tener los dos modos activos a la vez
      if (normalizadas !== guardadas) {
        localStorage.setItem(CLAVE_PREFS, JSON.stringify(normalizadas));
      }
      return normalizadas;
    } catch {
      return PREFS_DEFECTO;
    }
  }

  /** Consulta /auth/me para validar si la cookie sigue vigente. */
  private restaurarSesion() {
    if (!this.usuario()) return;
    this.api.get<{ success: boolean; usuario: Usuario }>('/auth/me').subscribe({
      next: (res) => this.usuario.set(res.usuario),
      error: (error: unknown) => {
        // Solo se cierra la sesion cuando el servidor la rechaza (401/403).
        // Un fallo de red o un error 5xx no debe expulsar al usuario, que
        // antes perdia la sesion por un corte momentaneo de conexion.
        if (
          error instanceof HttpErrorResponse &&
          (error.status === 401 || error.status === 403)
        ) {
          this.limpiarSesion();
        }
      },
    });
  }

  private leerUsuarioGuardado(): Usuario | null {
    try {
      const crudo = sessionStorage.getItem(CLAVE_USUARIO);
      return crudo ? (JSON.parse(crudo) as Usuario) : null;
    } catch {
      return null;
    }
  }
}
