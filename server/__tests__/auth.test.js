import { describe, expect, it } from 'vitest'
import { hashPassword, passwordMatches, requireAuth } from '../auth.js'

describe('password hashing (scrypt)', () => {
  it('accepts the correct password', async () => {
    const { salt, hash } = await hashPassword('correct-horse-123')
    expect(await passwordMatches('correct-horse-123', salt, hash)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const { salt, hash } = await hashPassword('correct-horse-123')
    expect(await passwordMatches('wrong-password-456', salt, hash)).toBe(false)
  })

  it('uses a unique salt per password so identical passwords differ', async () => {
    const first = await hashPassword('same-password')
    const second = await hashPassword('same-password')
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })
})

describe('private route guard', () => {
  it('rejects a request without a signed-in user', () => {
    const response = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; return this },
    }
    let continued = false
    requireAuth({}, response, () => { continued = true })
    expect(response.statusCode).toBe(401)
    expect(response.body).toEqual({ error: 'Sign in to continue.' })
    expect(continued).toBe(false)
  })

  it('allows a request with a signed-in user', () => {
    let continued = false
    requireAuth({ user: { id: 'user-1' } }, {}, () => { continued = true })
    expect(continued).toBe(true)
  })
})
