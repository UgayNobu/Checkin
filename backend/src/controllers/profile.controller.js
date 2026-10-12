const { asyncHandler } = require('../utils/errors');
const profile = require('../services/profile.service');

module.exports = {
  get: asyncHandler(async (req, res) => res.json(await profile.getProfile(req.user.id))),
  update: asyncHandler(async (req, res) => res.json(await profile.updateProfile(req.user.id, req.body))),
  uploadAvatar: asyncHandler(async (req, res) => res.json(await profile.setAvatar(req.user.id, req.file))),
  removeAvatar: asyncHandler(async (req, res) => res.json(await profile.removeAvatar(req.user.id))),
};
