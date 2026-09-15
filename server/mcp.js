// Minimal MCP (Model Context Protocol) handler over plain JSON-RPC, no
// extra dependency. Speaks initialize, tools/list, and tools/call so any
// MCP-compatible assistant (Claude, ChatGPT, Gemini) can read the owner's
// circle and log notes. Database access is injected, so this file is fully
// unit-testable without a live database.

export const MCP_PROTOCOL_VERSION = '2024-11-05'

export const TOOLS = [
  {
    name: 'list_people',
    description: 'List everyone in the owner\u2019s circle with names and relationships.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'person_details',
    description: 'Full profile for one person: facts, dates, reminders, and linked memories. Reference by id or name.',
    inputSchema: {
      type: 'object',
      required: ['person'],
      properties: { person: { type: 'string', description: 'Person id or full name.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'upcoming_reminders',
    description: 'Scheduled future reminders with who they are for.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 365, description: 'Look-ahead window in days.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'search',
    description: 'Search people, notes, and facts for a word or phrase.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string', description: 'What to look for.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'log_note',
    description: 'Store a raw memory note. People, facts, and dates are extracted for later review; nothing is auto-confirmed.',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string', description: 'The note, messy is fine.' } },
      additionalProperties: false,
    },
  },
]

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

const asText = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

async function callTool(name, args, context) {
  const { user, db } = context
  switch (name) {
    case 'list_people':
      return asText({ people: await db.listPeople(user.id) })
    case 'person_details': {
      const ref = nonBlank(args?.person)
      if (!ref) return { error: { code: -32602, message: 'person is required.' } }
      const details = await db.personDetails(user.id, ref)
      if (!details) return { error: { code: -32004, message: 'No such person in your circle.' } }
      return asText(details)
    }
    case 'upcoming_reminders': {
      const days = args?.days === undefined ? 30 : args.days
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return { error: { code: -32602, message: 'days must be an integer from 1 to 365.' } }
      }
      return asText({ reminders: await db.upcomingReminders(user.id, days) })
    }
    case 'search': {
      const query = nonBlank(args?.query)
      if (!query) return { error: { code: -32602, message: 'query is required.' } }
      return asText(await db.searchAll(user.id, query))
    }
    case 'log_note': {
      const text = nonBlank(args?.text)
      if (!text) return { error: { code: -32602, message: 'text is required.' } }
      if (text.length > 100000) return { error: { code: -32602, message: 'Keep the note under 100,000 characters.' } }
      return asText(await db.logNote(user.id, text))
    }
    default:
      return { error: { code: -32602, message: `Unknown tool: ${name}.` } }
  }
}

export async function handleMcpRequest(body, context) {
  const id = body?.id ?? null
  if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return fail(id, -32600, 'Invalid request.')
  }
  if (!context?.user) return fail(id, -32001, 'Authenticate with a Bearer API token.')

  if (body.method === 'initialize') {
    return ok(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'keepsake', version: '0.1.0' },
    })
  }
  if (body.method === 'notifications/initialized') return { jsonrpc: '2.0', id, result: null }
  if (body.method === 'tools/list') return ok(id, { tools: TOOLS })
  if (body.method === 'tools/call') {
    const outcome = await callTool(body.params?.name, body.params?.arguments || {}, context)
    if (outcome.error) return fail(id, outcome.error.code, outcome.error.message)
    return ok(id, outcome)
  }
  return fail(id, -32601, `Unknown method: ${body.method}.`)
}
