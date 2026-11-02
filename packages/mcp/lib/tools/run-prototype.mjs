import { spawn } from 'node:child_process'
import { assertPrototype, port, isRunning } from '../prototype.mjs'

/**
 * Starts the prototype so the designer can look at it.
 *
 * `npm run dev` is the command — it watches files and reloads. Not `npm start`
 * instead, which the kit maps to its hosting server: that one does not watch,
 * so a designer makes a change, refreshes, sees nothing, and concludes the
 * tool is broken. The kit's own CLI calls it the wrong command locally.
 *
 * Detached, because an MCP tool call has to return promptly and the server has
 * to outlive it. That does mean a prototype left running after the editor
 * closes, which is the same thing that happens when a designer closes a
 * terminal tab, and is why this reports the port rather than hiding it.
 */
export const runPrototype = {
  name: 'run_prototype',
  description:
    'Start the prototype so it can be viewed in a browser, and return its ' +
    'address. Use this when the designer wants to see their changes. If it ' +
    'is already running this just reports where.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async handler () {
    const { dir } = assertPrototype()
    const p = port(dir)
    const url = `http://localhost:${p}`

    if (await isRunning(p)) {
      return `Already running at ${url} — the page reloads by itself when a file is saved.`
    }

    const child = spawn('npm', ['run', 'dev'], {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32'
    })
    child.unref()

    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (await isRunning(p)) {
        return [
          `Running at ${url}`,
          '',
          'It reloads by itself when a file is saved, so it can be left open.',
          'To stop it, close the terminal it is running in, or quit the editor.'
        ].join('\n')
      }
    }

    throw new Error(
      `Started npm run dev but nothing answered on port ${p} within two ` +
      'minutes. Run `npm run dev` in a terminal from the prototype folder to ' +
      'see what it is reporting — the first run after an install is slow, and ' +
      'a missing dependency shows up there.'
    )
  }
}
