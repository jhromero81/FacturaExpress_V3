/**
 * validators.spec.ts
 * Pruebas unitarias (base de la piramide) de las reglas de validacion de
 * formularios del frontend: NIT/NIT colombiano, correo, telefono, cliente,
 * producto y usuario. Se ejecuta con el runner de pruebas de Angular
 * (vitest + jsdom): `npm test`.
 */

import {
  validateRequired,
  validateNIT,
  validateEmail,
  validatePhone,
  validateCliente,
  validateProducto,
  validateUsuario,
} from './validators';

describe('validators - reglas de campo', () => {
  it('validateRequired rechaza vacios, nulos y cadenas de espacios', () => {
    expect(validateRequired('').valid).toBe(false);
    expect(validateRequired('   ').valid).toBe(false);
    expect(validateRequired(null).valid).toBe(false);
    expect(validateRequired(undefined).valid).toBe(false);
    expect(validateRequired(0).valid).toBe(true);
  });

  it('validateRequired incluye el nombre del campo en el mensaje', () => {
    expect(validateRequired('', 'El nombre').message).toBe('El nombre es obligatorio.');
  });

  it('validateNIT exige el formato 000000000-0', () => {
    expect(validateNIT('900123456-7').valid).toBe(true);

    expect(validateNIT('').valid).toBe(false);
    expect(validateNIT('900123456').valid).toBe(false); // sin digito de verificacion
    expect(validateNIT('900.123.456-7').valid).toBe(false); // con puntos de miles
    expect(validateNIT('900123456789-7').valid).toBe(false); // mas de 9 digitos
  });

  it('validateEmail acepta vacio (campo opcional) y rechaza correos invalidos', () => {
    expect(validateEmail('').valid).toBe(true);
    expect(validateEmail(undefined).valid).toBe(true);
    expect(validateEmail('cliente@correo.com').valid).toBe(true);

    expect(validateEmail('correo-invalido').valid).toBe(false);
    expect(validateEmail('cliente@correo').valid).toBe(false);
    expect(validateEmail('@correo.com').valid).toBe(false);
  });

  it('validatePhone acepta vacio y valida el formato telefonico', () => {
    expect(validatePhone('').valid).toBe(true);
    expect(validatePhone('3001234567').valid).toBe(true);
    expect(validatePhone('+57 300 123 4567').valid).toBe(true);

    expect(validatePhone('123').valid).toBe(false);
    expect(validatePhone('abcdefghij').valid).toBe(false);
  });
});

describe('validators - formularios completos', () => {
  it('validateCliente acepta un cliente valido', () => {
    const r = validateCliente({
      identificacion: '900123456-7',
      nombre: 'Cliente Demo',
      email: 'demo@correo.com',
      telefono: '3001234567',
    });

    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('validateCliente acumula un error por cada campo invalido', () => {
    const r = validateCliente({
      identificacion: '',
      nombre: '',
      email: 'correo-invalido',
      telefono: 'x'.repeat(30),
    });

    expect(r.valid).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'identificacion', 'nombre', 'telefono']);
  });

  it('validateProducto rechaza precios no positivos y stock no entero', () => {
    const invalido = validateProducto({ codigo: 'PRD-001', nombre: 'Producto', precio: 0, stock: -1 });
    expect(invalido.valid).toBe(false);
    expect(invalido.errors['precio']).toBeDefined();
    expect(invalido.errors['stock']).toBeDefined();

    const stockFraccionario = validateProducto({
      codigo: 'PRD-001',
      nombre: 'Producto',
      precio: 1500,
      stock: 1.5,
    });
    expect(stockFraccionario.errors['stock']).toBe('El stock debe ser un entero no negativo.');

    const sinCodigo = validateProducto({ codigo: '  ', nombre: 'Producto', precio: 1500, stock: 0 });
    expect(sinCodigo.errors['codigo']).toBeDefined();

    const valido = validateProducto({ codigo: 'PRD-001', nombre: 'Producto', precio: 1500, stock: 0 });
    expect(valido.valid).toBe(true);
  });

  it('validateUsuario exige contrasena de al menos 4 caracteres al crear', () => {
    const sinPassword = validateUsuario({ nit: '900123456-7', nombre: 'Usuario', password: '123' });
    expect(sinPassword.valid).toBe(false);
    expect(sinPassword.errors['password']).toBeDefined();

    const ok = validateUsuario({
      nit: '900123456-7',
      nombre: 'Usuario',
      password: 'admin123',
      email: 'usuario@correo.com',
      telefono: '3001234567',
    });
    expect(ok.valid).toBe(true);
  });

  it('validateUsuario omite la contrasena al actualizar (requierePassword: false)', () => {
    const r = validateUsuario(
      { nit: '900123456-7', nombre: 'Usuario' },
      { requierePassword: false }
    );

    expect(r.valid).toBe(true);
    expect(r.errors['password']).toBeUndefined();
  });
});
