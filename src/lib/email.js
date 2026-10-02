export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();
export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(e));
