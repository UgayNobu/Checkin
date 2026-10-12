const { asyncHandler } = require('../utils/errors');
const student = require('../services/student.service');
const { monthDays, enrolledModuleIds } = require('../services/stats.service');

module.exports = {
  dashboard: asyncHandler(async (req, res) => res.json(await student.dashboard(req.user.id))),
  summary: asyncHandler(async (req, res) => res.json(await student.summary(req.user.id))),
  moduleRecords: asyncHandler(async (req, res) => res.json(await student.moduleRecords(req.user.id, req.params.id))),
  browse: asyncHandler(async (req, res) => res.json(await student.browseModules(req.user.id))),
  enrol: asyncHandler(async (req, res) => res.json(await student.enrol(req.user.id, req.body))),
  calendar: asyncHandler(async (req, res) => res.json(await monthDays(req.user.id, await enrolledModuleIds(req.user.id), req.query.month))),
};
