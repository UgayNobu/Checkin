const { asyncHandler } = require('../utils/errors');
const { sendCsv } = require('../utils/csv');
const t = require('../services/tutor.service');

module.exports = {
  dashboard: asyncHandler(async (req, res) => res.json(await t.dashboard(req.user.id))),
  modules: asyncHandler(async (req, res) => res.json(await t.myModules(req.user.id))),
  modulesPdf: asyncHandler(async (req, res) => t.writeModulesPdf(res, req.user)),
  // Returns the rows array (same shape the frontend already used).
  // Returns the rows array (same shape the frontend already used); a type with no sessions yet shows 0.
  records: asyncHandler(async (req, res) => res.json((await t.moduleRecords(req.params.moduleId, req.user.id)).rows
    .map((r) => ({ ...r, theory: r.theory ?? 0, practical: r.practical ?? 0, total: r.total ?? 0 })))),
  studentRecord: asyncHandler(async (req, res) => res.json(await t.studentRecord(req.params.moduleId, req.params.studentId, req.user.id))),
  reports: asyncHandler(async (req, res) => res.json(await t.reports(req.user.id))),
  recordsCsv: asyncHandler(async (req, res) => {
    const data = await t.exportRows(req.params.moduleId, req.user.id);
    sendCsv(res, `${data.m.code}-attendance.csv`, t.CSV_HEADER, t.csvRows(data.rows));
  }),
  recordsPdf: asyncHandler(async (req, res) => t.writeRecordsPdf(res, await t.exportRows(req.params.moduleId, req.user.id))),
};
