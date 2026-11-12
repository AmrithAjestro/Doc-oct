const { DataTypes, Model } = require('sequelize');

/** A patient waiting to hear when a doctor has a free time (optionally on one date). */
module.exports = (sequelize) => {
  class WaitlistEntry extends Model {
    static associate(models) {
      WaitlistEntry.belongsTo(models.User, { as: 'patient', foreignKey: 'userId' });
      WaitlistEntry.belongsTo(models.DoctorProfile, { as: 'doctor', foreignKey: 'doctorId' });
    }
  }

  WaitlistEntry.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      doctorId: { type: DataTypes.UUID, allowNull: false },
      preferredDate: { type: DataTypes.DATEONLY },
      lastNotifiedAt: { type: DataTypes.DATE }
    },
    { sequelize, modelName: 'WaitlistEntry', tableName: 'waitlist_entries', underscored: true }
  );

  return WaitlistEntry;
};
