/**
 * Consistent JSON error responses for the API.
 */
function jsonError(res, status, message, extra) {
  const body = { error: message };
  if (extra && typeof extra === 'object') {
    Object.assign(body, extra);
  }
  return res.status(status).json(body);
}

const Http = {
  jsonError,
  badRequest: (res, message, extra) => jsonError(res, 400, message, extra),
  unauthorized: (res, message = 'Unauthorized') => jsonError(res, 401, message),
  forbidden: (res, message = 'Forbidden') => jsonError(res, 403, message),
  notFound: (res, message = 'Not found') => jsonError(res, 404, message),
  conflict: (res, message, extra) => jsonError(res, 409, message, extra),
  serverError: (res, message = 'Server error') => jsonError(res, 500, message),
};

/**
 * Wraps async route handlers; sends 500 JSON if the promise rejects.
 */
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      Http.serverError(res, err.message || String(err));
    });
  };
}

module.exports = { Http, asyncRoute };
