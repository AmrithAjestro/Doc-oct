'use strict';

/**
 * Records that the doctor told the patient they are running late (an emergency). Such a patient
 * may cancel or move the visit even inside the 24-hour lock.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn('appointments', 'delay_notified_at', { type: Sequelize.DATE }, { transaction });
      await queryInterface.addColumn('appointments', 'delay_minutes', { type: Sequelize.INTEGER }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('appointments', 'delay_minutes', { transaction });
      await queryInterface.removeColumn('appointments', 'delay_notified_at', { transaction });
    });
  }
};
