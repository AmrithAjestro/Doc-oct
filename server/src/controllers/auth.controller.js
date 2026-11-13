const authService = require('../services/auth.service');
const { ok } = require('../utils/helpers');

exports.registerUser = async (req, res) => ok(res, await authService.registerUser(req.body), {}, 201);

exports.registerDoctor = async (req, res) => ok(res, await authService.registerDoctor(req.body, req.file), {}, 201);

exports.login = async (req, res) => ok(res, await authService.login(req.body, { ip: req.ip, device: (req.get('user-agent') || '').slice(0, 120) }));

exports.me = async (req, res) => ok(res, req.user);

exports.updateMe = async (req, res) => ok(res, await authService.updateMe(req.user, req.body));

exports.changePassword = async (req, res) => ok(res, await authService.changePassword(req.user.id, req.body));

exports.logoutEverywhere = async (req, res) => {
  await authService.logoutEverywhere(req.user);
  ok(res, { message: 'Signed out on every device' });
};

exports.forgotPassword = async (req, res) => {
  await authService.requestPasswordReset(req.body);
  ok(res, { message: 'If an account exists for this e-mail, a reset link has been sent.' });
};

exports.resetPassword = async (req, res) => ok(res, await authService.resetPassword(req.body));
