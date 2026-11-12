const doctorService = require('../services/doctor.service');
const { ok } = require('../utils/helpers');

/* public */
exports.list = async (req, res) => {
  const { rows, meta } = await doctorService.listPublic(req.query);
  ok(res, rows, { meta });
};
exports.specializations = async (req, res) => ok(res, await doctorService.specializations());
exports.get = async (req, res) => ok(res, await doctorService.getPublic(req.params.id));
exports.availableSlots = async (req, res) => ok(res, await doctorService.availableSlots(req.params.id, req.query));
exports.reviews = async (req, res) => {
  const { rows, meta } = await doctorService.reviews(req.params.id, req.query);
  ok(res, rows, { meta });
};

/* signed-in doctor */
exports.myProfile = async (req, res) => ok(res, req.user.doctorProfile);
exports.updateProfile = async (req, res) => ok(res, await doctorService.updateProfile(req.user.doctorProfile, req.body));
exports.updatePhoto = async (req, res) => ok(res, await doctorService.updatePhoto(req.user.doctorProfile, req.file));
exports.removePhoto = async (req, res) => ok(res, await doctorService.removePhoto(req.user.doctorProfile));
exports.replaceCertificate = async (req, res) => ok(res, await doctorService.replaceCertificate(req.user.doctorProfile, req.file));
exports.mySlots = async (req, res) => ok(res, await doctorService.listOwnSlots(req.user.doctorProfile, req.query));
exports.createSlots = async (req, res) => {
  const result = await doctorService.createSlots(req.user.doctorProfile, req.body.slots);
  ok(res, result, {}, result.created.length ? 201 : 200);
};
exports.deleteSlot = async (req, res) => {
  await doctorService.deleteSlot(req.user.doctorProfile, req.params.id);
  ok(res, { id: req.params.id });
};
exports.unblockSlot = async (req, res) => ok(res, await doctorService.unblockSlot(req.user.doctorProfile, req.params.id));
