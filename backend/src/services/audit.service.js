// Audit trail of admin actions. Writing never throws.
const { prisma } = require('../lib/prisma');
const { DAY_MS } = require('../config/constants');

const writeAuditLog = (adminId, action, details) =>
  prisma.auditLog.create({ data: { adminId, action, details: details == null ? null : String(details).slice(0, 500) } })
    .catch((e) => console.warn('[audit] failed:', e.message));

async function listAuditLogs({ action, from, to, q, limit = 100 }) {
  const where = { ...(action && { action }) };
  if (from || to) {
    where.timestamp = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lt: new Date(new Date(to).getTime() + DAY_MS) }), // include the whole "to" day
    };
  }
  if (q) where.OR = [{ details: { contains: q, mode: 'insensitive' } }, { admin: { name: { contains: q, mode: 'insensitive' } } }];
  const rows = await prisma.auditLog.findMany({ where, include: { admin: true }, orderBy: { timestamp: 'desc' }, take: limit });
  return rows.map((x) => ({ _id: x.id, action: x.action, details: x.details, time: x.timestamp, admin: { userId: x.admin.id, name: x.admin.name } }));
}

async function listAuditActions() {
  const rows = await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
  return rows.map((x) => x.action);
}

module.exports = { writeAuditLog, listAuditLogs, listAuditActions };
