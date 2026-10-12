// CSV helpers. A value with a comma, quote or newline is quoted and inner quotes doubled.
const escapeCsvValue = (v) => {
  const x = v == null ? '' : String(v);
  return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
};
const buildCsv = (header, rows) => [header, ...rows].map((r) => r.map(escapeCsvValue).join(',')).join('\n');

/** Sends a CSV as a download. The BOM makes Excel read UTF-8 names correctly. */
const sendCsv = (res, filename, header, rows) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + buildCsv(header, rows));
};

module.exports = { escapeCsvValue, buildCsv, sendCsv };
