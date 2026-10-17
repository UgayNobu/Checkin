const { z, id, month, optionalText, optionalNumber, academicSession } = require('./common');

const deptParamSchema = z.object({ name: z.string().trim().min(1) });
const idParamSchema = z.object({ id });
const studentQuerySchema = z.object({ module: id, session: academicSession });
const sessionQuerySchema = z.object({ session: academicSession }); // ?session=AS2026 → an old semester
const historyQuerySchema = z.object({
  q: optionalText(100), department: optionalText(100),
  year: optionalNumber(z.number().int().min(1).max(6)),
  semester: optionalNumber(z.number().int().min(1).max(2)),
  session: academicSession,
});
const calendarQuerySchema = z.object({ student: id, module: id, month });

module.exports = { deptParamSchema, idParamSchema, studentQuerySchema, sessionQuerySchema, historyQuerySchema, calendarQuerySchema };
