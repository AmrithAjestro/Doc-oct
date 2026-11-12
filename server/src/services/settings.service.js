const { Setting } = require('../models');

/** The single settings row, created with defaults the first time it is needed. */
async function getSettings(transaction) {
  const [settings] = await Setting.findOrCreate({ where: { id: 1 }, defaults: { id: 1 }, transaction });
  return settings;
}

module.exports = { getSettings };
