'use strict';

/**
 * "Running late" state of a doctor (after a walk-in / emergency). While running_late_until is in the
 * future: slots freed in that window are blocked instead of reopened, the waitlist is not told about
 * them, and patients booking a time in the window see a warning first.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn('doctor_profiles', 'running_late_minutes', { type: Sequelize.INTEGER }, { transaction });
      await queryInterface.addColumn('doctor_profiles', 'running_late_until', { type: Sequelize.DATE }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('doctor_profiles', 'running_late_until', { transaction });
      await queryInterface.removeColumn('doctor_profiles', 'running_late_minutes', { transaction });
    });
  }
};
