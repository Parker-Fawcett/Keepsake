import webpush from 'web-push'

export function buildNotificationPayload({ title, body, tokens }) {
  return { title, body, tokens }
}

export async function sendNotification({ title, body, tokens = [] }, env = process.env) {
  const payload = buildNotificationPayload({ title, body, tokens })
  const subscriptions = tokens.flatMap(token => {
    try {
      const value = JSON.parse(token)
      return value?.endpoint && value?.keys ? [{ token, value }] : []
    } catch {
      return []
    }
  })

  if (subscriptions.length && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(env.VAPID_SUBJECT || 'https://keepsake-yz0k.onrender.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
    const expiredTokens = []
    let delivered = 0
    let lastError = null
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription.value, JSON.stringify({ title, body, url: '/' }), { TTL: 24 * 60 * 60 })
        delivered += 1
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) expiredTokens.push(subscription.token)
        else lastError = error
      }
    }
    if (delivered) return { delivered: true, transport: 'web-push', deliveredCount: delivered, expiredTokens, payload }
    const error = lastError || new Error('All browser notification subscriptions have expired.')
    error.expiredTokens = expiredTokens
    throw error
  }

  const webhook = env.KEEPSAKE_WEBHOOK_URL
  if (!webhook) {
    // Never mark a production reminder delivered when it only reached logs.
    if (env.NODE_ENV === 'production') throw new Error('No browser subscription or reminder webhook is configured.')
    console.log(`[notify] ${title} — ${body} (${tokens.length} device${tokens.length === 1 ? '' : 's'})`)
    return { delivered: true, transport: 'log', payload }
  }
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Webhook returned ${response.status}.`)
  return { delivered: true, transport: 'webhook', payload }
}
