-- ============================================================
-- FacturaExpress - Esquema de base de datos (MySQL)
-- Evidencia GA7-220501096-AA5-EV03: Diseno y desarrollo de
-- servicios web (API REST)
-- ------------------------------------------------------------
-- Script de creacion de la base de datos y todas sus tablas.
-- Ejecutar con: mysql -u <usuario> -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS facturaexpress_apirest
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE facturaexpress_apirest;

-- ------------------------------------------------------------
-- Tabla: usuarios
-- Perfiles de acceso al sistema (administrador, vendedor, contador)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nit           VARCHAR(20)  NOT NULL UNIQUE,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  telefono      VARCHAR(20)  NULL,
  rol           VARCHAR(30)  NOT NULL DEFAULT 'vendedor',
  password_hash VARCHAR(255) NOT NULL,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: clientes
-- Directorio de clientes del sistema de facturacion
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identificacion VARCHAR(20)  NOT NULL UNIQUE,
  nombre         VARCHAR(120) NOT NULL,
  email          VARCHAR(150) NULL,
  telefono       VARCHAR(20)  NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: productos
-- Catalogo de productos disponibles para la venta
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo     VARCHAR(20)    NOT NULL UNIQUE,
  nombre     VARCHAR(120)   NOT NULL,
  precio     DECIMAL(14,2)  NOT NULL,
  iva        DECIMAL(4,2)   NOT NULL DEFAULT 0.19,
  stock      INT            NOT NULL DEFAULT 0,
  activo     TINYINT(1)     NOT NULL DEFAULT 1,
  created_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: facturas
-- Cabecera de cada factura emitida.
-- Se guarda un "snapshot" del cliente (denormalizado) para
-- conservar la informacion aun si el cliente cambia despues.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturas (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero                 VARCHAR(30)  NOT NULL UNIQUE,
  fecha                  DATETIME     NOT NULL,
  cliente_id             INT UNSIGNED NOT NULL,
  cliente_identificacion VARCHAR(20)  NOT NULL,
  cliente_nombre         VARCHAR(120) NOT NULL,
  subtotal               DECIMAL(14,2) NOT NULL,
  iva                    DECIMAL(14,2) NOT NULL,
  descuento              DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total                  DECIMAL(14,2) NOT NULL,
  estado                 ENUM('pendiente','enviada','rechazada')
                         NOT NULL DEFAULT 'pendiente',
  cufe                   VARCHAR(150) NULL,
  firma_estado           VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  intentos_dian          INT          NOT NULL DEFAULT 0,
  correo_enviado         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_facturas_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: factura_items
-- Lineas (items) de cada factura.
-- Se eliminan en cascada cuando se elimina la factura.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS factura_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_id      INT UNSIGNED NOT NULL,
  producto_id     INT UNSIGNED NULL,
  codigo          VARCHAR(20)  NULL,
  nombre          VARCHAR(120) NOT NULL,
  cantidad        INT          NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  iva             DECIMAL(14,2) NOT NULL,
  subtotal        DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_items_factura
    FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: empresa
-- Datos de la empresa emisora y configuracion fiscal (DIAN).
-- Contiene un unico registro (id = 1).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresa (
  id                     INT UNSIGNED PRIMARY KEY,
  nit                    VARCHAR(20)  NOT NULL,
  razon_social           VARCHAR(150) NOT NULL,
  email_facturacion      VARCHAR(150) NULL,
  telefono               VARCHAR(20)  NULL,
  resolucion_dian        VARCHAR(50)  NULL,
  fecha_expiracion_cert  DATE         NULL,
  ultima_sync            DATETIME     NULL,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: errores_sistema
-- Bitacora de errores del sistema (firma, DIAN, base de datos,
-- correo u otros) para el modulo "Errores del Sistema".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS errores_sistema (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mensaje           TEXT NOT NULL,
  tipo              VARCHAR(50) NOT NULL DEFAULT 'otro',
  factura_id        INT UNSIGNED NULL,
  resuelto          TINYINT(1)  NOT NULL DEFAULT 0,
  fecha_resolucion  DATETIME    NULL,
  created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_errores_factura
    FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: logs_auditoria
-- Registro de auditoria de las operaciones criticas del sistema
-- (inserciones, actualizaciones y eliminaciones).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT UNSIGNED NULL,
  accion         VARCHAR(200) NOT NULL,
  tabla_afectada VARCHAR(50)  NOT NULL DEFAULT 'general',
  registro_id    BIGINT       NULL,
  ip_origen      VARCHAR(45)  NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: reportes
-- Reportes generados y guardados por los usuarios.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reportes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo           VARCHAR(50)  NOT NULL,
  periodo        VARCHAR(20)  NULL,
  fecha_inicio   DATE         NULL,
  fecha_fin      DATE         NULL,
  archivo        VARCHAR(255) NULL,
  tamano         BIGINT       NOT NULL DEFAULT 0,
  usuario_id     INT UNSIGNED NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reportes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: backups
-- Respaldo de la base de datos en archivos SQL generados por el
-- modulo de respaldos y restauracion.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backups (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  archivo     VARCHAR(255) NOT NULL,
  tamano      BIGINT       NOT NULL DEFAULT 0,
  usuario_id  INT UNSIGNED NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_backups_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Indices auxiliares para busquedas frecuentes
CREATE INDEX idx_facturas_estado ON facturas (estado);
CREATE INDEX idx_facturas_fecha  ON facturas (fecha);
CREATE INDEX idx_items_factura   ON factura_items (factura_id);
CREATE INDEX idx_productos_nombre ON productos (nombre);
CREATE INDEX idx_clientes_nombre ON clientes (nombre);
CREATE INDEX idx_errores_tipo    ON errores_sistema (tipo);
CREATE INDEX idx_errores_resuelto ON errores_sistema (resuelto);
CREATE INDEX idx_logs_usuario    ON logs_auditoria (usuario_id);
CREATE INDEX idx_logs_tabla      ON logs_auditoria (tabla_afectada);
CREATE INDEX idx_logs_fecha      ON logs_auditoria (created_at);
