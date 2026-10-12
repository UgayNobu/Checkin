// ─────────────────────────────────────────────────────────────
// College structure: departments and programmes (public data from
// cst.edu.bt, see docs/DATA_SOURCES.md). Used by the sign-up form.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');

const programOut = (p) => ({
  id: p.id, name: p.name, level: p.level, years: p.durationYears,
  department: p.department ? { id: p.department.id, code: p.department.code, name: p.department.name } : null,
});

/** Every department with its programmes. */
async function listDepartments() {
  const rows = await prisma.department.findMany({ include: { programs: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
  return rows.map((d) => ({
    id: d.id, code: d.code, name: d.name, website: d.website,
    programs: d.programs.map(({ id, name, level, durationYears }) => ({ id, name, level, years: durationYears })),
  }));
}

/** Every programme, optionally only one level (e.g. Bachelor). */
async function listPrograms({ level } = {}) {
  const rows = await prisma.program.findMany({ where: { ...(level && { level }) }, include: { department: true }, orderBy: { name: 'asc' } });
  return rows.map(programOut);
}

module.exports = { listDepartments, listPrograms };
