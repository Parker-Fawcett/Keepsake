import { describe, expect, it, vi } from 'vitest'
import { rateLimit } from '../ratelimit.js'

function request(ip = '1.2.3.4') {
  return { ip }
}

function response() {
  const res = { statusCode: 200, body: null }
  res.status = code => {
    res.statusCode = code
    return res
  }
  res.json = payload => {
    res.body = payload
    return res
  }
  return res
}

describe('rateLimit', () => {
  it('lets requests through under the limit', () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2 })
    const res = response()
    let nextCalls = 0
    limiter(request(), res, () => {
      nextCalls += 1
    })
    limiter(request(), res, () => {
      nextCalls += 1
    })
    expect(nextCalls).toBe(2)
    expect(res.statusCode).toBe(200)
  })

  it('blocks the request past the limit with a 429', () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 })
    limiter(request(), response(), () => {})
    const res = response()
    let nextCalls = 0
    limiter(request(), res, () => {
      nextCalls += 1
    })
    expect(nextCalls).toBe(0)
    expect(res.statusCode).toBe(429)
  })

  it('tracks different clients separately', () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 })
    limiter(request('1.1.1.1'), response(), () => {})
    const res = response()
    let nextCalls = 0
    limiter(request('2.2.2.2'), res, () => {
      nextCalls += 1
    })
    expect(nextCalls).toBe(1)
  })

  it('resets the window over time', () => {
    const now = vi.fn(() => 0)
    const limiter = rateLimit({ windowMs: 1000, max: 1, now })
    limiter(request(), response(), () => {})
    now.mockReturnValue(1001)
    const res = response()
    let nextCalls = 0
    limiter(request(), res, () => {
      nextCalls += 1
    })
    expect(nextCalls).toBe(1)
  })
})
