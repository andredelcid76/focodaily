import { createMcpServer, defineTool } from 'mcp-tanstack-start'
import { z } from 'zod'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function readOneChunk(response, timeoutMs = 500) {
  if (!response.body) return null
  const reader = response.body.getReader()
  try {
    return await Promise.race([
      reader.read(),
      sleep(timeoutMs).then(() => ({ timeout: true })),
    ])
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

async function run(enableJsonResponse) {
  const events = []
  const tool = defineTool({
    name: 'whoami',
    description: 'returns auth',
    parameters: z.object({}),
    execute: async (_args, ctx) => {
      events.push({ auth: ctx.auth ?? null })
      return JSON.stringify({ auth: ctx.auth ?? null })
    },
  })

  const mcp = createMcpServer({
    name: 'test',
    version: '1.0.0',
    tools: [tool],
    transport: { enableJsonResponse },
  })

  const initRes = await mcp.handleRequest(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    }),
  }), { auth: { token: 't', claims: { sub: 'user-123' } } })

  const initChunk = await readOneChunk(initRes)
  const sessionId = initRes.headers.get('Mcp-Session-Id')

  const callRes = await mcp.handleRequest(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} },
    }),
  }), { auth: { token: 't', claims: { sub: 'user-123' } } })

  const callChunk = await readOneChunk(callRes)
  await sleep(100)

  return {
    enableJsonResponse,
    initStatus: initRes.status,
    callStatus: callRes.status,
    initContentType: initRes.headers.get('content-type'),
    callContentType: callRes.headers.get('content-type'),
    initChunk: initChunk?.value ? new TextDecoder().decode(initChunk.value) : initChunk,
    callChunk: callChunk?.value ? new TextDecoder().decode(callChunk.value) : callChunk,
    events,
  }
}

console.log(JSON.stringify({
  streamMode: await run(false),
  jsonMode: await run(true),
}, null, 2))
