const { DataTypes, Model } = require('sequelize');
const { ROLES } = require('../config/constants');

module.exports = (sequelize) => {
  class User extends Model {
    static associate(models) {
      User.hasOne(models.DoctorProfile, { as: 'doctorProfile', foreignKey: 'userId' });
      User.hasMany(models.Appointment, { as: 'appointments', foreignKey: 'userId' });
      User.hasMany(models.Notification, { as: 'notifications', foreignKey: 'userId' });
    }

    toJSON() {
      const values = { ...this.get() };
      delete values.passwordHash;
      return values;
    }
  }

  User.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
        set(value) {
          this.setDataValue('email', String(value).trim().toLowerCase());
        }
      },
      phone: { type: DataTypes.STRING(20) },
      passwordHash: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.ENUM(...Object.values(ROLES)), allowNull: false, defaultValue: ROLES.USER },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      underscored: true,
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: { attributes: { include: ['passwordHash'] } } }
    }
  );

  return User;
};
