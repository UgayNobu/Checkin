const { asyncHandler } = require('../utils/errors');
const { sendCsv } = require('../utils/csv');
const a = require('../services/admin.service');
const audit = require('../services/audit.service');
const academic = require('../services/academic.service');

module.exports = {
  // Semesters
  semesters: asyncHandler(async (req, res) => res.json(await academic.list())),
  createSemester: asyncHandler(async (req, res) => res.status(201).json(await academic.create(req.user.id, req.body))),
  makeCurrentSemester: asyncHandler(async (req, res) => res.json(await academic.makeCurrent(req.user.id, req.params.code, req.body))),
  createTutor: asyncHandler(async (req, res) => res.status(201).json(await a.createTutor(req.user.id, req.body))),
  overview: asyncHandler(async (req, res) => res.json(await a.overview())),
  programs: asyncHandler(async (req, res) => res.json(await a.listPrograms())),
  createProgram: asyncHandler(async (req, res) => res.json(await a.createProgram(req.user.id, req.body.name))),
  renameProgram: asyncHandler(async (req, res) => res.json(await a.renameProgram(req.user.id, req.body.from, req.body.to))),
  programmeReport: asyncHandler(async (req, res) => res.json(await a.programmeReport(req.params.name))),
  programmeCsv: asyncHandler(async (req, res) => {
    const r = await a.programmeReport(req.params.name);
    sendCsv(res, `${req.params.name.replace(/[^\w.-]+/g, '_')}-report.csv`, ['Student ID', 'Name', 'Programme', 'Year', 'Overall %', 'Status'],
      r.rows.map((x) => [x.userId, x.name, x.programme, x.year, x.pct, x.status]));
  }),
  users: asyncHandler(async (req, res) => res.json(await a.listUsers(req.query))),
  patchUser: asyncHandler(async (req, res) => res.json(await a.patchUser(req.user.id, req.params.id, req.body))),
  modules: asyncHandler(async (req, res) => res.json(await a.listModules(req.query))),
  createModule: asyncHandler(async (req, res) => res.json(await a.saveModule(req.user.id, null, req.body))),
  updateModule: asyncHandler(async (req, res) => res.json(await a.saveModule(req.user.id, req.params.id, req.body))),
  pendingTutors: asyncHandler(async (req, res) => res.json(await a.pendingTutors())),
  approveTutor: asyncHandler(async (req, res) => res.json(await a.approveTutor(req.user.id, req.params.id))),
  rejectTutor: asyncHandler(async (req, res) => res.json(await a.rejectTutor(req.user.id, req.params.id))),
  auditLogs: asyncHandler(async (req, res) => res.json(await audit.listAuditLogs(req.query))),
  auditActions: asyncHandler(async (req, res) => res.json(await audit.listAuditActions())),
  atRisk: asyncHandler(async (req, res) => res.json(await a.atRisk(req.query))),
  atRiskCsv: asyncHandler(async (req, res) => {
    const { rows } = await a.atRisk(req.query);
    sendCsv(res, 'at-risk-students.csv', ['Student ID', 'Name', 'Department', 'Module code', 'Module', 'Attendance %', 'Sessions'],
      rows.map((r) => [r.userId, r.name, r.department, r.module.code, r.module.name, r.pct, r.sessions]));
  }),
  lowAttendanceJob: asyncHandler(async (req, res) => res.json(await a.runLowAttendanceJob(req.user.id))),
};
