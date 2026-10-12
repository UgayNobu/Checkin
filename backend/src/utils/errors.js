// ─────────────────────────────────────────────────────────────
// Error classes. Throw one anywhere in a service and the error
// handler turns it into { error, code } with the right HTTP status.
// ─────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
  }
}
const BadRequest = (msg, code = 'BAD_REQUEST') => new HttpError(400, msg, code);
const Unauthorized = (msg = 'Please log in', code = 'UNAUTHORIZED') => new HttpError(401, msg, code);
const Forbidden = (msg = 'Not allowed for your role', code = 'FORBIDDEN') => new HttpError(403, msg, code);
const NotFound = (msg = 'Not found', code = 'NOT_FOUND') => new HttpError(404, msg, code);
const Conflict = (msg, code = 'CONFLICT') => new HttpError(409, msg, code);

/** Wraps an async route handler so a rejected promise reaches the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, BadRequest, Unauthorized, Forbidden, NotFound, Conflict, asyncHandler };
