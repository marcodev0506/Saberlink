import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const router = Router();

// Lista de certificados de la empresa (menú Evaluaciones)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ce.codigo, ce.puntaje, ce.total, ce.created_at,
            u.nombre AS estudiante, c.titulo AS curso
     FROM certificados ce
     JOIN usuarios u ON u.id = ce.usuario_id
     JOIN cursos c ON c.id = ce.curso_id
     WHERE ce.empresa_id = $1 ORDER BY ce.created_at DESC`,
    [req.user.empresa_id]
  );
  res.json({ certificados: rows });
});

// Verificación pública del código QR (sin sesión: escaneable desde un teléfono)
router.get('/:codigo', async (req, res) => {
  const { rows: [ce] } = await pool.query(
    `SELECT ce.codigo, ce.puntaje, ce.total, ce.created_at,
            u.nombre AS estudiante, u.email, c.titulo AS curso, c.duracion, e.nombre AS empresa
     FROM certificados ce
     JOIN usuarios u ON u.id = ce.usuario_id
     JOIN cursos c ON c.id = ce.curso_id
     JOIN empresas e ON e.id = ce.empresa_id
     WHERE ce.codigo = $1`,
    [req.params.codigo]
  );
  if (!ce) return res.status(404).json({ error: 'Certificado no encontrado' });
  res.json({ certificado: ce });
});

// Certificado PDF con QR único
router.get('/:codigo/pdf', requireAuth, async (req, res) => {
  const { rows: [ce] } = await pool.query(
    `SELECT ce.codigo, ce.puntaje, ce.total, ce.created_at,
            u.nombre AS estudiante, u.email, c.titulo AS curso, c.duracion, e.nombre AS empresa
     FROM certificados ce
     JOIN usuarios u ON u.id = ce.usuario_id
     JOIN cursos c ON c.id = ce.curso_id
     JOIN empresas e ON e.id = ce.empresa_id
     WHERE ce.codigo = $1`,
    [req.params.codigo]
  );
  if (!ce) return res.status(404).json({ error: 'Certificado no encontrado' });

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const url = `${appUrl}/verificar/${ce.codigo}`;
  const qrPng = await QRCode.toBuffer(url, { width: 300, margin: 1 });
  const fecha = new Date(ce.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificado-${ce.codigo}.pdf"`);

  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0 });
  doc.pipe(res);
  const W = doc.page.width, H = doc.page.height;

  // Marco
  doc.rect(0, 0, W, H).fill('#FBF0D3');
  doc.rect(24, 24, W - 48, H - 48).lineWidth(3).stroke('#05284B');
  doc.rect(30, 30, W - 60, H - 60).lineWidth(1).stroke('#EC6A11');

  // Encabezado
  doc.fontSize(26).fillColor('#05284B').font('Helvetica-Bold')
     .text('Saberlink', W / 2 - 150, 70, { width: 300, align: 'center' });
  doc.fontSize(13).fillColor('#EC6A11').font('Helvetica-Bold')
     .text('CERTIFICADO DE ACREDITACIÓN', W / 2 - 150, 105, { width: 300, align: 'center' });
  doc.moveTo(W / 2 - 120, 135).lineTo(W / 2 + 120, 135).lineWidth(1).stroke('#EC6A11');

  doc.fontSize(12).fillColor('#4b5563').font('Helvetica')
     .text('Se certifica que', W / 2 - 150, 160, { width: 300, align: 'center' });
  doc.fontSize(24).fillColor('#05284B').font('Helvetica-Bold')
     .text(ce.estudiante, 80, 190, { width: W - 160, align: 'center' });
  doc.fontSize(11).fillColor('#4b5563').font('Helvetica')
     .text(ce.email, 80, 222, { width: W - 160, align: 'center' });
  doc.fontSize(12).fillColor('#4b5563').font('Helvetica')
     .text('ha aprobado satisfactoriamente el curso', 80, 252, { width: W - 160, align: 'center' });
  doc.fontSize(19).fillColor('#05284B').font('Helvetica-Bold')
     .text(ce.curso, 80, 282, { width: W - 160, align: 'center' });

  doc.fontSize(11).fillColor('#4b5563').font('Helvetica')
     .text(`${ce.empresa} · ${fecha}${ce.duracion ? ` · Duración: ${ce.duracion}` : ''} · Puntaje: ${ce.puntaje}/${ce.total}`,
       80, 330, { width: W - 160, align: 'center' });

  // QR + código de verificación
  doc.image(qrPng, 60, H - 200, { width: 120 });
  doc.fontSize(9).fillColor('#4b5563').font('Helvetica')
     .text(`Verifica en:\n${url}`, 60, H - 70, { width: 160 });
  doc.fontSize(9).fillColor('#05284B').font('Helvetica-Bold')
     .text(`Código: ${ce.codigo}`, W - 240, H - 70, { width: 180, align: 'right' });

  doc.end();
});

export default router;
