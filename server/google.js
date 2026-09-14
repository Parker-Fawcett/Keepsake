// Google contacts sync over OAuth 2.0 + the People API. Pure helpers are
// unit-tested; the network calls below use plain fetch so no extra
// dependency is needed. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET,
// plus the People API enabled in the Google Cloud project.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CONNECTIONS_ENDPOINT = 'https://people.googleapis.com/v1/people/me/connections'
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly', 'openid', 'email'].join(' ')

export function isGoogleConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export function redirectUriFor(env = process.env, requestHost) {
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI
  const host = requestHost || 'localhost:5173'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}/api/auth/google/callback`
}

export function buildAuthUrl(env = process.env, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export function mapConnectionToRecord(connection) {
  const name = connection.names?.[0]?.displayName?.trim()
  if (!name) return null
  const record = { name }
  const email = connection.emailAddresses?.[0]?.value?.trim()
  if (email) record.email = email
  const phone = connection.phoneNumbers?.[0]?.canonicalForm?.trim() || connection.phoneNumbers?.[0]?.value?.trim()
  if (phone) record.phone = phone
  const company = connection.organizations?.[0]?.name?.trim()
  if (company) record.company = company
  return record
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  if (!response.ok) throw new Error(`Google request failed with status ${response.status}.`)
  return response.json()
}

export async function exchangeCode(env, code, redirectUri) {
  return postForm(TOKEN_ENDPOINT, {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
}

export async function refreshAccessToken(env, refreshToken) {
  return postForm(TOKEN_ENDPOINT, {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
}

export async function fetchConnections(accessToken) {
  const records = []
  let pageToken = ''
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,organizations',
      pageSize: '1000',
      ...(pageToken ? { pageToken } : {}),
    })
    const response = await fetch(`${CONNECTIONS_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new Error(`People API returned status ${response.status}.`)
    const payload = await response.json()
    for (const connection of payload.connections || []) {
      const record = mapConnectionToRecord(connection)
      if (record) records.push(record)
      if (records.length >= 5000) return records
    }
    pageToken = payload.nextPageToken || ''
    if (!pageToken) break
  }
  return records
}
