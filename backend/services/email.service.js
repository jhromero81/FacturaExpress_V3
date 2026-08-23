/**
 * services/email.service.js
 * Servicio de envio de facturas por correo electronico.
 * Solo se activa si el entorno define credenciales SMTP
 * (MAIL_USERNAME / MAIL_PASSWORD / MAIL_HOST). Si no estan
 * configuradas, el envio se omite sin afectar la operacion.
 */

const nodemailer = require('nodemailer');

/**
 * Verifica si el servicio de correo esta configurado.
 * @returns {boolean} true si hay credenciales SMTP definidas.
 */
function correoConfigurado() {
  return Boolean(process.env.MAIL_USERNAME && process.env.MAIL_PASSWORD);
}

/**
 * Envia una factura en PDF adjunto al correo del cliente.
 * @param {object} opciones - { destino, asunto, cuerpoHtml, pdfBytes, nombreAdjunto }.
 * @returns {Promise<boolean>} true si el envio fue exitoso.
 */
async function enviarFactura({ destino, asunto, cuerpoHtml, pdfBytes, nombreAdjunto }) {
  if (!correoConfigurado() || !destino) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: `"FacturaExpress" <${process.env.MAIL_USERNAME}>`,
      to: destino,
      subject: asunto || 'Factura Electronica',
      html: cuerpoHtml || '<p>Adjuntamos su factura electronica.</p>',
      attachments: [
        {
          filename: nombreAdjunto || 'factura.pdf',
          content: pdfBytes,
          contentType: 'application/pdf',
        },
      ],
    });
    return true;
  } catch (error) {
    console.error(`[email] No fue posible enviar el correo a ${destino}: ${error.message}`);
    return false;
  }
}

module.exports = { enviarFactura, correoConfigurado };
