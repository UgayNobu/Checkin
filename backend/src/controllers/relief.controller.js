const { asyncHandler } = require('../utils/errors');
const r = require('../services/relief.service');

module.exports = {
  submit: asyncHandler(async (req, res) => res.json(await r.submit(req.user, req.body, req.file))),
  mine: asyncHandler(async (req, res) => res.json(await r.listMine(req.user.id))),
  list: asyncHandler(async (req, res) => res.json(await r.listForStaff(req.user, req.query))),
  getOne: asyncHandler(async (req, res) => res.json(await r.getOne(req.user, req.params.id))),
  review: asyncHandler(async (req, res) => res.json(await r.review(req.user, req.params.id, req.body))),
};
