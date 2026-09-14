import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, hasTokenEncryptionKey, isEncryptedSecret } from '../secrets.js'

const env = { NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: 'a-long-test-only-encryption-key' }

describe('connected-account credential encryption', () => {
  it('round trips a credential without exposing the original value', () => {
    const encrypted = encryptSecret('google-token-value', env)
    expect(isEncryptedSecret(encrypted)).toBe(true)
    expect(encrypted).not.toContain('google-token-value')
    expect(decryptSecret(encrypted, env)).toBe('google-token-value')
  })

  it('uses a unique nonce each time', () => {
    expect(encryptSecret('same-token', env)).not.toBe(encryptSecret('same-token', env))
  })

  it('keeps legacy plaintext readable during migration', () => {
    expect(decryptSecret('legacy-plaintext', env)).toBe('legacy-plaintext')
  })

  it('requires a key in production', () => {
    expect(hasTokenEncryptionKey({})).toBe(false)
    expect(() => encryptSecret('token', { NODE_ENV: 'production' })).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })
})
