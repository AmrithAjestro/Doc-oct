const { DataTypes, Model } = require('sequelize');
const { APPOINTMENT_STATUS } = require('../config/constants');

const money = (field) => ({
  type: DataTypes.DECIMAL(10, 2),
  allowNull: false,
  get() {
    const v = this.getDataValue(field);
    return v == null ? null : Number(v);
  }
});

module.exports = (sequelize) => {
  class Appointment extends Model {
    static associate(models) {
      Appointment.belongsTo(models.User, { as: 'patient', foreignKey: 'userId' });
      Appointment.belongsTo(models.DoctorProfile, { as: 'doctor', foreignKey: 'doctorId' });
      Appointment.belongsTo(models.Slot, { as: 'slot', foreignKey: 'slotId' });
      Appointment.hasOne(models.Prescription, { as: 'prescription', foreignKey: 'appointmentId' });
      Appointment.hasMany(models.Reminder, { as: 'reminders', foreignKey: 'appointmentId' });
    }
  }

  Appointment.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      doctorId: { type: DataTypes.UUID, allowNull: false },
      // Nullable: a slot may be deleted later; the appointment keeps its own copy of the times.
      slotId: { type: DataTypes.UUID },
      startAt: { type: DataTypes.DATE, allowNull: false },
      endAt: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM(...Object.values(APPOINTMENT_STATUS)),
        allowNull: false,
        defaultValue: APPOINTMENT_STATUS.PENDING_CONFIRMATION
      },
      reason: { type: DataTypes.TEXT },
      // Price snapshot taken at booking time.
      doctorFee: money('doctorFee'),
      commission: money('commission'),
      totalFee: money('totalFee'),
      confirmedAt: { type: DataTypes.DATE },
      completedAt: { type: DataTypes.DATE },
      cancelledAt: { type: DataTypes.DATE },
      cancelledBy: { type: DataTypes.STRING(20) },
      cancelReason: { type: DataTypes.TEXT },
      rescheduleCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      autoRescheduleCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      previousStartAt: { type: DataTypes.DATE },
      doctorNotes: { type: DataTypes.TEXT }
    },
    { sequelize, modelName: 'Appointment', tableName: 'appointments', underscored: true }
  );

  return Appointment;
};
