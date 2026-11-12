'use strict';

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  primaryKey: true,
  allowNull: false,
  defaultValue: Sequelize.literal('gen_random_uuid()')
});

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
});

const fk = (Sequelize, table, { allowNull = false, onDelete = 'CASCADE' } = {}) => ({
  type: Sequelize.UUID,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opts = { transaction };

      await queryInterface.createTable(
        'users',
        {
          id: uuidPk(Sequelize),
          name: { type: Sequelize.STRING(120), allowNull: false },
          email: { type: Sequelize.STRING(160), allowNull: false, unique: true },
          phone: { type: Sequelize.STRING(20) },
          password_hash: { type: Sequelize.STRING, allowNull: false },
          role: { type: Sequelize.ENUM('user', 'doctor', 'admin'), allowNull: false, defaultValue: 'user' },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.addIndex('users', ['role'], opts);

      await queryInterface.createTable(
        'doctor_profiles',
        {
          id: uuidPk(Sequelize),
          user_id: { ...fk(Sequelize, 'users'), unique: true },
          specialization: { type: Sequelize.STRING(120), allowNull: false },
          qualification: { type: Sequelize.STRING(200) },
          experience_years: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          fee: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
          bio: { type: Sequelize.TEXT },
          clinic_address: { type: Sequelize.STRING(255) },
          certificate_path: { type: Sequelize.STRING },
          certificate_name: { type: Sequelize.STRING },
          certificate_mime_type: { type: Sequelize.STRING(80) },
          status: {
            type: Sequelize.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending'
          },
          rejection_reason: { type: Sequelize.TEXT },
          reviewed_at: { type: Sequelize.DATE },
          reviewed_by: fk(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.addIndex('doctor_profiles', ['status'], opts);
      await queryInterface.addIndex('doctor_profiles', ['specialization'], opts);
      await queryInterface.sequelize.query(
        'ALTER TABLE doctor_profiles ADD CONSTRAINT doctor_fee_non_negative CHECK (fee >= 0)',
        opts
      );

      await queryInterface.createTable(
        'slots',
        {
          id: uuidPk(Sequelize),
          doctor_id: fk(Sequelize, 'doctor_profiles'),
          start_at: { type: Sequelize.DATE, allowNull: false },
          end_at: { type: Sequelize.DATE, allowNull: false },
          status: {
            type: Sequelize.ENUM('available', 'booked', 'blocked'),
            allowNull: false,
            defaultValue: 'available'
          },
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.addIndex('slots', ['doctor_id', 'start_at'], { unique: true, ...opts });
      await queryInterface.addIndex('slots', ['status', 'start_at'], opts);
      await queryInterface.sequelize.query(
        'ALTER TABLE slots ADD CONSTRAINT slot_end_after_start CHECK (end_at > start_at)',
        opts
      );

      await queryInterface.createTable(
        'appointments',
        {
          id: uuidPk(Sequelize),
          user_id: fk(Sequelize, 'users'),
          doctor_id: fk(Sequelize, 'doctor_profiles'),
          slot_id: fk(Sequelize, 'slots', { allowNull: true, onDelete: 'SET NULL' }),
          start_at: { type: Sequelize.DATE, allowNull: false },
          end_at: { type: Sequelize.DATE, allowNull: false },
          status: {
            type: Sequelize.ENUM('pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show'),
            allowNull: false,
            defaultValue: 'pending_confirmation'
          },
          reason: { type: Sequelize.TEXT },
          doctor_fee: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
          commission: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
          total_fee: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
          confirmed_at: { type: Sequelize.DATE },
          completed_at: { type: Sequelize.DATE },
          cancelled_at: { type: Sequelize.DATE },
          cancelled_by: { type: Sequelize.STRING(20) },
          cancel_reason: { type: Sequelize.TEXT },
          reschedule_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          auto_reschedule_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          previous_start_at: { type: Sequelize.DATE },
          doctor_notes: { type: Sequelize.TEXT },
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.addIndex('appointments', ['user_id', 'start_at'], opts);
      await queryInterface.addIndex('appointments', ['doctor_id', 'start_at'], opts);
      await queryInterface.addIndex('appointments', ['status', 'start_at'], opts);
      // The last line of defence against double booking: one live appointment per slot,
      // whatever the application code does.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX appointments_one_active_per_slot ON appointments (slot_id)
         WHERE status IN ('pending_confirmation', 'confirmed')`,
        opts
      );

      await queryInterface.createTable(
        'prescriptions',
        {
          id: uuidPk(Sequelize),
          appointment_id: { ...fk(Sequelize, 'appointments'), unique: true },
          diagnosis: { type: Sequelize.TEXT },
          medicines: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          advice: { type: Sequelize.TEXT },
          follow_up_date: { type: Sequelize.DATEONLY },
          ...timestamps(Sequelize)
        },
        opts
      );

      await queryInterface.createTable(
        'notifications',
        {
          id: uuidPk(Sequelize),
          user_id: fk(Sequelize, 'users'),
          appointment_id: fk(Sequelize, 'appointments', { allowNull: true, onDelete: 'SET NULL' }),
          type: { type: Sequelize.STRING(40), allowNull: false },
          title: { type: Sequelize.STRING(160), allowNull: false },
          message: { type: Sequelize.TEXT, allowNull: false },
          read_at: { type: Sequelize.DATE },
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.addIndex('notifications', ['user_id', 'created_at'], opts);
      await queryInterface.addIndex('notifications', ['user_id', 'read_at'], opts);

      await queryInterface.createTable(
        'reminders',
        {
          id: uuidPk(Sequelize),
          appointment_id: fk(Sequelize, 'appointments'),
          type: { type: Sequelize.ENUM('confirm', 'day', 'hour', 'quarter'), allowNull: false },
          send_at: { type: Sequelize.DATE, allowNull: false },
          status: { type: Sequelize.ENUM('pending', 'sent', 'skipped'), allowNull: false, defaultValue: 'pending' },
          sent_at: { type: Sequelize.DATE },
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.addIndex('reminders', ['status', 'send_at'], opts);
      await queryInterface.addIndex('reminders', ['appointment_id'], opts);

      await queryInterface.createTable(
        'settings',
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, defaultValue: 1 },
          app_name: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'DocBook' },
          tagline: { type: Sequelize.STRING(160) },
          logo_path: { type: Sequelize.STRING },
          commission_type: { type: Sequelize.ENUM('percentage', 'flat'), allowNull: false, defaultValue: 'percentage' },
          commission_value: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 10 },
          currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'INR' },
          support_email: { type: Sequelize.STRING(160) },
          ...timestamps(Sequelize)
        },
        opts
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE settings
           ADD CONSTRAINT settings_single_row CHECK (id = 1),
           ADD CONSTRAINT settings_commission_non_negative CHECK (commission_value >= 0)`,
        opts
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of [
        'reminders',
        'notifications',
        'prescriptions',
        'appointments',
        'slots',
        'doctor_profiles',
        'settings',
        'users'
      ]) {
        await queryInterface.dropTable(table, { transaction });
      }
      for (const type of [
        'enum_users_role',
        'enum_doctor_profiles_status',
        'enum_slots_status',
        'enum_appointments_status',
        'enum_reminders_type',
        'enum_reminders_status',
        'enum_settings_commission_type'
      ]) {
        await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${type}"`, { transaction });
      }
    });
  }
};
