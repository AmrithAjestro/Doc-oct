const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class Prescription extends Model {
    static associate(models) {
      Prescription.belongsTo(models.Appointment, { as: 'appointment', foreignKey: 'appointmentId' });
    }
  }

  Prescription.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      appointmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
      diagnosis: { type: DataTypes.TEXT },
      // [{ name, dosage, frequency, duration, instructions }]
      medicines: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      advice: { type: DataTypes.TEXT },
      followUpDate: { type: DataTypes.DATEONLY }
    },
    { sequelize, modelName: 'Prescription', tableName: 'prescriptions', underscored: true }
  );

  return Prescription;
};
