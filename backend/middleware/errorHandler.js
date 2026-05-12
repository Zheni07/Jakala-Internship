const { Http } = require('../lib/http');
const { ValidationError } = require('../lib/validation');

function notFoundHandler(req, res) {
  return Http.notFound(res, 'Route not found');
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof ValidationError || err?.status === 400) {
    return Http.badRequest(res, err.message || 'Invalid request', err.details ? { details: err.details } : undefined);
  }
  return Http.serverError(res, err?.message || 'Server error');
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
