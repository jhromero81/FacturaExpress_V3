/**
 * seedData.js
 * Datos de ejemplo utilizados para poblar la base de datos.
 * Son el equivalente backend de los valores por defecto que
 * el frontend maneja en src/utils/constants.js, garantizando
 * consistencia entre el prototipo y la API.
 */

/** Datos de la empresa emisora */
const EMPRESA_DEFAULT = {
  nit: '900.123.456-7',
  razonSocial: 'Industrias Metalurgicas S.A.S',
  emailFacturacion: 'facturacion@industriasm.com',
  telefono: '+57 300 123 4567',
  resolucionDian: 'RES-2024-001234',
  fechaExpiracionCert: '2026-12-31',
};

/** Tasa de IVA aplicada en Colombia (19%) */
const IVA_RATE = 0.19;

/** Productos de ejemplo del catalogo */
const PRODUCTOS_DEFAULT = [
  { codigo: 'PROD001', nombre: 'Insumo Industrial X', precio: 85000, iva: 0.19, stock: 50 },
  { codigo: 'PROD002', nombre: 'Insumo Industrial Y', precio: 120000, iva: 0.19, stock: 35 },
  { codigo: 'PROD003', nombre: 'Material Premium Z', precio: 250000, iva: 0.19, stock: 20 },
  { codigo: 'PROD004', nombre: 'Componente Electronico A', precio: 45000, iva: 0.19, stock: 100 },
  { codigo: 'PROD005', nombre: 'Herramienta Especial B', precio: 189000, iva: 0.19, stock: 15 },
];

/** Clientes de ejemplo del directorio */
const CLIENTES_DEFAULT = [
  { identificacion: '80.123.456-1', nombre: 'Constructora Moderna S.A.S', email: 'compras@constructoramoderna.com', telefono: '+57 310 234 5678' },
  { identificacion: '90.456.789-2', nombre: 'Distribuidora Andina Ltda', email: 'pedidos@distribuidoraandina.com', telefono: '+57 315 678 9012' },
  { identificacion: '70.789.012-3', nombre: 'TecnoSoluciones del Sur', email: 'compras@tecnosoluciones.co', telefono: '+57 320 345 6789' },
  { identificacion: '83.234.567-4', nombre: 'Grupo Industrial del Norte', email: 'proveedores@grupoindustrial.com', telefono: '+57 301 456 7890' },
];

/**
 * Usuarios de ejemplo del sistema.
 * Las contrasenas se encriptan en tiempo de ejecucion por el
 * script de seed (no deben viajar en texto plano).
 */
const USUARIOS_DEFAULT = [
  { nit: '900.123.456-7', nombre: 'Jhon Henry Romero', email: 'admin@facturaexpress.co', telefono: '+57 300 123 4567', rol: 'admin', password: 'admin123' },
  { nit: '80.987.654-3', nombre: 'Maria Fernanda Lopez', email: 'vendedor@facturaexpress.co', telefono: '+57 312 555 8899', rol: 'vendedor', password: 'vendedor123' },
  { nit: '70.555.444-2', nombre: 'Carlos Andres Ruiz', email: 'contador@facturaexpress.co', telefono: '+57 311 444 2211', rol: 'contador', password: 'contador123' },
];

module.exports = {
  EMPRESA_DEFAULT,
  IVA_RATE,
  PRODUCTOS_DEFAULT,
  CLIENTES_DEFAULT,
  USUARIOS_DEFAULT,
};
