import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const INK = "#1e1811";
const AMBER = "#b9791f"; // darkened from the app's #e8a54b for contrast on a light, printable background
const MUTED = "#6e6358";

/**
 * Renders a completion certificate as a PDF and resolves with a Buffer.
 * Pure function of its input — no DB access here, so it's easy to test and
 * to re-render later if the template ever changes.
 */
export async function renderCertificatePdf({ recipientName, courseTitle, issuedAt, certificateId, verifyUrl }) {
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, color: { dark: INK, light: "#ffffff00" } });
  const qrBuffer = Buffer.from(qrDataUrl.slice(qrDataUrl.indexOf(",") + 1), "base64");

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const { width, height } = doc.page;

  const pdfPromise = new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Background + double border
  doc.rect(0, 0, width, height).fill("#fbf9f5");
  doc.rect(28, 28, width - 56, height - 56).lineWidth(2).stroke(AMBER);
  doc.rect(38, 38, width - 76, height - 76).lineWidth(0.75).stroke(INK);

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(11)
    .text("LINUX ACADEMY", 0, 70, { align: "center", characterSpacing: 3 });

  doc.fillColor(INK).font("Times-Bold").fontSize(34).text("Certificate of Completion", 0, 100, { align: "center" });

  doc.fillColor(MUTED).font("Times-Italic").fontSize(14).text("This certifies that", 0, 165, { align: "center" });

  doc.fillColor(INK).font("Times-Bold").fontSize(30).text(recipientName, 0, 190, { align: "center" });

  doc
    .fillColor(MUTED)
    .font("Times-Italic")
    .fontSize(14)
    .text("has successfully completed", 0, 235, { align: "center" });

  doc
    .fillColor(INK)
    .font("Times-Bold")
    .fontSize(22)
    .text(courseTitle, 60, 262, { align: "center", width: width - 120 });

  const dateStr = new Date(issuedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  doc.fillColor(MUTED).font("Helvetica").fontSize(12).text(`Issued ${dateStr}`, 0, 320, { align: "center" });

  // Footer: QR code + verification details
  const footerY = height - 130;
  doc.image(qrBuffer, 70, footerY, { width: 70, height: 70 });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text("Scan to verify", 70, footerY + 74, { width: 70, align: "center" });

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(10)
    .text(`Verification ID: ${certificateId}`, width - 380, footerY + 10, { width: 300, align: "right" });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(10)
    .text(verifyUrl, width - 380, footerY + 26, { width: 300, align: "right", link: verifyUrl });

  doc.end();
  return pdfPromise;
}
