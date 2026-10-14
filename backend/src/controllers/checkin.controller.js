const { asyncHandler } = require('../utils/errors');
const { checkIn } = require('../services/checkin.service');

module.exports = {
  checkIn: asyncHandler(async (req, res) => res.json(await checkIn(req.user, req.body))),
};
