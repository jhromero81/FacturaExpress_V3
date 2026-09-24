/**
 * features/admin/usuarios.component.ts (solo admin)
 * Administracion de perfiles de acceso: tabla con busqueda y filtro
 * por rol, creacion, edicion (contrasena opcional),
 * activacion/desactivacion y eliminacion. Consume /api/usuarios.
 */

import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { Usuario } from '../../core/models';
import { PERFILES_USUARIO } from '../../core/constants';
import { Errores, validateUsuario } from '../../core/validators';

interface FormUsuario {
  nit: string;
  nombre: string;
  email: string;
  telefono: string;
  rol: string;
  password: string;
}

const USUARIO_VACIO: FormUsuario = { nit: '', nombre: '', email: '', telefono: '', rol: 'vendedor', password: '' };

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrls: ['./usuarios.component.css'],
})
export class UsuariosComponent implements OnInit, OnDestroy {

  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  /** Lista de usuarios (la API devuelve el directorio completo). */
  usuarios: Usuario[] = [];
  loading = signal(true);

  /** Texto de busqueda con debounce y filtro por rol. */
  searchTerm = '';
  rolFilter = '';
  private debouncedSearch = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Control del modal y formulario. */
  showModal = false;
  editingId: number | null = null;
  formData: FormUsuario = { ...USUARIO_VACIO };
  errors: Errores = {};

  readonly perfiles = Object.values(PERFILES_USUARIO);

  ngOnInit(): void {
    this.api.get<{ success: boolean; usuarios: Usuario[] }>('/usuarios').subscribe({
      next: (res) => {
        this.usuarios = res.usuarios ?? [];
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.mostrar(mensajeError(err), 'error');
        this.loading.set(false);
      },
    });
  }

  /** Cancela el temporizador de busqueda pendiente al salir de la vista. */
  ngOnDestroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** Nombre legible de un rol. */
  rolLabel(rol: string): string {
    const clave = rol?.toUpperCase();
    return PERFILES_USUARIO[clave]?.nombre || rol || '--';
  }

  /** Filtra por busqueda (debounce manual) y rol en el cliente. */
  onSearchChange(): void {
    // Se cancela el temporizador anterior: antes cada pulsacion programaba
    // uno nuevo y todos se ejecutaban.
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.debouncedSearch = this.searchTerm;
    }, 300);
  }

  get filteredUsuarios(): Usuario[] {
    let result = this.usuarios;
    if (this.rolFilter) result = result.filter((u) => u.rol === this.rolFilter);
    if (this.debouncedSearch.trim()) {
      const term = this.debouncedSearch.toLowerCase();
      result = result.filter(
        (u) =>
          u.nombre.toLowerCase().includes(term) ||
          u.nit.toLowerCase().includes(term) ||
          (u.email && u.email.toLowerCase().includes(term))
      );
    }
    return result;
  }

  handleChange(field: keyof FormUsuario, value: string): void {
    this.formData = { ...this.formData, [field]: value };
    this.errors = { ...this.errors, [field]: undefined };
  }

  openCreate(): void {
    this.editingId = null;
    this.formData = { ...USUARIO_VACIO };
    this.errors = {};
    this.showModal = true;
  }

  openEdit(usuario: Usuario): void {
    this.editingId = usuario.id;
    this.formData = {
      nit: usuario.nit,
      nombre: usuario.nombre,
      email: usuario.email || '',
      telefono: usuario.telefono || '',
      rol: usuario.rol,
      password: '',
    };
    this.errors = {};
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  /** Guarda (crea o actualiza) un usuario tras validar el formulario. */
  handleSave(): void {
    const isEdit = Boolean(this.editingId);
    const validation = validateUsuario(this.formData, { requierePassword: !isEdit });
    if (!validation.valid) {
      this.errors = validation.errors;
      return;
    }

    const payload: Record<string, string> = {
      nit: this.formData.nit.trim(),
      nombre: this.formData.nombre.trim(),
      email: this.formData.email.trim(),
      telefono: this.formData.telefono.trim(),
      rol: this.formData.rol,
    };
    if (this.formData.password) payload['password'] = this.formData.password;

    const peticion$ = isEdit
      ? this.api.put<{ success: boolean; usuario: Usuario }>(`/usuarios/${this.editingId}`, payload)
      : this.api.post<{ success: boolean; usuario: Usuario }>('/usuarios', payload);

    peticion$.subscribe({
      next: (res) => {
        this.usuarios = isEdit
          ? this.usuarios.map((u) => (u.id === this.editingId ? res.usuario : u))
          : [res.usuario, ...this.usuarios];
        this.toast.mostrar(isEdit ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success');
        this.closeModal();
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }

  /** Activa o desactiva un usuario. */
  handleToggle(usuario: Usuario): void {
    this.api.patch<{ success: boolean; message: string; usuario: Usuario }>(`/usuarios/${usuario.id}/activo`, {
      activo: !usuario.activo,
    }).subscribe({
      next: (res) => {
        this.usuarios = this.usuarios.map((u) => (u.id === usuario.id ? res.usuario : u));
        this.toast.mostrar(res.message, 'success');
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }

  /** Elimina un usuario con confirmacion previa. */
  handleDelete(usuario: Usuario): void {
    if (!window.confirm(`Desea eliminar el usuario "${usuario.nombre}"?`)) return;
    this.api.delete<{ success: boolean }>(`/usuarios/${usuario.id}`).subscribe({
      next: () => {
        this.usuarios = this.usuarios.filter((u) => u.id !== usuario.id);
        this.toast.mostrar('Usuario eliminado correctamente', 'success');
      },
      error: (err) => this.toast.mostrar(mensajeError(err), 'error'),
    });
  }
}
