'use strict';

/**
 * When the doctor cannot attend (e.g. a critical emergency), the visit is moved to another free
 * time. The patient then accepts it, picks another time or cancels — the 24-hour lock does not
 * apply to them while awaiting_patient_reply is true.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn('appointments', 'awaiting_patient_reply', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, { transaction });
      await queryInterface.addColumn('appointments', 'doctor_move_reason', { type: Sequelize.TEXT }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('appointments', 'doctor_move_reason', { transaction });
      await queryInterface.removeColumn('appointments', 'awaiting_patient_reply', { transaction });
    });
  }
};
