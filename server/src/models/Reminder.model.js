const { DataTypes, Model } = require('sequelize');
const { REMINDER_TYPES } = require('../config/constants');

/** A notification due at a set time. Stored (not computed) so reminders survive restarts and are sent once. */
module.exports = (sequelize) => {
  class Reminder extends Model {
    static associate(models) {
      Reminder.belongsTo(models.Appointment, { as: 'appointment', foreignKey: 'appointmentId' });
    }
  }

  Reminder.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      appointmentId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.ENUM(...Object.values(REMINDER_TYPES)), allowNull: false },
      sendAt: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'sent', 'skipped'), allowNull: false, defaultValue: 'pending' },
      sentAt: { type: DataTypes.DATE }
    },
    { sequelize, modelName: 'Reminder', tableName: 'reminders', underscored: true }
  );

  return Reminder;
};
