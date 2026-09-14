import { describe, expect, it } from 'vitest'
import { buildAuthUrl, isGoogleConfigured, mapConnectionToRecord } from '../google.js'

describe('isGoogleConfigured', () => {
  it('is false without a client id and secret', () => {
    expect(isGoogleConfigured({})).toBe(false)
    expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: 'id' })).toBe(false)
  })

  it('is true with both set', () => {
    expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })).toBe(true)
  })
})

describe('buildAuthUrl', () => {
  it('points at Google with the contacts scope and offline access', () => {
    const url = new URL(buildAuthUrl(
      { GOOGLE_CLIENT_ID: 'cid' },
      'https://app.example.com/api/auth/google/callback',
      'state-123',
    ))
    expect(url.hostname).toBe('accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/auth/google/callback')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('scope')).toContain('contacts.readonly')
    expect(url.searchParams.get('access_type')).toBe('offline')
  })
})

describe('mapConnectionToRecord', () => {
  it('pulls name, first email, first phone, and company', () => {
    expect(mapConnectionToRecord({
      names: [{ displayName: 'Maya Johnson' }],
      emailAddresses: [{ value: 'maya@example.com' }, { value: 'other@example.com' }],
      phoneNumbers: [{ canonicalForm: '+14155550132' }],
      organizations: [{ name: 'Acme' }],
    })).toEqual({ name: 'Maya Johnson', email: 'maya@example.com', phone: '+14155550132', company: 'Acme' })
  })

  it('returns null for a connection without a name', () => {
    expect(mapConnectionToRecord({ emailAddresses: [{ value: 'noname@example.com' }] })).toBe(null)
  })

  it('keeps only the fields Google actually sent', () => {
    expect(mapConnectionToRecord({ names: [{ displayName: 'Jake' }] })).toEqual({ name: 'Jake' })
  })
})
