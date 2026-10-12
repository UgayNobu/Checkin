const { asyncHandler } = require('../utils/errors');
const mod = require('../services/module.service');

module.exports = {
  setKey: asyncHandler(async (req, res) => res.json(await mod.setEnrolmentKey(req.params.id, req.user.id, req.body))),
  suggestKey: asyncHandler(async (req, res) => res.json(await mod.suggestKey(req.params.id, req.user.id))),
  students: asyncHandler(async (req, res) => res.json(await mod.listStudents(req.params.id, req.user))),
  addStudent: asyncHandler(async (req, res) => res.json(await mod.addStudent(req.params.id, req.user.id, req.body.userId))),
  removeStudent: asyncHandler(async (req, res) => res.json(await mod.removeStudent(req.params.id, req.user, req.params.studentId))),
};
