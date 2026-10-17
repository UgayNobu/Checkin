// ─────────────────────────────────────────────────────────────
// Runs a zod schema on req.body / req.query / req.params.
// On success the cleaned value replaces the original (numbers are
// numbers, strings are trimmed); on failure → 400 with the first problem.
// ─────────────────────────────────────────────────────────────
const { BadRequest } = require('../utils/errors');

const validate = (where) => (schema) => (req, res, next) => {
  const result = schema.safeParse(req[where] ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    return next(BadRequest(field ? `${field}: ${issue.message}` : issue.message, 'VALIDATION_ERROR'));
  }
  req[where] = result.data;
  next();
};

module.exports = { validateBody: validate('body'), validateQuery: validate('query'), validateParams: validate('params') };
