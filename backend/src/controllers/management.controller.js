const { asyncHandler } = require('../utils/errors');
const m = require('../services/management.service');

module.exports = {
  overview: asyncHandler(async (req, res) => res.json(await m.overview())),
  department: asyncHandler(async (req, res) => res.json(await m.department(req.params.name))),
  module: asyncHandler(async (req, res) => res.json(await m.moduleView(req.params.id))),
  student: asyncHandler(async (req, res) => res.json(await m.studentView(req.params.id, req.query.module))),
  teachers: asyncHandler(async (req, res) => res.json(await m.teachers())),
  history: asyncHandler(async (req, res) => res.json(await m.history(req.query))),
  calendar: asyncHandler(async (req, res) => res.json(await m.calendar(req.query))),
};
