const { DataTypes, Model } = require('sequelize');

/** A patient's rating (1-5) and optional comment for one completed appointment. */
module.exports = (sequelize) => {
  class Review extends Model {
    static associate(models) {
      Review.belongsTo(models.Appointment, { as: 'appointment', foreignKey: 'appointmentId' });
      Review.belongsTo(models.DoctorProfile, { as: 'doctor', foreignKey: 'doctorId' });
      Review.belongsTo(models.User, { as: 'patient', foreignKey: 'userId' });
    }
  }

  Review.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      appointmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
      doctorId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
      comment: { type: DataTypes.TEXT }
    },
    { sequelize, modelName: 'Review', tableName: 'reviews', underscored: true }
  );

  return Review;
};
