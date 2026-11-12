const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
      Notification.belongsTo(models.Appointment, { as: 'appointment', foreignKey: 'appointmentId' });
    }
  }

  Notification.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      appointmentId: { type: DataTypes.UUID },
      type: { type: DataTypes.STRING(40), allowNull: false },
      title: { type: DataTypes.STRING(160), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      readAt: { type: DataTypes.DATE }
    },
    { sequelize, modelName: 'Notification', tableName: 'notifications', underscored: true }
  );

  return Notification;
};
