'use strict';

/**
 * Waitlist: a patient asks to be told when a doctor has a free time (optionally on one date).
 * When a slot opens (cancellation, reopened slot, new availability) waiting patients are notified.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('waitlist_entries', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      doctor_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'doctor_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      // Optional: only openings on this date (the patient's local calendar day, YYYY-MM-DD).
      preferred_date: { type: Sequelize.DATEONLY },
      last_notified_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });
    await queryInterface.addIndex('waitlist_entries', ['user_id', 'doctor_id'], { unique: true });
    await queryInterface.addIndex('waitlist_entries', ['doctor_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('waitlist_entries');
  }
};
