// Minimal in-memory sliding-window rate limiter. Per-process state is
// fine for a single-instance app server; each entry is pruned once its
// window passes, so memory tracks active clients only.

export function rateLimit({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map()
  return (request, response, next) => {
    const at = now()
    const key = request.ip || request.headers?.['x-forwarded-for'] || 'unknown'
    const timestamps = (hits.get(key) || []).filter(stamp => at - stamp < windowMs)
    if (timestamps.length >= max) {
      return response.status(429).json({ error: 'Too many requests. Try again shortly.' })
    }
    timestamps.push(at)
    hits.set(key, timestamps)
    next()
  }
}
