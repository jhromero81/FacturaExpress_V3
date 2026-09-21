/**
 * features/login/login.component.ts
 * Pantalla de inicio de sesion de FacturaExpress. Presenta el
 * formulario de acceso con credenciales, botones de accesibilidad
 * (modo oscuro / alto contraste) y efectos visuales decorativos.
 */

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {

  /** Vista activa para el refresco manual tras respuestas HTTP. */
  readonly auth = inject(AuthService);
  private router = inject(Router);

  /** Campos del formulario (se actualizan con ngModel, nunca en asincrono). */
  nit = '';
  password = '';
  mostrarPassword = false;

  /**
   * Mensaje de error como senal: se fija desde el callback HTTP del login y
   * una propiedad plana no haria que Angular recompusiera la vista, de modo
   * que el fallo de acceso se quedaba sin mensaje visible.
   */
  readonly error = signal('');

  /** Envio de credenciales en curso. */
  readonly isLoading = signal(false);

  /** Envia las credenciales a la API y redirige al dashboard. */
  ingresar(): void {
    this.error.set('');

    if (!this.nit.trim() || !this.password.trim()) {
      this.error.set('Por favor complete todos los campos.');
      return;
    }

    this.isLoading.set(true);
    this.auth
      .login(this.nit.trim(), this.password)
      .subscribe({
        next: (res) => {
          this.auth.establecerSesion(res);
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.error.set(mensajeError(err) || 'Credenciales incorrectas.');
          this.isLoading.set(false);
        },
      });
  }
}
