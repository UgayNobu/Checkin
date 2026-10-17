const { z, id } = require('./common');

const recordParamsSchema = z.object({ moduleId: id });
const studentRecordParamsSchema = z.object({ moduleId: id, studentId: id });

module.exports = { recordParamsSchema, studentRecordParamsSchema };
