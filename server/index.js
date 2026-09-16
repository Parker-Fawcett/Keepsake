import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { attachUser, clearSession, createSession, hashPassword, passwordMatches, requireAuth, tokenHash } from './auth.js'
import { sql } from './db.js'
import { extractRelationships } from './extract.js'
import { buildImportReview, MAX_REVIEW_RECORDS, validateImportConfirm } from './imports.js'
import { buildAuthUrl, exchangeCode, fetchConnections, isGoogleConfigured, redirectUriFor, refreshAccessToken } from './google.js'
import { validateConfirmPayload, FACT_CATEGORIES, validateDateFields } from './confirm.js'
import { rateLimit } from './ratelimit.js'
import { buildRemindersForDate, DEFAULT_REMINDER_RULES, nextOccurrence } from './reminders.js'
import { buildWeeklyReview } from './digest.js'
import { handleMcpRequest } from './mcp.js'
import { randomBytes } from 'node:crypto'
import { decryptSecret, encryptSecret, hasTokenEncryptionKey, isEncryptedSecret } from './secrets.js'
import { isValidAvatarDataUrl, isValidEmail, isValidImportSource, isValidName, isValidNoteText, isValidOptionalEmail, isValidOptionalPhone, isValidPassword, isValidPushPlatform, isValidPushToken, normalizeEmail } from './validate.js'

const app = express()
const port = Number(process.env.PORT || 5173)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.disable('x-powered-by')
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
if (process.env.NODE_ENV === 'production') {
  app.use((_request, response, next) => {
    response.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
    })
    next()
  })
}
app.use(express.json({ limit: '2mb' }))
app.use(attachUser)
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300 }))
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 })

const ownerIdFor = request => request.user.id

app.get('/api/health', async (_request, response, next) => {
  try {
    const [database] = await sql`SELECT now() AS connected_at`
    response.json({
      ok: true,
      database: 'connected',
      connectedAt: database.connected_at,
      extraction: process.env.OPENAI_API_KEY ? 'openai' : 'local',
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', (request, response) => {
  response.json({ user: request.user ?? null })
})

app.post('/api/auth/signup', authLimiter, async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body?.email)
    const password = String(request.body?.password || '')
    const displayName = String(request.body?.displayName || email.split('@')[0] || 'Friend').trim().slice(0, 100)
    if (!isValidEmail(email)) return response.status(400).json({ error: 'Enter a valid email.' })
    if (!isValidPassword(password)) return response.status(400).json({ error: 'Use a password with at least 8 characters.' })

    const [existing] = await sql`SELECT id FROM users WHERE lower(email) = ${email}`
    if (existing) return response.status(409).json({ error: 'That email is already registered. Try signing in.' })

    const { salt, hash } = await hashPassword(password)
    const [user] = await sql`
      INSERT INTO users (email, display_name, password_salt, password_hash)
      VALUES (${email}, ${displayName || 'Friend'}, ${salt}, ${hash})
      RETURNING id, email, display_name
    `
    await createSession(user.id, response)
    response.status(201).json({ user })
  } catch (error) {
    if (error?.code === '23505') return response.status(409).json({ error: 'That email is already registered. Try signing in.' })
    next(error)
  }
})

app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body?.email)
    const password = String(request.body?.password || '')
    const [user] = await sql`SELECT id, email, display_name, password_salt, password_hash FROM users WHERE lower(email) = ${email}`
    if (!user?.password_hash) return response.status(401).json({ error: 'Email or password is incorrect.' })
    const ok = await passwordMatches(password, user.password_salt, user.password_hash)
    if (!ok) return response.status(401).json({ error: 'Email or password is incorrect.' })
    await createSession(user.id, response)
    response.json({ user: { id: user.id, email: user.email, display_name: user.display_name } })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    await clearSession(request, response)
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

// MCP answers on its own path with Bearer-token auth, outside the
// cookie-session gate below.
async function userFromBearer(request) {
  const match = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const hash = tokenHash(match[1].trim())
  const [user] = await sql`
    SELECT users.id, users.email, users.display_name FROM api_tokens
    JOIN users ON users.id = api_tokens.user_id
    WHERE api_tokens.token_hash = ${hash}
  `
  if (user) await sql`UPDATE api_tokens SET last_used_at = now() WHERE token_hash = ${hash}`
  return user || null
}

const mcpDb = {
  async listPeople(ownerId) {
    return sql`SELECT id, name, relationship FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL ORDER BY lower(name)`
  },
  async personDetails(ownerId, ref) {
    const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
    const [person] = looksUuid
      ? await sql`SELECT id, name, relationship, color, email, phone FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL AND (id = ${ref} OR lower(name) = lower(${ref}))`
      : await sql`SELECT id, name, relationship, color, email, phone FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL AND lower(name) = lower(${ref})`
    if (!person) return null
    const facts = await sql`SELECT category, value, confidence FROM facts WHERE person_id = ${person.id} ORDER BY created_at`
    const dates = await sql`SELECT label, month, day, year FROM important_dates WHERE person_id = ${person.id} ORDER BY month, day`
    const reminders = await sql`SELECT title, remind_at FROM reminders WHERE person_id = ${person.id} AND status = 'scheduled' AND remind_at >= now() ORDER BY remind_at LIMIT 10`
    const notes = await sql`
      SELECT notes.raw_text AS text, notes.created_at FROM note_people
      JOIN notes ON notes.id = note_people.note_id
      WHERE note_people.person_id = ${person.id}
      ORDER BY notes.created_at DESC LIMIT 10
    `
    return { person, facts, dates, reminders, notes }
  },
  async upcomingReminders(ownerId, days) {
    return sql`
      SELECT reminders.title, reminders.remind_at, people.name AS person_name
      FROM reminders
      LEFT JOIN people ON people.id = reminders.person_id
      WHERE reminders.owner_id = ${ownerId} AND reminders.status = 'scheduled'
        AND reminders.remind_at >= now() AND reminders.remind_at <= now() + (${days} || ' days')::interval
      ORDER BY reminders.remind_at LIMIT 50
    `
  },
  async searchAll(ownerId, query) {
    const like = `%${query.replace(/[\\%_]/g, char => `\\${char}`)}%`
    const people = await sql`SELECT id, name, relationship FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL AND lower(name) LIKE lower(${like}) LIMIT 20`
    const notes = await sql`SELECT id, left(raw_text, 500) AS text FROM notes WHERE owner_id = ${ownerId} AND raw_text ILIKE ${like} ORDER BY created_at DESC LIMIT 10`
    const facts = await sql`
      SELECT facts.category, facts.value, people.name AS person_name FROM facts
      JOIN people ON people.id = facts.person_id
      WHERE people.owner_id = ${ownerId} AND facts.value ILIKE ${like} LIMIT 20
    `
    return { people, notes, facts }
  },
  async logNote(ownerId, text) {
    const stored = await storeNoteWithExtraction(ownerId, text, 'mcp')
    return {
      id: stored.note.id,
      summary: stored.extraction?.summary || 'Note stored for review.',
      people: (stored.extraction?.people || []).map(entry => ({ name: entry.name })),
    }
  },
}

app.post('/mcp', async (request, response) => {
  try {
    const user = await userFromBearer(request).catch(() => null)
    response.json(await handleMcpRequest(request.body, { user, db: mcpDb }))
  } catch (error) {
    console.error(error)
    response.status(500).json({ jsonrpc: '2.0', id: request.body?.id ?? null, error: { code: -32603, message: 'Keepsake could not complete that request.' } })
  }
})

// Everything below this line contains private relationship data. A request
// must have a valid session; there is no shared fallback account.
app.use('/api', requireAuth)

app.get('/api/push/public-key', (_request, response) => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  if (!publicKey) return response.status(503).json({ error: 'Browser notifications are not configured yet.' })
  response.json({ publicKey })
})

app.post('/api/push-tokens', async (request, response, next) => {
  try {
    const token = String(request.body?.token || '').trim()
    const platform = String(request.body?.platform || '').trim()
    if (!isValidPushToken(token)) return response.status(400).json({ error: 'Enter a valid device token.' })
    if (!isValidPushPlatform(platform)) return response.status(400).json({ error: 'Enter a valid platform.' })
    if (platform === 'web') {
      try {
        const subscription = JSON.parse(token)
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
          return response.status(400).json({ error: 'Enter a valid browser notification subscription.' })
        }
      } catch {
        return response.status(400).json({ error: 'Enter a valid browser notification subscription.' })
      }
    }
    // A browser subscription belongs to the account currently using that
    // browser. Reassigning it prevents reminders from a signed-out account.
    await sql`DELETE FROM device_tokens WHERE token = ${token} AND user_id <> ${ownerIdFor(request)}`
    const [saved] = await sql`
      INSERT INTO device_tokens (user_id, token, platform)
      VALUES (${ownerIdFor(request)}, ${token}, ${platform})
      ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform
      RETURNING id, platform, created_at
    `
    response.status(201).json({ token: saved })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/push-tokens', async (request, response, next) => {
  try {
    const token = String(request.body?.token || '').trim()
    if (!token) return response.status(400).json({ error: 'Enter a device token.' })
    await sql`DELETE FROM device_tokens WHERE user_id = ${ownerIdFor(request)} AND token = ${token}`
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/auth/account', async (request, response, next) => {
  try {
    // Sessions, people, notes, facts, dates, reminders, tokens, and linked
    // accounts all cascade from the user row.
    await clearSession(request, response)
    await sql`DELETE FROM users WHERE id = ${request.user.id}`
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/tokens', async (request, response, next) => {
  try {
    const tokens = await sql`SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ${request.user.id} ORDER BY created_at`
    response.json({ tokens })
  } catch (error) {
    next(error)
  }
})

app.post('/api/tokens', async (request, response, next) => {
  try {
    const name = String(request.body?.name || 'MCP access').trim().slice(0, 100) || 'MCP access'
    const token = randomBytes(32).toString('hex')
    const [saved] = await sql`
      INSERT INTO api_tokens (user_id, name, token_hash)
      VALUES (${request.user.id}, ${name}, ${tokenHash(token)})
      RETURNING id, name, created_at
    `
    // The plaintext token is shown exactly once, here.
    response.status(201).json({ token: { ...saved, token } })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/tokens/:id', async (request, response, next) => {
  try {
    await sql`DELETE FROM api_tokens WHERE id = ${request.params.id} AND user_id = ${request.user.id}`
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

const OAUTH_STATE_COOKIE = 'keepsake_oauth_state'
const googleConfigured = () => isGoogleConfigured() && (process.env.NODE_ENV !== 'production' || hasTokenEncryptionKey())

app.get('/api/auth/google', async (request, response) => {
  if (!googleConfigured()) return response.status(400).json({ error: 'Google sync is not set up yet.' })
  const { randomBytes } = await import('node:crypto')
  const state = randomBytes(16).toString('hex')
  response.cookie(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/' })
  response.json({ url: buildAuthUrl(process.env, redirectUriFor(process.env, request.headers.host), state) })
})

app.get('/api/auth/google/callback', async (request, response, next) => {
  try {
    const cookies = Object.fromEntries(
      String(request.headers.cookie || '').split(';').map(item => item.trim().split('=')).filter(parts => parts.length === 2),
    )
    const state = String(request.query?.state || '')
    const code = String(request.query?.code || '')
    if (!state || !cookies[OAUTH_STATE_COOKIE] || state !== cookies[OAUTH_STATE_COOKIE] || !code) {
      return response.redirect('/#import=google-error')
    }
    response.clearCookie(OAUTH_STATE_COOKIE, { path: '/' })
    const redirectUri = redirectUriFor(process.env, request.headers.host)
    const tokens = await exchangeCode(process.env, code, redirectUri)
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null
    const accessToken = encryptSecret(tokens.access_token)
    const refreshToken = encryptSecret(tokens.refresh_token || null)
    await sql`
      INSERT INTO connected_accounts (user_id, provider, access_token, refresh_token, expires_at)
      VALUES (${ownerIdFor(request)}, 'google', ${accessToken}, ${refreshToken}, ${expiresAt})
      ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, connected_accounts.refresh_token),
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    `
    response.redirect('/#import=google')
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/google/status', async (request, response, next) => {
  try {
    const [account] = await sql`SELECT provider_email, updated_at FROM connected_accounts WHERE user_id = ${ownerIdFor(request)} AND provider = 'google'`
    response.json({ connected: Boolean(account), email: account?.provider_email || null })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/auth/google', async (request, response, next) => {
  try {
    await sql`DELETE FROM connected_accounts WHERE user_id = ${ownerIdFor(request)} AND provider = 'google'`
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

async function googleAccessToken(ownerId) {
  const [account] = await sql`SELECT access_token, refresh_token, expires_at FROM connected_accounts WHERE user_id = ${ownerId} AND provider = 'google'`
  if (!account) return null
  const accessToken = decryptSecret(account.access_token)
  const refreshToken = decryptSecret(account.refresh_token)

  // Transparently upgrade credentials created before encryption was enabled.
  if (hasTokenEncryptionKey() && (!isEncryptedSecret(account.access_token) || (account.refresh_token && !isEncryptedSecret(account.refresh_token)))) {
    await sql`
      UPDATE connected_accounts
      SET access_token = ${encryptSecret(accessToken)}, refresh_token = ${encryptSecret(refreshToken)}, updated_at = now()
      WHERE user_id = ${ownerId} AND provider = 'google'
    `
  }

  if (refreshToken && (!account.expires_at || new Date(account.expires_at).getTime() < Date.now() + 60000)) {
    const refreshed = await refreshAccessToken(process.env, refreshToken)
    const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null
    await sql`UPDATE connected_accounts SET access_token = ${encryptSecret(refreshed.access_token)}, expires_at = ${expiresAt}, updated_at = now() WHERE user_id = ${ownerId} AND provider = 'google'`
    return refreshed.access_token
  }
  return accessToken
}

app.get('/api/imports/google/preview', async (request, response, next) => {
  try {
    if (!googleConfigured()) return response.status(400).json({ error: 'Google sync is not set up yet.' })
    const ownerId = ownerIdFor(request)
    const accessToken = await googleAccessToken(ownerId)
    if (!accessToken) return response.status(400).json({ error: 'Connect your Google account first.' })
    const records = (await fetchConnections(accessToken)).map((record, _idx) => ({ ...record, _idx }))
    const existing = await sql`SELECT id, name, relationship, email, phone FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL`
    response.json({ source: 'Google contacts', ...buildImportReview(existing, records.slice(0, MAX_REVIEW_RECORDS)) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/people', async (request, response, next) => {
  try {
    const people = await sql`
      SELECT id, name, relationship, color, avatar_url, email, phone, created_at
      FROM people
      WHERE owner_id = ${ownerIdFor(request)} AND archived_at IS NULL
      ORDER BY lower(name)
    `
    response.json({ people })
  } catch (error) {
    next(error)
  }
})

app.post('/api/people', async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim()
    const relationship = String(request.body?.relationship || 'Other').trim()
    const emailInput = request.body?.email ?? ''
    const phoneInput = request.body?.phone ?? ''
    if (!isValidName(name)) return response.status(400).json({ error: 'Enter a valid name.' })
    if (!isValidOptionalEmail(emailInput)) return response.status(400).json({ error: 'Enter a valid email.' })
    if (!isValidOptionalPhone(phoneInput)) return response.status(400).json({ error: 'Enter a valid phone number.' })
    const email = String(emailInput).trim() ? normalizeEmail(emailInput) : null
    const phone = String(phoneInput).trim() ? String(phoneInput).trim().slice(0, 40) : null

    const [person] = await sql`
      INSERT INTO people (owner_id, name, relationship, email, phone)
      VALUES (${ownerIdFor(request)}, ${name}, ${relationship}, ${email}, ${phone})
      RETURNING id, name, relationship, color, avatar_url, email, phone, created_at
    `
    response.status(201).json({ person })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/people/:id', async (request, response, next) => {
  try {
    // Archiving keeps facts, dates, and notes intact for history while
    // hiding the card everywhere. Nothing is hard-deleted.
    const [archived] = await sql`
      UPDATE people SET archived_at = now()
      WHERE id = ${request.params.id} AND owner_id = ${ownerIdFor(request)} AND archived_at IS NULL
      RETURNING id
    `
    if (!archived) return response.status(404).json({ error: 'Not found.' })
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/notes', async (request, response, next) => {
  try {
    const rawText = String(request.body?.rawText || '').trim()
    const source = String(request.body?.source || 'manual').trim()
    if (!isValidNoteText(rawText)) return response.status(400).json({ error: 'Enter a note under 100,000 characters.' })

    const stored = await storeNoteWithExtraction(ownerIdFor(request), rawText, source)
    response.status(201).json(stored)
  } catch (error) {
    next(error)
  }
})

// Shared by note capture and the MCP log_note tool: insert the note, run
// extraction without ever failing the save, link known people.
async function storeNoteWithExtraction(ownerId, rawText, source) {
  const [note] = await sql`
    INSERT INTO notes (owner_id, raw_text, source)
    VALUES (${ownerId}, ${rawText}, ${source})
    RETURNING id, raw_text, source, processing_status, created_at
  `

  try {
    const knownPeople = await sql`SELECT id, name, relationship FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL`
    const { mode, data } = await extractRelationships(rawText, knownPeople)
    await sql`UPDATE notes SET extraction = ${JSON.stringify(data)}, processing_status = 'review' WHERE id = ${note.id}`

    const matchedIds = new Set()
    for (const entry of data.people || []) {
      const match = knownPeople.find(person => person.name.toLowerCase() === String(entry.name || '').toLowerCase())
      if (match && !matchedIds.has(match.id)) {
        matchedIds.add(match.id)
        await sql`INSERT INTO note_people (note_id, person_id, confidence) VALUES (${note.id}, ${match.id}, ${Math.min(1, Math.max(0, Number(entry.confidence) || 0.7))}) ON CONFLICT DO NOTHING`
      }
    }
    const [updated] = await sql`SELECT id, raw_text, source, processing_status, extraction, created_at FROM notes WHERE id = ${note.id}`
    return { note: updated, extraction: data, extractionMode: mode }
  } catch (extractionError) {
    console.error(extractionError)
    await sql`UPDATE notes SET processing_error = 'extraction failed', processing_status = 'pending' WHERE id = ${note.id}`
    return { note, extraction: null, extractionMode: 'failed' }
  }
}

app.post('/api/extract/preview', async (request, response, next) => {
  try {
    const rawText = String(request.body?.rawText || '').trim()
    if (!isValidNoteText(rawText)) return response.status(400).json({ error: 'Enter a note under 100,000 characters.' })
    const knownPeople = await sql`SELECT id, name, relationship FROM people WHERE owner_id = ${ownerIdFor(request)} AND archived_at IS NULL`
    const { mode, data } = await extractRelationships(rawText, knownPeople)
    response.json({ mode, extraction: data })
  } catch (error) {
    next(error)
  }
})

app.post('/api/notes/:id/confirm', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const [note] = await sql`
      SELECT id, processing_status FROM notes WHERE id = ${request.params.id} AND owner_id = ${ownerId}
    `
    if (!note) return response.status(404).json({ error: 'Not found.' })

    const validated = validateConfirmPayload(request.body)
    if (!validated.ok) return response.status(400).json({ error: validated.errors[0], errors: validated.errors })
    if (validated.people.length > 100 || validated.facts.length > 500 || validated.dates.length > 200) {
      return response.status(400).json({ error: 'That confirmation is too large to save at once.' })
    }

    // Resolve each payload person to a stored row: verify ownership of a
    // claimed personId, otherwise create the person.
    const resolvedIds = []
    for (const entry of validated.people) {
      if (entry.personId) {
        const [existing] = await sql`SELECT id FROM people WHERE id = ${entry.personId} AND owner_id = ${ownerId} AND archived_at IS NULL`
        if (!existing) return response.status(400).json({ error: 'One of the people does not belong to your circle.' })
        resolvedIds.push(existing.id)
      } else {
        const [created] = await sql`
          INSERT INTO people (owner_id, name, relationship)
          VALUES (${ownerId}, ${entry.name}, ${entry.relationship})
          RETURNING id
        `
        resolvedIds.push(created.id)
      }
    }

    const createdFacts = []
    for (const fact of validated.facts) {
      const [row] = await sql`
        INSERT INTO facts (person_id, source_note_id, category, value, confidence, confirmed_at)
        VALUES (${resolvedIds[fact.person]}, ${note.id}, ${fact.category}, ${fact.value}, ${fact.confidence}, now())
        RETURNING id, category, value, confidence
      `
      createdFacts.push(row)
    }

    const createdDates = []
    for (const date of validated.dates) {
      const [row] = await sql`
        INSERT INTO important_dates (person_id, source_note_id, label, month, day, year, recurs_yearly, confidence, confirmed_at)
        VALUES (${resolvedIds[date.person]}, ${note.id}, ${date.label}, ${date.month}, ${date.day}, ${date.year}, ${date.recursYearly}, ${date.confidence}, now())
        RETURNING id, person_id, label, month, day, year, recurs_yearly
      `
      createdDates.push(row)
    }

    // Schedule reminders for the next occurrence of each confirmed date.
    // A date in the past simply yields no reminders, never an error.
    const storedPeople = await sql`SELECT id, name FROM people WHERE owner_id = ${ownerId} AND id = ANY(${resolvedIds})`
    const namesById = Object.fromEntries(storedPeople.map(person => [person.id, person.name]))
    const createdReminders = []
    for (const date of createdDates) {
      const scheduled = buildRemindersForDate(
        {
          personName: namesById[date.person_id] || 'Someone',
          label: date.label,
          month: date.month,
          day: date.day,
          year: date.year,
          recursYearly: date.recurs_yearly,
        },
        DEFAULT_REMINDER_RULES,
        new Date(),
      )
      for (const reminder of scheduled) {
        const [row] = await sql`
          INSERT INTO reminders (owner_id, person_id, important_date_id, title, remind_at)
          VALUES (${ownerId}, ${date.person_id}, ${date.id}, ${reminder.title}, ${reminder.remindAt.toISOString()})
          RETURNING id, title, remind_at
        `
        createdReminders.push(row)
      }
    }

    for (let index = 0; index < resolvedIds.length; index += 1) {
      await sql`
        INSERT INTO note_people (note_id, person_id, confidence)
        VALUES (${note.id}, ${resolvedIds[index]}, ${validated.people[index].confidence})
        ON CONFLICT (note_id, person_id) DO UPDATE SET confidence = EXCLUDED.confidence
      `
    }

    const [updated] = await sql`
      UPDATE notes SET processing_status = 'complete' WHERE id = ${note.id}
      RETURNING id, raw_text, source, processing_status, extraction, created_at
    `
    response.json({ note: updated, people: resolvedIds, facts: createdFacts, dates: createdDates, reminders: createdReminders })
  } catch (error) {
    next(error)
  }
})

app.get('/api/review/weekly', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const reminders = await sql`
      SELECT reminders.id, reminders.title, reminders.remind_at, people.name AS person_name
      FROM reminders
      LEFT JOIN people ON people.id = reminders.person_id
      WHERE reminders.owner_id = ${ownerId} AND reminders.status = 'scheduled'
        AND reminders.remind_at >= now() AND reminders.remind_at <= now() + interval '7 days'
      ORDER BY reminders.remind_at
    `
    const notes = await sql`
      SELECT id, raw_text, processing_status, created_at FROM notes
      WHERE owner_id = ${ownerId} AND processing_status IN ('review', 'pending')
      ORDER BY created_at DESC LIMIT 20
    `
    const people = await sql`SELECT id, name FROM people WHERE owner_id = ${ownerId} AND archived_at IS NULL`
    const links = await sql`
      SELECT note_people.person_id, notes.created_at AS note_created_at FROM note_people
      JOIN notes ON notes.id = note_people.note_id
      WHERE notes.owner_id = ${ownerId}
    `
    response.json(buildWeeklyReview({ reminders, notes, people, links, now: new Date() }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/reminders/upcoming', async (request, response, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(request.query?.limit) || 20))
    const reminders = await sql`
      SELECT reminders.id, reminders.title, reminders.remind_at, reminders.status,
             people.name AS person_name, important_dates.label AS date_label
      FROM reminders
      LEFT JOIN people ON people.id = reminders.person_id
      LEFT JOIN important_dates ON important_dates.id = reminders.important_date_id
      WHERE reminders.owner_id = ${ownerIdFor(request)}
        AND reminders.status = 'scheduled'
        AND reminders.remind_at >= now()
      ORDER BY reminders.remind_at
      LIMIT ${limit}
    `

    // A date whose reminder slots (14d / 3d before) have already passed has
    // no future reminder row, so it would never surface. Make the feed fall
    // back to the date's own next occurrence when it is genuinely upcoming.
    const rows = [...reminders]
    if (reminders.length < limit) {
      const dates = await sql`
        SELECT important_dates.id, important_dates.label, important_dates.month,
               important_dates.day, important_dates.year, important_dates.recurs_yearly,
               people.name AS person_name
        FROM important_dates
        JOIN people ON people.id = important_dates.person_id
        WHERE people.owner_id = ${ownerIdFor(request)}
          AND people.archived_at IS NULL
      `
      const needFallback = new Set()
      for (const row of reminders) {
        if (!row.person_name) continue
        const key = `${row.person_name}|${row.date_label || row.title}`
        needFallback.add(key)
      }
      for (const date of dates) {
        const key = `${date.person_name}|${date.label}`
        if (needFallback.has(key)) continue
        const occurrence = nextOccurrence(
          { month: date.month, day: date.day, year: date.year, recursYearly: date.recurs_yearly },
          new Date(),
        )
        if (!occurrence || occurrence.getTime() - Date.now() > 45 * 24 * 60 * 60 * 1000) continue
        rows.push({
          id: null,
          title: `${date.person_name} · ${date.label}`,
          remind_at: occurrence.toISOString(),
          status: 'scheduled',
          person_name: date.person_name,
          date_label: date.label,
        })
      }
      rows.sort((a, b) => a.remind_at.localeCompare(b.remind_at))
    }

    response.json({ reminders: rows.slice(0, limit) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/people/:id/details', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const [person] = await sql`
      SELECT id, name, relationship, color, avatar_url, email, phone, created_at
      FROM people
      WHERE id = ${request.params.id} AND owner_id = ${ownerId} AND archived_at IS NULL
    `
    if (!person) return response.status(404).json({ error: 'Not found.' })
    const facts = await sql`SELECT id, category, value, confidence, confirmed_at FROM facts WHERE person_id = ${person.id} ORDER BY created_at`
    const dates = await sql`SELECT id, label, month, day, year, recurs_yearly, confidence FROM important_dates WHERE person_id = ${person.id} ORDER BY month, day`
    const reminders = await sql`
      SELECT id, important_date_id, title, remind_at FROM reminders
      WHERE person_id = ${person.id} AND owner_id = ${ownerId} AND status = 'scheduled' AND remind_at >= now()
      ORDER BY remind_at LIMIT 10
    `
    const notes = await sql`
      SELECT notes.id, notes.raw_text, notes.created_at FROM note_people
      JOIN notes ON notes.id = note_people.note_id
      WHERE note_people.person_id = ${person.id}
      ORDER BY notes.created_at DESC LIMIT 20
    `
    response.json({ person, facts, dates, reminders, notes })
  } catch (error) {
    next(error)
  }
})

app.post('/api/people/:id/avatar', async (request, response, next) => {
  try {
    const dataUrl = String(request.body?.dataUrl || '')
    if (!isValidAvatarDataUrl(dataUrl)) {
      return response.status(400).json({ error: 'Send a PNG, JPEG, WebP, or GIF photo under about 700KB.' })
    }
    const [updated] = await sql`
      UPDATE people SET avatar_url = ${dataUrl}
      WHERE id = ${request.params.id} AND owner_id = ${ownerIdFor(request)} AND archived_at IS NULL
      RETURNING id, avatar_url
    `
    if (!updated) return response.status(404).json({ error: 'Not found.' })
    response.json({ person: updated })
  } catch (error) {
    next(error)
  }
})

app.post('/api/people/:id/dates', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const [person] = await sql`SELECT id, name FROM people WHERE id = ${request.params.id} AND owner_id = ${ownerId} AND archived_at IS NULL`
    if (!person) return response.status(404).json({ error: 'Not found.' })
    const checked = validateDateFields(request.body)
    if (!checked.ok) return response.status(400).json({ error: checked.errors[0], errors: checked.errors })
    const { date } = checked
    const [row] = await sql`
      INSERT INTO important_dates (person_id, label, month, day, year, recurs_yearly, confidence, confirmed_at)
      VALUES (${person.id}, ${date.label}, ${date.month}, ${date.day}, ${date.year}, ${date.recursYearly}, ${date.confidence}, now())
      RETURNING id, label, month, day, year, recurs_yearly
    `
    const reminders = []
    for (const item of buildRemindersForDate({ personName: person.name, ...date }, DEFAULT_REMINDER_RULES, new Date())) {
      const [reminder] = await sql`
        INSERT INTO reminders (owner_id, person_id, important_date_id, title, remind_at)
        VALUES (${ownerId}, ${person.id}, ${row.id}, ${item.title}, ${item.remindAt.toISOString()})
        RETURNING id, title, remind_at
      `
      reminders.push(reminder)
    }
    response.status(201).json({ date: row, reminders })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/people/:id/dates/:dateId', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const [person] = await sql`SELECT id, name FROM people WHERE id = ${request.params.id} AND owner_id = ${ownerId} AND archived_at IS NULL`
    if (!person) return response.status(404).json({ error: 'Not found.' })
    const [existing] = await sql`
      SELECT id, label, month, day, year, recurs_yearly
      FROM important_dates
      WHERE id = ${request.params.dateId} AND person_id = ${person.id}
    `
    if (!existing) return response.status(404).json({ error: 'Not found.' })
    const checked = validateDateFields({ ...request.body, recursYearly: request.body.recursYearly ?? existing.recurs_yearly })
    if (!checked.ok) return response.status(400).json({ error: checked.errors[0], errors: checked.errors })
    const { date } = checked
    const [row] = await sql`
      UPDATE important_dates
      SET label = ${date.label}, month = ${date.month}, day = ${date.day}, year = ${date.year}, recurs_yearly = ${date.recursYearly}
      WHERE id = ${existing.id}
      RETURNING id, label, month, day, year, recurs_yearly
    `
    // The old reminder slots are now stale. Clear still-future ones and
    // rebuild from the new date so Today/Upcoming and pushes stay correct.
    await sql`DELETE FROM reminders WHERE important_date_id = ${existing.id} AND remind_at >= now()`
    const reminders = []
    for (const item of buildRemindersForDate({ personName: person.name, ...date }, DEFAULT_REMINDER_RULES, new Date())) {
      const [reminder] = await sql`
        INSERT INTO reminders (owner_id, person_id, important_date_id, title, remind_at)
        VALUES (${ownerId}, ${person.id}, ${row.id}, ${item.title}, ${item.remindAt.toISOString()})
        ON CONFLICT DO NOTHING
        RETURNING id, title, remind_at
      `
      if (reminder) reminders.push(reminder)
    }
    response.json({ date: row, reminders })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/people/:id/dates/:dateId', async (request, response, next) => {
  try {
    const [person] = await sql`SELECT id FROM people WHERE id = ${request.params.id} AND owner_id = ${ownerIdFor(request)} AND archived_at IS NULL`
    if (!person) return response.status(404).json({ error: 'Not found.' })
    const [removed] = await sql`
      DELETE FROM important_dates
      WHERE id = ${request.params.dateId} AND person_id = ${person.id}
      RETURNING id
    `
    if (!removed) return response.status(404).json({ error: 'Not found.' })
    response.json({ deleted: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/people/:id/facts', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const [person] = await sql`SELECT id FROM people WHERE id = ${request.params.id} AND owner_id = ${ownerId} AND archived_at IS NULL`
    if (!person) return response.status(404).json({ error: 'Not found.' })
    const category = String(request.body?.category || 'like')
    const value = String(request.body?.value || '').trim()
    if (!FACT_CATEGORIES.includes(category)) return response.status(400).json({ error: 'Pick a valid category.' })
    if (!value || value.length > 2000) return response.status(400).json({ error: 'Write something between 1 and 2000 characters.' })
    const [fact] = await sql`
      INSERT INTO facts (person_id, category, value, confidence, confirmed_at)
      VALUES (${person.id}, ${category}, ${value}, 1, now())
      RETURNING id, category, value
    `
    response.status(201).json({ fact })
  } catch (error) {
    next(error)
  }
})

app.post('/api/people/:id/dates/:dateId/reminders/toggle', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const [person] = await sql`SELECT id, name FROM people WHERE id = ${request.params.id} AND owner_id = ${ownerId} AND archived_at IS NULL`
    if (!person) return response.status(404).json({ error: 'Not found.' })
    const [date] = await sql`SELECT id, label, month, day, year, recurs_yearly FROM important_dates WHERE id = ${request.params.dateId} AND person_id = ${person.id}`
    if (!date) return response.status(404).json({ error: 'Not found.' })

    const live = await sql`
      SELECT id FROM reminders
      WHERE important_date_id = ${date.id} AND status = 'scheduled' AND remind_at >= now()
    `
    if (live.length) {
      await sql`UPDATE reminders SET status = 'cancelled' WHERE important_date_id = ${date.id} AND status = 'scheduled'`
      return response.json({ muted: true, reminders: [] })
    }
    // Reactivate still-future rows muted earlier instead of duplicating them.
    const reactivated = await sql`
      UPDATE reminders SET status = 'scheduled'
      WHERE important_date_id = ${date.id} AND status = 'cancelled' AND remind_at >= now()
      RETURNING id, title, remind_at
    `
    if (reactivated.length) return response.json({ muted: false, reminders: reactivated })
    const reminders = []
    for (const item of buildRemindersForDate({
      personName: person.name,
      label: date.label,
      month: date.month,
      day: date.day,
      year: date.year,
      recursYearly: date.recurs_yearly,
    }, DEFAULT_REMINDER_RULES, new Date())) {
      const [reminder] = await sql`
        INSERT INTO reminders (owner_id, person_id, important_date_id, title, remind_at)
        VALUES (${ownerId}, ${person.id}, ${date.id}, ${item.title}, ${item.remindAt.toISOString()})
        ON CONFLICT DO NOTHING
        RETURNING id, title, remind_at
      `
      if (reminder) reminders.push(reminder)
    }
    response.json({ muted: reminders.length === 0, reminders })
  } catch (error) {
    next(error)
  }
})

app.get('/api/notes/:id', async (request, response, next) => {
  try {
    const [note] = await sql`
      SELECT id, raw_text, source, processing_status, extraction, processing_error, created_at
      FROM notes
      WHERE id = ${request.params.id} AND owner_id = ${ownerIdFor(request)}
    `
    if (!note) return response.status(404).json({ error: 'Not found.' })
    const links = await sql`SELECT person_id, confidence FROM note_people WHERE note_id = ${note.id}`
    response.json({ note, links })
  } catch (error) {
    next(error)
  }
})

app.post('/api/imports/review', async (request, response, next) => {
  try {
    const source = String(request.body?.source || '').trim()
    const records = request.body?.records
    if (!isValidImportSource(source)) return response.status(400).json({ error: 'Enter a valid import source.' })
    if (!Array.isArray(records) || records.length < 1 || records.length > MAX_REVIEW_RECORDS) {
      return response.status(400).json({ error: `Send between 1 and ${MAX_REVIEW_RECORDS} records to review.` })
    }
    // Read-only: nothing is written. The client shows candidates for the
    // user's "Merge them?" confirmation before anything is imported.
    const existing = await sql`SELECT id, name, relationship, email, phone FROM people WHERE owner_id = ${ownerIdFor(request)} AND archived_at IS NULL`
    response.json({ source, ...buildImportReview(existing, records) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/imports/confirm', async (request, response, next) => {
  try {
    const ownerId = ownerIdFor(request)
    const validated = validateImportConfirm(request.body)
    if (!validated.ok) return response.status(400).json({ error: validated.errors[0], errors: validated.errors })

    const created = []
    const merged = []
    let skipped = 0
    for (const item of validated.plan) {
      if (item.action === 'skip') {
        skipped += 1
        continue
      }
      if (item.action === 'merge') {
        const [existing] = await sql`SELECT id, email, phone FROM people WHERE id = ${item.personId} AND owner_id = ${ownerId} AND archived_at IS NULL`
        if (!existing) return response.status(400).json({ error: 'One of the merge targets does not belong to your circle.' })
        // Merging fills in contact details the card is missing; it never
        // overwrites what is already there.
        const [updated] = await sql`
          UPDATE people
          SET email = COALESCE(email, ${item.email}), phone = COALESCE(phone, ${item.phone})
          WHERE id = ${existing.id}
          RETURNING id, name, email, phone
        `
        merged.push(updated)
        continue
      }
      const [row] = await sql`
        INSERT INTO people (owner_id, name, relationship, email, phone)
        VALUES (${ownerId}, ${item.name}, 'Other', ${item.email}, ${item.phone})
        RETURNING id, name, relationship, email, phone
      `
      created.push(row)
    }

    const source = String(request.body.source).trim()
    const [savedImport] = await sql`
      INSERT INTO imports (owner_id, source, record_count, status)
      VALUES (${ownerId}, ${source}, ${request.body.records.length}, 'complete')
      RETURNING id, source, record_count, status, created_at
    `
    response.status(201).json({ import: savedImport, created, merged, skipped })
  } catch (error) {
    next(error)
  }
})

app.post('/api/imports', async (request, response, next) => {
  try {
    const source = String(request.body?.source || '').trim()
    const recordCount = Math.max(0, Number(request.body?.recordCount || 0))
    if (!isValidImportSource(source)) return response.status(400).json({ error: 'Enter a valid import source.' })

    const [savedImport] = await sql`
      INSERT INTO imports (owner_id, source, record_count)
      VALUES (${ownerIdFor(request)}, ${source}, ${recordCount})
      RETURNING id, source, record_count, status, created_at
    `
    response.status(201).json({ import: savedImport })
  } catch (error) {
    next(error)
  }
})

app.use('/api', (_request, response) => response.status(404).json({ error: 'Not found.' }))

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')))
  app.use((request, response, next) => {
    if (request.method === 'GET' && request.accepts('html')) return response.sendFile(path.join(root, 'dist', 'index.html'))
    next()
  })
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Keepsake could not complete that request.' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Keepsake is running at http://localhost:${port}`)
})
