// ─────────────────────────────────────────────────────────────
// PDF building blocks on top of pdfkit: a header, simple tables that
// break across pages, and a footer with page numbers.
// ─────────────────────────────────────────────────────────────
const PDFDocument = require('pdfkit');

const PAGE = { margin: 40, width: 595.28, height: 841.89 }; // A4 in points
const BLUE = '#2f6df0';

function createPdf(res, filename) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

function addHeader(doc, title, lines = []) {
  doc.rect(0, 0, PAGE.width, 6).fill(BLUE);
  doc.moveDown(0.5).fillColor('#000').font('Helvetica-Bold').fontSize(16).text(title);
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  lines.forEach((l) => doc.text(l));
  doc.moveDown(0.8).fillColor('#000');
}

function addSection(doc, heading) {
  if (doc.y > PAGE.height - 120) doc.addPage();
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text(heading, PAGE.margin).fillColor('#000').moveDown(0.3);
}

/** columns: [{ label, width }]; rows: arrays of values (null → "-"). */
function addTable(doc, columns, rows) {
  const x0 = PAGE.margin;
  const drawRow = (values, bold) => {
    if (doc.y > PAGE.height - 70) doc.addPage();
    const y = doc.y;
    let x = x0;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
    columns.forEach((c, i) => {
      doc.text(values[i] == null || values[i] === '' ? '-' : String(values[i]), x + 2, y, { width: c.width - 4, lineBreak: false, ellipsis: true });
      x += c.width;
    });
    doc.moveTo(x0, y + 14).lineTo(x, y + 14).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.y = y + 18;
  };
  drawRow(columns.map((c) => c.label), true);
  if (!rows.length) doc.font('Helvetica-Oblique').fontSize(9).fillColor('#777').text('No rows', x0).fillColor('#000');
  rows.forEach((r) => drawRow(r, false));
  doc.x = x0;
}

/** Page numbers on every page, then close the stream. */
function finalize(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing in the bottom margin must not create a new page
    doc.font('Helvetica').fontSize(8).fillColor('#888')
      .text(`CheckIn · Page ${i + 1} of ${range.count}`, PAGE.margin, PAGE.height - 30, { align: 'center', width: PAGE.width - 2 * PAGE.margin });
  }
  doc.end();
}

module.exports = { createPdf, addHeader, addSection, addTable, finalize, PAGE };
