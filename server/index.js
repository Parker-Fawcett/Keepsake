import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { DEMO_USER_ID, sql } from './db.js'

const app = express()
const port = Number(process.env.PORT || 5173)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', async (_request, response, next) => {
  try {
    const [database] = await sql`SELECT now() AS connected_at`
    response.json({ ok: true, database: 'connected', connectedAt: database.connected_at })
  } catch (error) {
    next(error)
  }
})

app.get('/api/people', async (_request, response, next) => {
  try {
    const people = await sql`
      SELECT id, name, relationship, color, avatar_url, created_at
      FROM people
      WHERE owner_id = ${DEMO_USER_ID} AND archived_at IS NULL
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
    if (!name || name.length > 200) return response.status(400).json({ error: 'Enter a valid name.' })

    const [person] = await sql`
      INSERT INTO people (owner_id, name, relationship)
      VALUES (${DEMO_USER_ID}, ${name}, ${relationship})
      RETURNING id, name, relationship, color, avatar_url, created_at
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
    if (!rawText || rawText.length > 100000) return response.status(400).json({ error: 'Enter a note under 100,000 characters.' })

    const [note] = await sql`
      INSERT INTO notes (owner_id, raw_text, source)
      VALUES (${DEMO_USER_ID}, ${rawText}, ${source})
      RETURNING id, raw_text, source, processing_status, created_at
    `
    response.status(201).json({ note })
  } catch (error) {
    next(error)
  }
})

app.post('/api/imports', async (request, response, next) => {
  try {
    const source = String(request.body?.source || '').trim()
    const recordCount = Math.max(0, Number(request.body?.recordCount || 0))
    if (!source || source.length > 100) return response.status(400).json({ error: 'Enter a valid import source.' })

    const [savedImport] = await sql`
      INSERT INTO imports (owner_id, source, record_count)
      VALUES (${DEMO_USER_ID}, ${source}, ${recordCount})
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
