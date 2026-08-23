/**
 * core/validators.ts
 * Funciones de validacion de datos para formularios de la aplicacion.
 * Cada funcion retorna { valid, message } o { valid, errors } para
 * formularios completos (port de utils/validators.js de React).
 */

const NIT_REGEX = /^\d{1,9}-\d{1}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{7,15}$/;

export interface ResultadoCampo {
  valid: boolean;
  message: string;
}

export interface Errores {
  [campo: string]: string | undefined;
}

/** Valida un numero de NIT colombiano. */
export function validateNIT(nit: string): ResultadoCampo {
  if (!nit || nit.trim() === '') {
    return { valid: false, message: 'El NIT es obligatorio.' };
  }
  if (!NIT_REGEX.test(nit.trim())) {
    return { valid: false, message: 'Formato de NIT invalido (ej: 900123456-7).' };
  }
  return { valid: true, message: '' };
}

/** Valida un correo electronico (opcional). */
export function validateEmail(email?: string): ResultadoCampo {
  if (!email || email.trim() === '') return { valid: true, message: '' };
  if (!EMAIL_REGEX.test(email.trim())) {
    return { valid: false, message: 'Formato de correo electronico invalido.' };
  }
  return { valid: true, message: '' };
}

/** Valida un numero de telefono (opcional). */
export function validatePhone(phone?: string): ResultadoCampo {
  if (!phone || phone.trim() === '') return { valid: true, message: '' };
  if (!PHONE_REGEX.test(phone.trim())) {
    return { valid: false, message: 'Formato de telefono invalido.' };
  }
  return { valid: true, message: '' };
}

/** Valida que un campo de texto no este vacio. */
export function validateRequired(value: unknown, fieldName = 'Este campo'): ResultadoCampo {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { valid: false, message: `${fieldName} es obligatorio.` };
  }
  return { valid: true, message: '' };
}

/** Valida un formulario completo de cliente. */
export function validateCliente(cliente: {
  identificacion: string;
  nombre: string;
  email?: string;
  telefono?: string;
}): { valid: boolean; errors: Errores } {
  const errors: Errores = {};

  const id = validateRequired(cliente.identificacion, 'La identificacion');
  if (!id.valid) errors['identificacion'] = id.message;

  const nombre = validateRequired(cliente.nombre, 'El nombre');
  if (!nombre.valid) errors['nombre'] = nombre.message;

  const email = validateEmail(cliente.email);
  if (!email.valid) errors['email'] = email.message;

  const phone = validatePhone(cliente.telefono);
  if (!phone.valid) errors['telefono'] = phone.message;

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Valida un formulario completo de producto. */
export function validateProducto(producto: {
  codigo: string;
  nombre: string;
  precio: number | string;
  stock: number | string;
}): { valid: boolean; errors: Errores } {
  const errors: Errores = {};

  const codigo = validateRequired(producto.codigo, 'El codigo');
  if (!codigo.valid) errors['codigo'] = codigo.message;

  const nombre = validateRequired(producto.nombre, 'El nombre');
  if (!nombre.valid) errors['nombre'] = nombre.message;

  const precio = Number(producto.precio);
  if (!producto.precio || precio <= 0) {
    errors['precio'] = 'El precio debe ser mayor que cero.';
  }

  const stock = Number(producto.stock);
  const stockCrudo = producto.stock as unknown;
  if (
    stockCrudo === '' ||
    stockCrudo === null ||
    stockCrudo === undefined ||
    stock < 0 ||
    !Number.isInteger(stock)
  ) {
    errors['stock'] = 'El stock debe ser un entero no negativo.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Valida un formulario de usuario. */
export function validateUsuario(
  usuario: { nit: string; nombre: string; password?: string; email?: string; telefono?: string },
  opciones: { requierePassword?: boolean } = {}
): { valid: boolean; errors: Errores } {
  const requierePassword = opciones.requierePassword ?? true;
  const errors: Errores = {};

  const id = validateRequired(usuario.nit, 'El NIT');
  if (!id.valid) errors['nit'] = id.message;

  const nombre = validateRequired(usuario.nombre, 'El nombre');
  if (!nombre.valid) errors['nombre'] = nombre.message;

  if (requierePassword && (!usuario.password || usuario.password.length < 4)) {
    errors['password'] = 'La contrasena debe tener al menos 4 caracteres.';
  }

  const email = validateEmail(usuario.email);
  if (!email.valid) errors['email'] = email.message;

  const phone = validatePhone(usuario.telefono);
  if (!phone.valid) errors['telefono'] = phone.message;

  return { valid: Object.keys(errors).length === 0, errors };
}
