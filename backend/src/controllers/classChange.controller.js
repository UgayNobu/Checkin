// The class_changes table is itself the record of who changed what (created_by, created_at).
const { asyncHandler } = require('../utils/errors');
const svc = require('../services/classChange.service');
const swaps = require('../services/swap.service');

module.exports = {
  list: asyncHandler(async (req, res) => res.json(await svc.listFor(req.user, req.query))),
  check: asyncHandler(async (req, res) => res.json(await svc.check(req.user.id, req.query))),
  tutors: asyncHandler(async (req, res) => res.json(await svc.tutors(req.user.id))),
  create: asyncHandler(async (req, res) => res.status(201).json(await svc.create(req.user.id, req.body))),
  remove: asyncHandler(async (req, res) => res.json(await svc.remove(req.user.id, req.params.id))),
  management: asyncHandler(async (req, res) => res.json(await svc.forManagement(req.query))),
  // swapping classes between two tutors
  swapOptions: asyncHandler(async (req, res) => res.json(await swaps.optionsFor(req.user.id, req.query))),
  swapList: asyncHandler(async (req, res) => res.json(await swaps.list(req.user.id))),
  swapRequest: asyncHandler(async (req, res) => res.status(201).json(await swaps.request(req.user.id, req.body))),
  swapAccept: asyncHandler(async (req, res) => res.json(await swaps.accept(req.user.id, req.params.id))),
  swapReject: asyncHandler(async (req, res) => res.json(await swaps.reject(req.user.id, req.params.id))),
  swapCancel: asyncHandler(async (req, res) => res.json(await swaps.cancel(req.user.id, req.params.id))),
};
