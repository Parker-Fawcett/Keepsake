import { readdir, readFile } from 'node:fs/promises'
import { sql } from './db.js'

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`

const migrationsDirectory = new URL('../db/migrations/', import.meta.url)
const files = (await readdir(migrationsDirectory)).filter(file => file.endsWith('.sql')).sort()

for (const filename of files) {
  const [applied] = await sql`SELECT filename FROM schema_migrations WHERE filename = ${filename}`
  if (applied) continue

  const migration = await readFile(new URL(filename, migrationsDirectory), 'utf8')
  const statements = migration.split(';').map(statement => statement.trim()).filter(Boolean)
  for (const statement of statements) await sql.query(statement)
  await sql`INSERT INTO schema_migrations (filename) VALUES (${filename})`
  console.log(`Applied ${filename}`)
}
console.log('Keepsake database schema is up to date.')
