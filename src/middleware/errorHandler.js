const NAMES = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict' };

function notFound(req, res) {
  res.status(404).json({
    timestamp: new Date().toISOString(), status: 404, error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`, path: req.originalUrl,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON body';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'Duplicate record';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    message = 'Referenced record does not exist';
  } else if (status >= 500) {
    console.error(err);
    message = 'Internal server error';
  }

  res.status(status).json({
    timestamp: new Date().toISOString(), status,
    error: status >= 500 ? 'Internal Server Error' : NAMES[status] || 'Error',
    message, path: req.originalUrl,
  });
}

module.exports = { notFound, errorHandler };
