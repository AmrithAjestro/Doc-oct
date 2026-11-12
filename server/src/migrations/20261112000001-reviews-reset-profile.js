'use strict';

/**
 * - users: token_version (bumped to revoke every issued login token), password reset token + expiry
 * - doctor_profiles: photo, languages, clinic hours
 * - reviews: one rating (1-5) and optional comment per completed appointment
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      await queryInterface.addColumn('users', 'token_version', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, opts);
      await queryInterface.addColumn('users', 'reset_token_hash', { type: Sequelize.STRING(64) }, opts);
      await queryInterface.addColumn('users', 'reset_token_expires_at', { type: Sequelize.DATE }, opts);

      await queryInterface.addColumn('doctor_profiles', 'photo_path', { type: Sequelize.STRING }, opts);
      await queryInterface.addColumn('doctor_profiles', 'languages', { type: Sequelize.STRING(200) }, opts);
      await queryInterface.addColumn('doctor_profiles', 'clinic_hours', { type: Sequelize.STRING(200) }, opts);

      await queryInterface.createTable(
        'reviews',
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') },
          appointment_id: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
            references: { model: 'appointments', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          doctor_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'doctor_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          rating: { type: Sequelize.INTEGER, allowNull: false },
          comment: { type: Sequelize.TEXT },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
        },
        opts
      );
      await queryInterface.addIndex('reviews', ['doctor_id', 'created_at'], opts);
      await queryInterface.sequelize.query('ALTER TABLE reviews ADD CONSTRAINT review_rating_range CHECK (rating BETWEEN 1 AND 5)', opts);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      await queryInterface.dropTable('reviews', opts);
      for (const c of ['photo_path', 'languages', 'clinic_hours']) await queryInterface.removeColumn('doctor_profiles', c, opts);
      for (const c of ['token_version', 'reset_token_hash', 'reset_token_expires_at']) await queryInterface.removeColumn('users', c, opts);
    });
  }
};
