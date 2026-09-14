// Notification sender with a swappable transport. Today the default is
// the server log (no provider credentials exist yet); setting
// KEEPSAKE_WEBHOOK_URL posts each notification as JSON to that URL
// (compatible with generic webhook receivers such as ntfy). Native
// APNs/FCM delivery slots in here once provider credentials exist.

export function buildNotificationPayload({ title, body, tokens }) {
  return { title, body, tokens }
}

export async function sendNotification({ title, body, tokens = [] }, env = process.env) {
  const payload = buildNotificationPayload({ title, body, tokens })
  const webhook = env.KEEPSAKE_WEBHOOK_URL
  if (!webhook) {
    // Never mark a production reminder delivered when it only reached logs.
    if (env.NODE_ENV === 'production') throw new Error('KEEPSAKE_WEBHOOK_URL is required for production reminder delivery.')
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
