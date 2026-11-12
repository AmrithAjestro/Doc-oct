const { DataTypes, Model } = require('sequelize');
const { SLOT_STATUS } = require('../config/constants');

module.exports = (sequelize) => {
  class Slot extends Model {
    static associate(models) {
      Slot.belongsTo(models.DoctorProfile, { as: 'doctor', foreignKey: 'doctorId' });
      Slot.hasMany(models.Appointment, { as: 'appointments', foreignKey: 'slotId' });
    }
  }

  Slot.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      doctorId: { type: DataTypes.UUID, allowNull: false },
      startAt: { type: DataTypes.DATE, allowNull: false },
      endAt: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM(...Object.values(SLOT_STATUS)),
        allowNull: false,
        defaultValue: SLOT_STATUS.AVAILABLE
      }
    },
    { sequelize, modelName: 'Slot', tableName: 'slots', underscored: true }
  );

  return Slot;
};
