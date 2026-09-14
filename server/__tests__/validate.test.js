import { describe, expect, it } from 'vitest'
import {
  isValidEmail,
  isValidImportSource,
  isValidName,
  isValidNoteText,
  isValidOptionalEmail,
  isValidOptionalPhone,
  isValidPassword,
  isValidPushPlatform,
  isValidPushToken,
  normalizeEmail,
} from '../validate.js'

describe('input validators', () => {
  it('accepts normal emails and normalizes case and whitespace', () => {
    expect(isValidEmail('you@example.com')).toBe(true)
    expect(normalizeEmail('  You@Example.COM ')).toBe('you@example.com')
  })

  it('rejects malformed emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@domain')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('requires passwords of at least 8 characters', () => {
    expect(isValidPassword('1234567')).toBe(false)
    expect(isValidPassword('12345678')).toBe(true)
  })

  it('requires names between 1 and 200 characters', () => {
    expect(isValidName('')).toBe(false)
    expect(isValidName('   ')).toBe(false)
    expect(isValidName('Maya')).toBe(true)
    expect(isValidName('x'.repeat(200))).toBe(true)
    expect(isValidName('x'.repeat(201))).toBe(false)
  })

  it('requires note text between 1 and 100,000 characters', () => {
    expect(isValidNoteText('')).toBe(false)
    expect(isValidNoteText('hello')).toBe(true)
    expect(isValidNoteText('x'.repeat(100000))).toBe(true)
    expect(isValidNoteText('x'.repeat(100001))).toBe(false)
  })

  it('requires a non-empty import source under 100 characters', () => {
    expect(isValidImportSource('')).toBe(false)
    expect(isValidImportSource('LinkedIn')).toBe(true)
    expect(isValidImportSource('x'.repeat(101))).toBe(false)
  })

  it('treats a missing contact email as valid, a present one must be well-formed', () => {
    expect(isValidOptionalEmail('')).toBe(true)
    expect(isValidOptionalEmail(null)).toBe(true)
    expect(isValidOptionalEmail(undefined)).toBe(true)
    expect(isValidOptionalEmail('maya@example.com')).toBe(true)
    expect(isValidOptionalEmail('not-an-email')).toBe(false)
  })

  it('treats a missing phone as valid, a present one needs 7 to 15 digits', () => {
    expect(isValidOptionalPhone('')).toBe(true)
    expect(isValidOptionalPhone(null)).toBe(true)
    expect(isValidOptionalPhone('+1 (415) 555-0132')).toBe(true)
    expect(isValidOptionalPhone('4155550132')).toBe(true)
    expect(isValidOptionalPhone('123')).toBe(false)
    expect(isValidOptionalPhone('call me')).toBe(false)
    expect(isValidOptionalPhone('1'.repeat(16))).toBe(false)
  })

  it('requires push tokens between 1 and 4096 characters', () => {
    expect(isValidPushToken('')).toBe(false)
    expect(isValidPushToken('ExponentPushToken[abc123]')).toBe(true)
    expect(isValidPushToken('x'.repeat(4097))).toBe(false)
  })

  it('only accepts known push platforms', () => {
    expect(isValidPushPlatform('web')).toBe(true)
    expect(isValidPushPlatform('ios')).toBe(true)
    expect(isValidPushPlatform('android')).toBe(true)
    expect(isValidPushPlatform('carrier-pigeon')).toBe(false)
    expect(isValidPushPlatform('')).toBe(false)
  })
})
