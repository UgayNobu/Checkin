// `npm run dev` from the repo root: starts backend and frontend together, output prefixed.
// Ctrl+C stops both. No extra dependencies needed.
const { spawn } = require('child_process');
const path = require('path');

const apps = [
  { name: 'backend', color: '\x1b[36m' },
  { name: 'frontend', color: '\x1b[35m' },
];

const children = apps.map(({ name, color }) => {
  const child = spawn('npm run dev', { cwd: path.join(__dirname, '..', name), shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `${color}[${name}]\x1b[0m `;
  const print = (out) => (data) => data.toString().split(/\r?\n/).filter(Boolean).forEach((l) => out.write(prefix + l + '\n'));
  child.stdout.on('data', print(process.stdout));
  child.stderr.on('data', print(process.stderr));
  child.on('exit', (code) => console.log(`${prefix}stopped (exit ${code})`));
  return child;
});

process.on('SIGINT', () => { children.forEach((c) => c.kill()); process.exit(0); });
