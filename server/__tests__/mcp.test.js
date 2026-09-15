import { describe, expect, it } from 'vitest'
import { handleMcpRequest, MCP_PROTOCOL_VERSION, TOOLS } from '../mcp.js'

const USER = { id: 'user-1', email: 'qa@example.com' }
const db = {
  async listPeople() {
    return [{ id: 'p1', name: 'Maya', relationship: 'Friend' }]
  },
  async personDetails(ownerId, ref) {
    if (ownerId !== 'user-1') return null
    if (ref === 'p1' || ref === 'Maya') return { person: { id: 'p1', name: 'Maya' }, facts: [], dates: [] }
    return null
  },
  async upcomingReminders() {
    return [{ id: 'r1', title: 'Maya · Birthday', remind_at: '2026-11-01T09:00:00.000Z' }]
  },
  async searchAll() {
    return { people: [], notes: [{ id: 'n1', text: 'Maya loves sunflowers' }], facts: [] }
  },
  async logNote(text) {
    return { id: 'n9', summary: 'Found details about Maya.', people: [{ name: 'Maya' }], text }
  },
}

const call = (method, params, id = 1) => handleMcpRequest({ jsonrpc: '2.0', id, method, params }, { user: USER, db })
const read = response => JSON.parse(response.result.content[0].text)

describe('MCP protocol', () => {
  it('answers initialize with the protocol version and tool capability', async () => {
    const response = await call('initialize', {})
    expect(response.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION)
    expect(response.result.capabilities).toEqual({ tools: {} })
    expect(response.result.serverInfo.name).toMatch(/keepsake/i)
  })

  it('lists the available tools', async () => {
    const response = await call('tools/list', {})
    const names = response.result.tools.map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining(['list_people', 'person_details', 'upcoming_reminders', 'search', 'log_note']))
    expect(TOOLS.length).toBe(names.length)
  })

  it('rejects unknown methods and tools with JSON-RPC errors', async () => {
    expect((await call('nope/nope', {})).error.code).toBe(-32601)
    expect((await call('tools/call', { name: 'nope', arguments: {} })).error.code).toBe(-32602)
  })

  it('rejects malformed envelopes', async () => {
    expect((await handleMcpRequest({ method: 'tools/list' }, { user: USER, db })).error.code).toBe(-32600)
  })

  it('requires an authenticated user', async () => {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { user: null, db })
    expect(response.error.code).toBe(-32001)
  })
})

describe('MCP tools', () => {
  it('list_people returns the circle', async () => {
    const response = await call('tools/call', { name: 'list_people', arguments: {} })
    expect(read(response).people).toEqual([{ id: 'p1', name: 'Maya', relationship: 'Friend' }])
  })

  it('person_details resolves by id or name and 404s unknown people', async () => {
    expect(read(await call('tools/call', { name: 'person_details', arguments: { person: 'Maya' } })).person.id).toBe('p1')
    expect((await call('tools/call', { name: 'person_details', arguments: { person: 'Nobody' } })).error.code).toBe(-32004)
  })

  it('person_details demands a reference', async () => {
    expect((await call('tools/call', { name: 'person_details', arguments: {} })).error.code).toBe(-32602)
  })

  it('upcoming_reminders and search pass through', async () => {
    expect(read(await call('tools/call', { name: 'upcoming_reminders', arguments: {} })).reminders).toHaveLength(1)
    expect(read(await call('tools/call', { name: 'search', arguments: { query: 'sunflowers' } })).notes).toHaveLength(1)
  })

  it('search demands a query', async () => {
    expect((await call('tools/call', { name: 'search', arguments: { query: '  ' } })).error.code).toBe(-32602)
  })

  it('log_note stores text and returns the extraction summary', async () => {
    const result = read(await call('tools/call', { name: 'log_note', arguments: { text: 'Maya loves sunflowers' } }))
    expect(result.id).toBe('n9')
    expect(result.summary).toMatch(/Maya/)
  })

  it('log_note rejects blank text', async () => {
    expect((await call('tools/call', { name: 'log_note', arguments: { text: '' } })).error.code).toBe(-32602)
  })
})
