const waitlist = require('../services/waitlist.service');
const { ok } = require('../utils/helpers');

exports.mine = async (req, res) => ok(res, await waitlist.mine(req.user));
exports.join = async (req, res) => ok(res, await waitlist.join(req.user, req.params.id, req.body), {}, 201);
exports.leave = async (req, res) => {
  await waitlist.leave(req.user, req.params.id);
  ok(res, { id: req.params.id });
};
