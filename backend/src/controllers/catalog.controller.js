const { asyncHandler } = require('../utils/errors');
const catalog = require('../services/catalog.service');
const tt = require('../services/timetable.service');
const academic = require('../services/academic.service');

module.exports = {
  departments: asyncHandler(async (req, res) => res.json(await catalog.listDepartments())),
  programs: asyncHandler(async (req, res) => res.json(await catalog.listPrograms(req.query))),
  semesters: asyncHandler(async (req, res) => res.json(await academic.list())),
  currentSemester: asyncHandler(async (req, res) => res.json(await academic.current())),
  rooms: asyncHandler(async (req, res) => res.json(await tt.listRooms())),
  timetable: asyncHandler(async (req, res) => res.json(await tt.forProgramme(req.query))),
  studentTimetable: asyncHandler(async (req, res) => res.json(await tt.forStudent(req.user.id))),
  teacherTimetable: asyncHandler(async (req, res) => res.json(await tt.forTutor(req.user.id))),
};
