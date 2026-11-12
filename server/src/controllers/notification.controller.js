const { Op } = require('sequelize');
const { Notification } = require('../models');
const AppError = require('../utils/AppError');
const { ok, parsePagination, pageMeta } = require('../utils/helpers');

exports.list = async (req, res) => {
  const paging = parsePagination(req.query);
  const where = { userId: req.user.id };
  if (req.query.unread === 'true') where.readAt = null;
  const [{ rows, count }, unread] = await Promise.all([
    Notification.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit: paging.limit, offset: paging.offset }),
    Notification.count({ where: { userId: req.user.id, readAt: null } })
  ]);
  ok(res, rows, { meta: { ...pageMeta(paging, count), unread } });
};

exports.unreadCount = async (req, res) => ok(res, { unread: await Notification.count({ where: { userId: req.user.id, readAt: null } }) });

exports.markRead = async (req, res) => {
  const [updated] = await Notification.update({ readAt: new Date() }, { where: { id: req.params.id, userId: req.user.id, readAt: null } });
  if (!updated && !(await Notification.count({ where: { id: req.params.id, userId: req.user.id } }))) throw AppError.notFound('Notification not found');
  ok(res, { id: req.params.id });
};

exports.markAllRead = async (req, res) => {
  const [updated] = await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: { [Op.is]: null } } });
  ok(res, { updated });
};
