import { describe, expect, it, vi } from 'vitest'
import { buildNotificationPayload, sendNotification } from '../notify.js'

describe('reminder delivery', () => {
  it('builds the provider payload', () => {
    expect(buildNotificationPayload({ title: 'Birthday', body: 'Maya', tokens: ['one'] }))
      .toEqual({ title: 'Birthday', body: 'Maya', tokens: ['one'] })
  })

  it('refuses to report log-only delivery in production', async () => {
    await expect(sendNotification({ title: 'Birthday', body: 'Maya' }, { NODE_ENV: 'production' }))
      .rejects.toThrow(/No browser subscription/)
  })

  it('keeps log delivery available for local development', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(sendNotification({ title: 'Birthday', body: 'Maya' }, { NODE_ENV: 'development' }))
      .resolves.toMatchObject({ delivered: true, transport: 'log' })
    spy.mockRestore()
  })
})
