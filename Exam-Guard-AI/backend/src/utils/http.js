export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function validId(value) { return /^\d+$/.test(String(value)) && Number(value) > 0; }
