import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { sql } from './db.js'

const scrypt = promisify(scryptCallback)
const COOKIE_NAME = 'keepsake_session'
const SESSION_DAYS = 30

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(item => item.trim().split('=')).filter(parts => parts.length === 2))
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64)
  return { salt, hash: Buffer.from(derived).toString('hex') }
}

export async function passwordMatches(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt)
  const actual = Buffer.from(hash, 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function createSession(userId, response) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash(token)}, ${expiresAt.toISOString()})
  `
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export async function attachUser(request, _response, next) {
  try {
    const token = parseCookies(request.headers.cookie)[COOKIE_NAME]
    if (!token) return next()
    const [user] = await sql`
      SELECT users.id, users.email, users.display_name
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ${tokenHash(token)} AND sessions.expires_at > now()
    `
    request.user = user || null
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAuth(request, response, next) {
  if (!request.user) return response.status(401).json({ error: 'Sign in to continue.' })
  next()
}

export async function clearSession(request, response) {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME]
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash(token)}`
  response.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict' })
}
