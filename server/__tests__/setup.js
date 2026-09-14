// Unit tests cover pure backend logic (extraction, password hashing,
// validation) and must never require a live database. server/db.js throws
// at import time when DATABASE_URL is missing, so provide a dummy value
// here. Nothing in these tests opens a connection.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?sslmode=require'
}
