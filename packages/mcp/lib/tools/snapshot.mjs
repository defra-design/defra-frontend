import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { assertPrototype } from '../prototype.mjs'

/**
 * Freezes the pages as they are now, under /snapshots/<label>.
 *
 * Shelled out rather than imported: create.mjs reads process.argv at module
 * scope and calls process.exit in 37 places, so importing it would end this
 * server. Resolved from this package's own dependency rather than fetched by
 * npx, so it is the version this was tested against and works offline.
 */
const require = createRequire(import.meta.url)

export const snapshot = {
  name: 'snapshot',
  description:
    'Freeze the prototype\'s pages as they are now, so a round of research ' +
    'stays viewable after the pages move on. The frozen copy is served by the ' +
    'same prototype and the live pages are untouched.',
  inputSchema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'What to call it, for example "round 1" or "before the task list".'
      },
      note: {
        type: 'string',
        description: 'Optional. Why it was taken — read back on the dashboard later.'
      }
    },
    required: ['label'],
    additionalProperties: false
  },
  handler ({ label, note }) {
    const { dir } = assertPrototype()

    const cli = require.resolve('defra-create-prototype/bin/create.mjs')
    const args = [cli, '--snapshot', String(label)]
    if (note) args.push('--note', String(note))

    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()

    if (result.status !== 0) {
      throw new Error(output || `Snapshot failed with exit code ${result.status}.`)
    }
    return output
  }
}
