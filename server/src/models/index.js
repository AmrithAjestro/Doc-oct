const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, dbConfig);

const models = {
  User: require('./User.model')(sequelize),
  DoctorProfile: require('./DoctorProfile.model')(sequelize),
  Slot: require('./Slot.model')(sequelize),
  Appointment: require('./Appointment.model')(sequelize),
  Prescription: require('./Prescription.model')(sequelize),
  Notification: require('./Notification.model')(sequelize),
  Reminder: require('./Reminder.model')(sequelize),
  Setting: require('./Setting.model')(sequelize),
  Review: require('./Review.model')(sequelize),
  WaitlistEntry: require('./WaitlistEntry.model')(sequelize)
};

Object.values(models).forEach((model) => model.associate?.(models));

module.exports = { sequelize, Sequelize, ...models };
