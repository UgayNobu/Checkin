// Admin → Semesters → Upload timetable.
//  1. Download the CSV template (open it in Excel or Google Sheets, one row per weekly class)
//  2. Choose the semester and the filled-in file (save it as CSV)
//  3. Preview: every problem is listed with its row number; nothing is saved yet
//  4. Save: replaces that semester's timetable (only while no attendance was taken from it)
// Backend: POST /admin/academic-sessions/:code/timetable (?dryRun=1 for the preview)
import { useState } from 'react';
import { api } from '../../api';

const HEADER = ['programme', 'year', 'semester', 'day', 'start', 'end', 'module', 'type', 'group', 'room', 'tutors', 'note'];
const EXAMPLE = [
  ['B.E. Software Engineering', '2', '1', 'Mon', '09:00', '10:00', 'SWE303', 'theory', '', 'IT-02', 'Nima Yoezer', ''],
  ['B.E. Software Engineering', '2', '1', 'Tue', '13:15', '15:15', 'SWE303', 'practical', 'A', '', 'Nima Yoezer', 'Lab group A'],
];

/** Small CSV reader: commas, quoted fields ("a, b"), "" inside quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const t = String(text || '').replace(/^﻿/, ''); // Excel's BOM
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const csvLine = (r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');

export default function TimetableUpload({ semesters, onSaved }) {
  // the current semester and the ones still to come (a finished semester's timetable stays as it was)
  const today = new Date().toISOString().slice(0, 10);
  const choices = (semesters || []).filter((x) => x.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const [code, setCode] = useState('');
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState('');
  const [check, setCheck] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const sem = code || choices[0]?.code || '';

  const template = () => {
    const blob = new Blob(['﻿' + [HEADER, ...EXAMPLE].map(csvLine).join('\r\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'timetable-template.csv' });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setCheck(null); setErr(''); setMsg('');
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setErr('Choose a .csv file. In Excel: File → Save As → CSV.');
    f.text().then((t) => {
      const r = parseCsv(t);
      if (!r.length) return setErr('That file has no classes in it.');
      setRows(r); setFile(f.name);
      setBusy(true);
      api(`/admin/academic-sessions/${sem}/timetable?dryRun=1`, { rows: r })
        .then(setCheck).catch((x) => setErr(x.message)).finally(() => setBusy(false));
    });
  };

  const save = () => {
    setBusy(true); setErr('');
    api(`/admin/academic-sessions/${sem}/timetable`, { rows })
      .then((r) => { setMsg(`${r.saved} classes saved for ${r.semester.name}.`); setCheck(null); setRows(null); setFile(''); onSaved?.(); })
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };

  if (!choices.length) return null;
  return (
    <section className="tu">
      <h3 className="sem-h">Upload a timetable</h3>
      <p className="sem-note">
        Fill in the template (one row per weekly class) in Excel or Google Sheets, save it as CSV and upload it here.
        You see every problem before anything is saved. Uploading again replaces that semester's timetable, which is only
        allowed before attendance has been taken from it.
      </p>
      <div className="tu-row">
        <button type="button" className="sem-btn ghost" onClick={template}>Download template</button>
        <label className="tu-sem">Semester
          <select value={sem} onChange={(e) => { setCode(e.target.value); setCheck(null); setRows(null); setFile(''); }}>
            {choices.map((x) => <option key={x.code} value={x.code}>{x.name}{x.isCurrent ? ' (current)' : ''}</option>)}
          </select>
        </label>
        <label className="sem-btn tu-file">
          {busy && !check ? 'Checking…' : 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" hidden onChange={pick} disabled={busy} />
        </label>
        {file && <small className="tu-name">{file}</small>}
      </div>

      {err && <p className="err">{err}</p>}
      {msg && <p className="sem-ok">✓ {msg}</p>}

      {check && (
        <div className={'tu-result ' + (check.ok ? 'ok' : 'bad')}>
          {check.ok ? (
            <>
              <p><b>{check.count} classes are ready</b> for {check.semester.name}.
                {check.replaces ? ` This replaces the ${check.replaces} classes already loaded for it.` : ''}</p>
              <button className="sem-btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : `Save ${check.count} classes`}</button>
            </>
          ) : (
            <>
              <p><b>{check.errors.length} problem{check.errors.length === 1 ? '' : 's'} found.</b> Nothing was saved. Fix these rows in the file and upload it again:</p>
              <table>
                <thead><tr><th>Row</th><th>Problem</th></tr></thead>
                <tbody>{check.errors.slice(0, 100).map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>)}</tbody>
              </table>
              {check.errors.length > 100 && <small>…and {check.errors.length - 100} more.</small>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
