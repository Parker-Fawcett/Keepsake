import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { attachUser, clearSession, createSession, hashPassword, passwordMatches, requireAuth } from './auth.js'
import { sql } from './db.js'
import { extractRelationships } from './extract.js'
import { buildImportReview, MAX_REVIEW_RECORDS, validateImportConfirm } from './imports.js'
import { buildAuthUrl, exchangeCode, fetchConnections, isGoogleConfigured, redirectUriFor, refreshAccessToken } from './google.js'
import { validateConfirmPayload } from './confirm.js'
import { rateLimit } from './ratelimit.js'
import { buildRemindersForDate, DEFAULT_REMINDER_RULES } from './reminders.js'
import { decryptSecret, encryptSecret, hasTokenEncryptionKey, isEncryptedSecret } from './secrets.js'
import { isValidEmail, isValidImportSource, isValidName, isValidNoteText, isValidOptionalEmail, isValidOptionalPhone, isValidPassword, isValidPushPlatform, isValidPushToken, normalizeEmail } from './validate.js'

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

// Everything below this line contains private relationship data. A request
// must have a valid session; there is no shared fallback account.
app.use('/api', requireAuth)

app.post('/api/push-tokens', async (request, response, next) => {
  try {
    const token = String(request.body?.token || '').trim()
    const platform = String(request.body?.platform || '').trim()
    if (!isValidPushToken(token)) return response.status(400).json({ error: 'Enter a valid device token.' })
    if (!isValidPushPlatform(platform)) return response.status(400).json({ error: 'Enter a valid platform.' })
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

app.post('/api/notes', async (request, response, next) => {
  try {
    const rawText = String(request.body?.rawText || '').trim()
    const source = String(request.body?.source || 'manual').trim()
    if (!isValidNoteText(rawText)) return response.status(400).json({ error: 'Enter a note under 100,000 characters.' })

    const ownerId = ownerIdFor(request)
    const [note] = await sql`
      INSERT INTO notes (owner_id, raw_text, source)
      VALUES (${ownerId}, ${rawText}, ${source})
      RETURNING id, raw_text, source, processing_status, created_at
    `

    // Run relationship extraction without ever failing the saved note.
    // Without OPENAI_API_KEY this uses the local heuristic; with a key it
    // calls the model and falls back to local on any error.
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
      return response.status(201).json({ note: updated, extraction: data, extractionMode: mode })
    } catch (extractionError) {
      console.error(extractionError)
      await sql`UPDATE notes SET processing_error = 'extraction failed', processing_status = 'pending' WHERE id = ${note.id}`
      return response.status(201).json({ note, extraction: null, extractionMode: 'failed' })
    }
  } catch (error) {
    next(error)
  }
})

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
    response.json({ reminders })
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
      SELECT id, title, remind_at FROM reminders
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
