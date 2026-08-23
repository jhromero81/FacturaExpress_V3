/**
 * core/api.service.ts
 * Cliente HTTP central del frontend. Todas las peticiones salen
 * con credentials: 'include' para enviar/recibir la cookie httpOnly
 * de sesion, y normalizan los errores del backend.
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /** Peticion GET tipada. */
  get<T>(ruta: string) {
    return this.http.get<T>(this.base + ruta, { withCredentials: true });
  }

  /** Peticion POST con cuerpo JSON; devuelve la respuesta tipada. */
  post<T>(ruta: string, cuerpo: unknown) {
    return this.http.post<T>(this.base + ruta, cuerpo ?? {}, { withCredentials: true });
  }

  /** Peticion PUT de actualizacion completa. */
  put<T>(ruta: string, cuerpo: unknown) {
    return this.http.put<T>(this.base + ruta, cuerpo, { withCredentials: true });
  }

  /** Peticion PATCH de actualizacion parcial. */
  patch<T>(ruta: string, cuerpo: unknown) {
    return this.http.patch<T>(this.base + ruta, cuerpo, { withCredentials: true });
  }

  /** Peticion DELETE. */
  delete<T>(ruta: string) {
    return this.http.delete<T>(this.base + ruta, { withCredentials: true });
  }

  /**
   * Descarga un archivo binario (PDF/CSV/XML/SQL) devuelto por la
   * API y dispara su guardado en el navegador. El nombre del archivo
   * se toma de la cabecera Content-Disposition; si no viene, se usa
   * el ultimo segmento de la ruta. Devuelve una promesa para poder
   * reaccionar a errores desde los componentes.
   */
  descargar(ruta: string): Promise<void> {
    const peticion = this.http.get(this.base + ruta, {
      withCredentials: true,
      responseType: 'blob',
      observe: 'response',
    });

    return firstValueFrom(peticion).then((respuesta) => {
      const blob = respuesta.body as Blob;

      let nombre = 'archivo';
      const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
      const coincidencia = /filename="?([^";]+)"?/i.exec(disposicion);
      if (coincidencia) {
        nombre = coincidencia[1];
      } else {
        const segmentos = ruta.split('?')[0].split('/').filter(Boolean);
        const ultimo = segmentos[segmentos.length - 1];
        nombre = ultimo ?? 'archivo';
      }

      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    });
  }
}

/** Extrae el mensaje legible de un error HTTP del backend. */
export function mensajeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const cuerpo = error.error as { message?: string } | null;
    if (cuerpo?.message) return cuerpo.message;
    if (error.status === 0) return 'Sin conexion con el servidor.';
    return `Error ${error.status}: ${error.statusText}`;
  }
  return 'Error inesperado.';
}
