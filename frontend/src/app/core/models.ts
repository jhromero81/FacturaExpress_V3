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
  /**
   * El token solo llega si el cliente lo pide con el encabezado
   * X-Token-Response: true. La sesion del navegador viaja en la cookie
   * httpOnly, por lo que el frontend no lo necesita ni lo persiste.
   */
  token?: string;
  usuario: Usuario;
}

export interface Cliente {
  id: number;
  identificacion: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  precio: number;
  /** Tarifa de IVA en tanto por uno (0, 0.05, 0.19) */
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
  estado: 'pendiente' | 'enviada' | 'rechazada';
  cufe: string | null;
  firmaEstado: string;
  intentosDian: number;
  correoEnviado: boolean;
  items?: FacturaItem[];
}

export interface KPIs {
  ventasDia: number;
  /** Ventas del dia anterior: permite calcular una tendencia real */
  ventasAyer?: number;
  facturasEmitidasHoy: number;
  /** Facturas del mes en curso */
  facturasEmitidas: number;
  pendientesDIAN: number;
  ticketPromedio: number;
  /** Ventas del mes en curso (no el acumulado historico) */
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
}
