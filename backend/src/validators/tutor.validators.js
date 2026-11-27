const { z, id } = require('./common');

const recordParamsSchema = z.object({ moduleId: id });
const studentRecordParamsSchema = z.object({ moduleId: id, studentId: id });
const studentParamsSchema = z.object({ studentId: id });

module.exports = { recordParamsSchema, studentRecordParamsSchema, studentParamsSchema };
