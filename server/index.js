import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { attachUser, clearSession, createSession, hashPassword, passwordMatches } from './auth.js'
import { DEMO_USER_ID, sql } from './db.js'
import { extractRelationships } from './extract.js'
import { buildImportReview, MAX_REVIEW_RECORDS } from './imports.js'
import { validateConfirmPayload } from './confirm.js'
import { buildRemindersForDate, DEFAULT_REMINDER_RULES } from './reminders.js'
import { isValidEmail, isValidImportSource, isValidName, isValidNoteText, isValidOptionalEmail, isValidOptionalPhone, isValidPassword, normalizeEmail } from './validate.js'

const app = express()
const port = Number(process.env.PORT || 5173)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))
app.use(attachUser)

const ownerIdFor = request => request.user?.id ?? DEMO_USER_ID

app.get('/api/health', async (_request, response, next) => {
  try {
    const [database] = await sql`SELECT now() AS connected_at`
    response.json({ ok: true, database: 'connected', connectedAt: database.connected_at })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', (request, response) => {
  response.json({ user: request.user ?? null })
})

app.post('/api/auth/signup', async (request, response, next) => {
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
    next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body?.email)
    const password = String(request.body?.password || '')
    const [user] = await sql`SELECT id, email, display_name, password_salt, password_hash FROM users WHERE lower(email) = ${email}`
    if (!user?.password_hash) return response.status(401).json({ error: 'No account found for that email.' })
    const ok = await passwordMatches(password, user.password_salt, user.password_hash)
    if (!ok) return response.status(401).json({ error: 'That password did not match.' })
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
