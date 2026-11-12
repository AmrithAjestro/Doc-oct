const { COMMISSION_TYPES } = require('../config/constants');
const { roundMoney } = require('./helpers');

/**
 * What the patient pays: the doctor's fee plus the platform commission.
 * Computed only on the server; the result is copied onto the appointment at booking time so a
 * later fee or commission change never rewrites what an existing booking costs.
 */
function calculateFee(doctorFee, settings) {
  const fee = roundMoney(doctorFee || 0);
  const value = Number(settings?.commissionValue || 0);
  const commission =
    settings?.commissionType === COMMISSION_TYPES.FLAT ? roundMoney(value) : roundMoney((fee * value) / 100);
  return { doctorFee: fee, commission, totalFee: roundMoney(fee + commission) };
}

module.exports = { calculateFee };
