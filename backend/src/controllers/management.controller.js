const { asyncHandler } = require('../utils/errors');
const m = require('../services/management.service');

// Every view takes an optional ?session=AS2026 to look at an old semester (default: current).
const term = (req) => ({ term: req.query.session });

module.exports = {
  overview: asyncHandler(async (req, res) => res.json(await m.overview(term(req)))),
  department: asyncHandler(async (req, res) => res.json(await m.department(req.params.name, term(req)))),
  module: asyncHandler(async (req, res) => res.json(await m.moduleView(req.params.id, term(req)))),
  student: asyncHandler(async (req, res) => res.json(await m.studentView(req.params.id, req.query.module, term(req)))),
  teachers: asyncHandler(async (req, res) => res.json(await m.teachers(term(req)))),
  history: asyncHandler(async (req, res) => res.json(await m.history(req.query))),
  calendar: asyncHandler(async (req, res) => res.json(await m.calendar(req.query))),
};
