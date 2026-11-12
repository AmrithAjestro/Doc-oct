const authService = require('../services/auth.service');
const { ok } = require('../utils/helpers');

exports.registerUser = async (req, res) => ok(res, await authService.registerUser(req.body), {}, 201);

exports.registerDoctor = async (req, res) => ok(res, await authService.registerDoctor(req.body, req.file), {}, 201);

exports.login = async (req, res) => ok(res, await authService.login(req.body));

exports.me = async (req, res) => ok(res, req.user);

exports.updateMe = async (req, res) => ok(res, await authService.updateMe(req.user, req.body));

exports.changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  ok(res, { message: 'Password updated' });
};
