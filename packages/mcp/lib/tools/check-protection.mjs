import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

/**
 * Asks a published prototype whether it wants a password.
 *
 * Worth a tool of its own because the failure it catches is invisible from
 * every other angle: a prototype with PASSWORD set but NODE_ENV unset serves
 * the real thing to anyone, and looks identical to a protected one from the
 * hosting dashboard, from the repository, and from the designer's machine.
 * The only way to know is to ask it over the network.
 */
const require = createRequire(import.meta.url)

export const checkProtection = {
  name: 'check_protection',
  description:
    'Ask a published prototype whether it is password protected. Use this ' +
    'after publishing and before the address is shared with anyone — a ' +
    'prototype that is open looks exactly like one that is protected.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The published address, for example https://my-service.onrender.com'
      }
    },
    required: ['url'],
    additionalProperties: false
  },
  handler ({ url }) {
    const cli = require.resolve('defra-create-prototype/bin/create.mjs')
    const result = spawnSync(process.execPath, [cli, '--check', String(url)], {
      encoding: 'utf8'
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (!output) {
      throw new Error(`Could not check ${url} — the command returned nothing.`)
    }
    // A non-zero exit means unprotected or unreachable, which is information
    // rather than a failure of this tool. Returned as text so the assistant
    // relays what was found instead of reporting that a tool broke.
    return output
  }
}
