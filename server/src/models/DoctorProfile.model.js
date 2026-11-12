const { DataTypes, Model } = require('sequelize');
const { DOCTOR_STATUS } = require('../config/constants');

const money = (field) => ({
  type: DataTypes.DECIMAL(10, 2),
  allowNull: false,
  defaultValue: 0,
  get() {
    const v = this.getDataValue(field);
    return v == null ? null : Number(v);
  }
});

module.exports = (sequelize) => {
  class DoctorProfile extends Model {
    static associate(models) {
      DoctorProfile.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
      DoctorProfile.belongsTo(models.User, { as: 'reviewer', foreignKey: 'reviewedBy' });
      DoctorProfile.hasMany(models.Slot, { as: 'slots', foreignKey: 'doctorId' });
      DoctorProfile.hasMany(models.Appointment, { as: 'appointments', foreignKey: 'doctorId' });
    }

    /** The certificate is private: only its presence and name leave the server. */
    toJSON() {
      const values = { ...this.get() };
      values.hasCertificate = Boolean(values.certificatePath);
      delete values.certificatePath;
      return values;
    }
  }

  DoctorProfile.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, unique: true },
      specialization: { type: DataTypes.STRING(120), allowNull: false },
      qualification: { type: DataTypes.STRING(200) },
      experienceYears: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      fee: money('fee'),
      bio: { type: DataTypes.TEXT },
      clinicAddress: { type: DataTypes.STRING(255) },
      certificatePath: { type: DataTypes.STRING },
      certificateName: { type: DataTypes.STRING },
      certificateMimeType: { type: DataTypes.STRING(80) },
      status: {
        type: DataTypes.ENUM(...Object.values(DOCTOR_STATUS)),
        allowNull: false,
        defaultValue: DOCTOR_STATUS.PENDING
      },
      rejectionReason: { type: DataTypes.TEXT },
      reviewedAt: { type: DataTypes.DATE },
      reviewedBy: { type: DataTypes.UUID }
    },
    { sequelize, modelName: 'DoctorProfile', tableName: 'doctor_profiles', underscored: true }
  );

  return DoctorProfile;
};
