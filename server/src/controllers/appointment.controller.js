const appointmentService = require('../services/appointment.service');
const { ok } = require('../utils/helpers');

// Every mutation answers with the fresh appointment (incl. its allowed actions) so the UI just re-renders.
const fresh = (req, id) => appointmentService.getById(req.user, id);

exports.list = async (req, res) => {
  const { rows, meta } = await appointmentService.list(req.user, req.query);
  ok(res, rows, { meta });
};

exports.get = async (req, res) => ok(res, await fresh(req, req.params.id));

exports.book = async (req, res) => {
  const appt = await appointmentService.book(req.user, req.body);
  ok(res, await fresh(req, appt.id), {}, 201);
};

exports.confirm = async (req, res) => {
  await appointmentService.confirmAttendance(req.user, req.params.id);
  ok(res, await fresh(req, req.params.id));
};

exports.reschedulePreview = async (req, res) => ok(res, await appointmentService.previewReschedule(req.user, req.params.id));

exports.reschedule = async (req, res) => {
  await appointmentService.reschedule(req.user, req.params.id, req.body);
  ok(res, await fresh(req, req.params.id));
};

exports.cancel = async (req, res) => {
  await appointmentService.cancel(req.user, req.params.id, req.body);
  ok(res, await fresh(req, req.params.id));
};

exports.complete = async (req, res) => {
  await appointmentService.complete(req.user, req.params.id, req.body);
  ok(res, await fresh(req, req.params.id));
};

exports.noShow = async (req, res) => {
  await appointmentService.markNoShow(req.user, req.params.id);
  ok(res, await fresh(req, req.params.id));
};

exports.savePrescription = async (req, res) => {
  await appointmentService.savePrescription(req.user, req.params.id, req.body);
  ok(res, await fresh(req, req.params.id));
};
