const { ApiError } = require('./errors');

function requireString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== 'string') throw new ApiError(400, `${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ApiError(400, `${field} must be between ${min} and ${max} characters`);
  }
  return trimmed;
}

function optionalString(value, field, max = 255) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, { min: 1, max });
}

function parseId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(400, `${field} must be a positive integer`);
  return n;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new ApiError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `${field} is not a valid date`);
  return d;
}

function requireEmail(value, field = 'email') {
  const email = requireString(value, field, { min: 5, max: 255 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, `${field} is not a valid email`);
  return email;
}

function optionalInt(value, field, { min, max }) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, `${field} must be an integer between ${min} and ${max}`);
  return n;
}

function parseYear(value, field = 'year') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new ApiError(400, `${field} must be a year between 2000 and 2100`);
  return n;
}

function parseCountry(value, field = 'country') {
  if (typeof value !== 'string' || !/^[A-Za-z]{2}$/.test(value.trim())) {
    throw new ApiError(400, `${field} must be a 2-letter ISO country code (e.g. CO)`);
  }
  return value.trim().toUpperCase();
}

/** Acepta solo YYYY-MM-DD y verifica que sea una fecha real (rechaza 2026-02-31). */
function parseIsoDate(value, field = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${field} must have the format YYYY-MM-DD`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${field} is not a valid date`);
  }
  return value;
}

function pagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { requireString, optionalString, parseId, oneOf, optionalDate, requireEmail, optionalInt, parseYear, parseCountry, parseIsoDate, pagination };
