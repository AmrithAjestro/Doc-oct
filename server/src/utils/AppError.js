/** An error whose message is safe to show the user, with an HTTP status and a stable machine code. */
class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message = 'Please sign in to continue', code = 'UNAUTHORIZED') {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(404, message, code);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(409, message, code, details);
  }

  /** The request is well formed but a business rule refuses it (e.g. the 24-hour lock). */
  static rule(message, code = 'RULE_VIOLATION', details) {
    return new AppError(422, message, code, details);
  }
}

module.exports = AppError;
