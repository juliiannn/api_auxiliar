class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Envuelve handlers async para que los errores lleguen al middleware de errores (Express 4). */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Respuesta estándar, igual a la de la API principal: { success, message, data } */
function send(res, status, message, data = null) {
  return res.status(status).json({ success: true, message, data });
}

module.exports = { ApiError, asyncHandler, send };
