const { DataTypes, Model } = require('sequelize');
const { APPOINTMENT_STATUS, VISIT_TYPES } = require('../config/constants');

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
      Appointment.hasOne(models.Review, { as: 'review', foreignKey: 'appointmentId' });
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
      // walk_in: came to the clinic without booking; no slot, starts at once, no platform commission.
      visitType: { type: DataTypes.ENUM(...Object.values(VISIT_TYPES)), allowNull: false, defaultValue: VISIT_TYPES.BOOKED },
      isEmergency: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Set when the doctor could not attend and moved the visit; the patient may accept, move or cancel freely.
      awaitingPatientReply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      doctorMoveReason: { type: DataTypes.TEXT },
      // The doctor said they are running late; the patient may then cancel or move freely.
      delayNotifiedAt: { type: DataTypes.DATE },
      delayMinutes: { type: DataTypes.INTEGER },
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
