const { asyncHandler } = require('../utils/errors');
const student = require('../services/student.service');
const { monthDays, dayDetails, enrolledModuleIds } = require('../services/stats.service');

module.exports = {
  dashboard: asyncHandler(async (req, res) => res.json(await student.dashboard(req.user.id, { session: req.query.session }))),
  summary: asyncHandler(async (req, res) => res.json(await student.summary(req.user.id, { session: req.query.session }))),
  moduleRecords: asyncHandler(async (req, res) => res.json(await student.moduleRecords(req.user.id, req.params.id, { session: req.query.session }))),
  browse: asyncHandler(async (req, res) => res.json(await student.browseModules(req.user.id))),
  enrol: asyncHandler(async (req, res) => res.json(await student.enrol(req.user.id, req.body))),
  calendar: asyncHandler(async (req, res) => res.json(await monthDays(req.user.id, await enrolledModuleIds(req.user.id), req.query.month))),
  // one calendar day: each class with the student's status (?date=2026-10-12)
  calendarDay: asyncHandler(async (req, res) => res.json(await dayDetails(req.user.id, await enrolledModuleIds(req.user.id), req.query.date))),
};
