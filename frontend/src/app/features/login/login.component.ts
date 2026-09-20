/**
 * features/login/login.component.ts
 * Pantalla de inicio de sesion de FacturaExpress. Presenta el
 * formulario de acceso con credenciales, botones de accesibilidad
 * (modo oscuro / alto contraste) y efectos visuales decorativos.
 */

import { Component, inject } from '@angular/core';
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

  nit = '';
  password = '';
  mostrarPassword = false;
  error = '';
  isLoading = false;

  /** Envia las credenciales a la API y redirige al dashboard. */
  ingresar(): void {
    this.error = '';

    if (!this.nit.trim() || !this.password.trim()) {
      this.error = 'Por favor complete todos los campos.';
      return;
    }

    this.isLoading = true;
    this.auth
      .login(this.nit.trim(), this.password)
      .subscribe({
        next: (res) => {
          this.auth.establecerSesion(res);
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.error = mensajeError(err) || 'Credenciales incorrectas.';
          this.isLoading = false;
        },
      });
  }
}
