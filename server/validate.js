// Pure input validators shared by the API routes. Each operates on the
// already-trimmed value the route passes in, so route behavior is unchanged.

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email))
}

export function isValidPassword(password) {
  return String(password || '').length >= 8
}

export function isValidName(name) {
  const trimmed = String(name || '').trim()
  return trimmed.length >= 1 && trimmed.length <= 200
}

export function isValidNoteText(rawText) {
  const trimmed = String(rawText || '').trim()
  return trimmed.length >= 1 && trimmed.length <= 100000
}

export function isValidImportSource(source) {
  const trimmed = String(source || '').trim()
  return trimmed.length >= 1 && trimmed.length <= 100
}

export function isValidOptionalEmail(email) {
  if (email === null || email === undefined || String(email).trim() === '') return true
  return isValidEmail(email)
}

export function isValidOptionalPhone(phone) {
  if (phone === null || phone === undefined || String(phone).trim() === '') return true
  const digits = String(phone).replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

export function isValidPushToken(token) {
  const trimmed = String(token || '').trim()
  return trimmed.length >= 1 && trimmed.length <= 512
}

export function isValidPushPlatform(platform) {
  return platform === 'web' || platform === 'ios' || platform === 'android'
}
