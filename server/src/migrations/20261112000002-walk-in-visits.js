'use strict';

/**
 * Walk-in visits: a patient who comes to the clinic without booking (often an emergency).
 * They have no slot (slot_id stays null), start immediately and carry no platform commission.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'appointments',
        'visit_type',
        { type: Sequelize.ENUM('booked', 'walk_in'), allowNull: false, defaultValue: 'booked' },
        { transaction }
      );
      await queryInterface.addColumn('appointments', 'is_emergency', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('appointments', 'is_emergency', { transaction });
      await queryInterface.removeColumn('appointments', 'visit_type', { transaction });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_appointments_visit_type"', { transaction });
    });
  }
};
