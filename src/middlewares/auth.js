const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { ApiError } = require('../utils/errors');

const VALID_ROLES = ['ADMIN', 'RECTOR', 'COORDINATOR', 'TEACHER', 'STUDENT'];

/**
 * Modo libre (por defecto, AUTH_ENABLED distinto de "true"): no se pide token y tampoco se restringe por rol.
 * La identidad es opcional y se toma de dos cabeceras: x-user-email (por defecto demo@colegio.com), que sirve para
 * "mis apoyos" (/supports/me) y para saber quién registra cada acción, y x-user-role (por defecto ADMIN).
 */
function identityFromHeaders(req) {
  const email = String(req.headers['x-user-email'] || 'demo@colegio.com').trim().toLowerCase();
  const role = String(req.headers['x-user-role'] || 'ADMIN').trim().toUpperCase();
  if (!VALID_ROLES.includes(role)) throw new ApiError(400, `x-user-role must be one of: ${VALID_ROLES.join(', ')}`);
  return { email, role };
}

/**
 * Valida el JWT emitido por la API principal (FastAPI): HS256, mismo JWT_SECRET.
 * Payload esperado: { sub: <correo>, role: <nombre del rol>, exp, iat }.
 * En modo libre no valida nada (ver identityFromHeaders).
 */
function authenticate(req, res, next) {
  if (!config.authEnabled) {
    req.user = identityFromHeaders(req);
    return next();
  }
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (!type || type.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'Token requerido');
  }
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (e) {
    throw new ApiError(401, 'Token inválido o expirado');
  }
  if (!payload.sub || !payload.role) throw new ApiError(401, 'Token inválido');
  req.user = { email: payload.sub, role: payload.role };
  next();
}

function hasValidApiKey(req) {
  const provided = req.headers['x-api-key'];
  if (!config.apiKey || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(config.apiKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Acepta una clave de servicio (header x-api-key, para que la API principal registre auditoría) o un JWT de usuario. */
function authenticateOrApiKey(req, res, next) {
  if (hasValidApiKey(req)) {
    req.service = true;
    return next();
  }
  return authenticate(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!config.authEnabled) return next(); // modo libre: sin restricción por rol
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, 'No tiene permisos suficientes');
    }
    next();
  };
}

module.exports = { authenticate, authenticateOrApiKey, requireRole };
