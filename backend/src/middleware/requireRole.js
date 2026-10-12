// Use after requireAuth: requireRole('teacher') or requireRole('admin', 'management').
const { Forbidden } = require('../utils/errors');

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(Forbidden('Not allowed for your role', 'ROLE_FORBIDDEN'));

module.exports = { requireRole };
