import { createMcpServer, defineTool } from 'mcp-tanstack-start'
import { z } from 'zod'

async function run(enableJsonResponse) {
  const events = []
  const tool = defineTool({
    name: 'whoami',
    description: 'returns auth',
    parameters: z.object({}),
    execute: async (_args, ctx) => {
      events.push({ stage: 'execute', auth: ctx.auth ?? null })
      return JSON.stringify({ auth: ctx.auth ?? null })
    },
  })

  const mcp = createMcpServer({
    name: 'test',
    version: '1.0.0',
    tools: [tool],
    transport: { enableJsonResponse },
  })

  const initReq = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }),
  })

  const initRes = await mcp.handleRequest(initReq, {
    auth: { token: 't', claims: { sub: 'user-123' } },
  })
  const sessionId = initRes.headers.get('Mcp-Session-Id')
  const initBody = await initRes.text()

  const callReq = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'whoami', arguments: {} },
    }),
  })

  const callRes = await mcp.handleRequest(callReq, {
    auth: { token: 't', claims: { sub: 'user-123' } },
  })
  const callText = await callRes.text()

  return {
    enableJsonResponse,
    initStatus: initRes.status,
    callStatus: callRes.status,
    sessionId,
    initBody,
    callText,
    events,
  }
}

const a = await run(false)
const b = await run(true)
console.log(JSON.stringify({ a, b }, null, 2))
