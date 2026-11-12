const { DataTypes, Model } = require('sequelize');
const { COMMISSION_TYPES } = require('../config/constants');

/** Single-row table (id = 1) holding platform-wide settings. */
module.exports = (sequelize) => {
  class Setting extends Model {
    toJSON() {
      const values = { ...this.get() };
      values.logoUrl = values.logoPath ? `/uploads/branding/${values.logoPath}` : null;
      delete values.logoPath;
      return values;
    }
  }

  Setting.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      appName: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'DocBook' },
      tagline: { type: DataTypes.STRING(160) },
      logoPath: { type: DataTypes.STRING },
      commissionType: {
        type: DataTypes.ENUM(...Object.values(COMMISSION_TYPES)),
        allowNull: false,
        defaultValue: COMMISSION_TYPES.PERCENTAGE
      },
      commissionValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 10,
        get() {
          return Number(this.getDataValue('commissionValue'));
        }
      },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      supportEmail: { type: DataTypes.STRING(160) }
    },
    { sequelize, modelName: 'Setting', tableName: 'settings', underscored: true }
  );

  return Setting;
};
