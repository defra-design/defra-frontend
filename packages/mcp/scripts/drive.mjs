/**
 * A minimal MCP client over stdio, for testing the server the way a client
 * actually talks to it.
 *
 * Importing the tool handlers directly would test the handlers and not the
 * server: it would not catch a malformed schema, a tool missing from
 * tools/list, a crash during initialize, or anything written to stdout that
 * corrupts the protocol stream. Those are the failures that present to a
 * designer as "the tools are not there", with nothing in any log.
 */
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SERVER = join(here, '..', 'bin', 'server.mjs')

export function open ({ cwd = process.cwd() } = {}) {
  const child = spawn(process.execPath, [SERVER], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  let buffer = ''
  const waiting = new Map()
  const stderr = []

  child.stderr.on('data', (d) => stderr.push(d.toString()))
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    let index
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      const resolve = waiting.get(message.id)
      if (resolve) { waiting.delete(message.id); resolve(message) }
    }
  })

  let nextId = 1
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++
    waiting.set(id, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => {
      if (waiting.has(id)) {
        waiting.delete(id)
        reject(new Error(`${method} timed out. stderr: ${stderr.join('') || '(empty)'}`))
      }
    }, 15000)
  })

  const notify = (method, params) =>
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')

  return {
    async start () {
      const res = await send('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'behaviour', version: '0' }
      })
      notify('notifications/initialized', {})
      return res
    },
    list: () => send('tools/list', {}),
    call: (name, args = {}) => send('tools/call', { name, arguments: args }),
    stderr: () => stderr.join(''),
    close: () => child.kill()
  }
}

/** Text of a tools/call result, whatever content blocks it came back in. */
export const textOf = (response) =>
  (response?.result?.content ?? []).map((c) => c.text ?? '').join('\n')
