/**
 * Modelos de datos que consume el frontend.
 * Reflejan la estructura JSON normalizada que devuelve la API.
 */

export interface Usuario {
  id: number;
  nit: string;
  nombre: string;
  email?: string;
  telefono?: string;
  rol: 'admin' | 'vendedor' | 'contador';
  activo?: boolean;
  created_at?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  usuario: Usuario;
}

export interface Cliente {
  id: number;
  identificacion: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface ListadoResponse<T> {
  success: boolean;
  total: number;
  [clave: string]: unknown;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  precio: number;
  iva: number;
  stock: number;
}

export interface FacturaItem {
  id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  iva: number;
  subtotal: number;
}

export interface Factura {
  id: number;
  numero: string;
  fecha: string;
  cliente: { id: number; identificacion: string; nombre: string };
  subtotal: number;
  iva: number;
  descuento: number;
  total: number;
  estado: 'pendiente' | 'enviada' | 'rechazada' | 'anulada' | string;
  cufe: string | null;
  firmaEstado: string;
  intentosDian: number;
  correoEnviado: boolean;
  items?: FacturaItem[];
}

export interface KPIs {
  ventasDia: number;
  facturasEmitidasHoy: number;
  facturasEmitidas: number;
  pendientesDIAN: number;
  ticketPromedio: number;
  ventasMes: number;
  clientesNuevos: number;
  productosVendidos: number;
  metaVentasMensual: number;
  avanceMeta: number;
}

export interface Empresa {
  razonSocial: string;
  nit: string;
  emailFacturacion?: string;
  telefono?: string;
  resolucionDian?: string;
  ultimaSync?: string | null;
}
