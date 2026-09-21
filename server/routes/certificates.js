import { Router } from "express";
import { db } from "../db.js";
import { config } from "../config.js";
import { renderCertificatePdf } from "../utils/certificate.js";

export const certificatesRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadCertificate(id) {
  if (!UUID_RE.test(id)) return null;
  return db
    .prepare(
      `SELECT cert.id, cert.issued_at, u.name AS recipient_name, c.title AS course_title
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.id = ?`
    )
    .get(id);
}

// Public — a certificate's id is the credential. This intentionally reveals
// the recipient's name (that's the point of a certificate) but nothing else
// about their account.
certificatesRouter.get("/verify/:id", (req, res) => {
  const cert = loadCertificate(req.params.id);
  if (!cert) return res.status(404).json({ valid: false });
  res.json({
    valid: true,
    recipientName: cert.recipient_name,
    courseTitle: cert.course_title,
    issuedAt: cert.issued_at,
    id: cert.id
  });
});

certificatesRouter.get("/certificates/:id/pdf", async (req, res, next) => {
  try {
    const cert = loadCertificate(req.params.id);
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    const pdf = await renderCertificatePdf({
      recipientName: cert.recipient_name,
      courseTitle: cert.course_title,
      issuedAt: cert.issued_at,
      certificateId: cert.id,
      verifyUrl: `${config.publicBaseUrl}/verify/${cert.id}`
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate-${cert.id}.pdf"`,
      "Cache-Control": "private, max-age=3600"
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});
