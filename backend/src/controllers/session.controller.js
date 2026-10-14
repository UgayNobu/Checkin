const { asyncHandler } = require('../utils/errors');
const s = require('../services/session.service');

module.exports = {
  start: asyncHandler(async (req, res) => res.json(await s.startSession(req.user.id, req.body))),
  mine: asyncHandler(async (req, res) => res.json(await s.listMine(req.user.id, req.query))),
  live: asyncHandler(async (req, res) => res.json(await s.live(req.params.id, req.user.id))),
  roster: asyncHandler(async (req, res) => res.json(await s.roster(req.params.id, req.user.id))),
  end: asyncHandler(async (req, res) => res.json(await s.endSession(req.params.id, req.user.id))),
  accept: asyncHandler(async (req, res) => res.json(await s.decideFlagged(req.params.id, req.params.attendanceId, req.user.id, true, req.body?.note))),
  reject: asyncHandler(async (req, res) => res.json(await s.decideFlagged(req.params.id, req.params.attendanceId, req.user.id, false, req.body?.note))),
  mark: asyncHandler(async (req, res) => res.json(await s.markManually(req.params.id, req.user.id, req.params.studentId, req.body?.status !== 'absent'))),
};
