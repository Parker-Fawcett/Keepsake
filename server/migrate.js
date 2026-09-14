import { readFile } from 'node:fs/promises'
import { sql } from './db.js'

const migration = await readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8')
const statements = migration
  .split(';')
  .map(statement => statement.trim())
  .filter(Boolean)

for (const statement of statements) {
  await sql.query(statement)
}
console.log('Keepsake database schema is up to date.')
