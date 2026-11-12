const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const { removeFile } = require('./upload.middleware');

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, code: 'ROUTE_NOT_FOUND', message: `No route matches ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // A request that failed after its file was stored must not leave the file behind.
  if (req.file) removeFile(req.file.path);
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = details[0];
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: first ? `${first.field ? `${first.field}: ` : ''}${first.message}` : 'Invalid request',
      details
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, code: err.code, message: err.message, details: err.details });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const fields = Object.keys(err.fields || {});
    const message = fields.includes('email') ? 'An account with this email already exists' : 'This record already exists';
    return res.status(409).json({ success: false, code: 'DUPLICATE', message, details: fields });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json({ success: false, code: 'IN_USE', message: 'This record is referenced by other data' });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, code: 'UPLOAD_ERROR', message: err.message });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, code: 'INVALID_JSON', message: 'Request body is not valid JSON' });
  }

  // 5xx details (driver errors, stack paths) stay in the log, not in the response.
  console.error('[Server Error]', req.method, req.originalUrl, err);
  res.status(500).json({ success: false, code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' });
};

module.exports = { notFoundHandler, errorHandler };
