import { describe, expect, it } from 'vitest'
import { hashPassword, passwordMatches } from '../auth.js'

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
