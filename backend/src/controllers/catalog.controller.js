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
  // ?week=2026-10-19 (any day of that week) shows that week; default this week
  studentTimetable: asyncHandler(async (req, res) => res.json(await tt.forStudent(req.user.id, { week: req.query.week }))),
  teacherTimetable: asyncHandler(async (req, res) => res.json(await tt.forTutor(req.user.id, { week: req.query.week }))),
};
