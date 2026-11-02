/**
 * Writes the VS Code configuration that lets an assistant see this design
 * system.
 *
 * Its own module, like audit.mjs and dashboard.mjs, because the merge is the
 * part worth asserting and create.mjs cannot be imported — it reads
 * process.argv at module scope and exits in dozens of places.
 *
 * Why this is done for the designer at all: anyone who can hand-write
 * .vscode/mcp.json has no need of the server it configures. The command they
 * already run is the only moment they are guaranteed to be in a terminal.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DEFRA_MCP_NAME = 'defra-mcp'

/**
 * Adds the `defra` server to .vscode/mcp.json, keeping whatever is already
 * there.
 *
 * Merging rather than writing is the whole point. A prototype may already
 * configure other MCP servers — a developer on the team may have added one —
 * and replacing the file to insert ours would delete theirs with nothing said.
 * A file that cannot be parsed is left completely alone for the same reason:
 * it is someone else's, and a confident rewrite is worse than doing nothing.
 */
export function writeEditorConfig (prototypeDir) {
  const dir = join(prototypeDir, '.vscode')
  const path = join(dir, 'mcp.json')

  let config = {}
  if (existsSync(path)) {
    try {
      config = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return { written: false, reason: 'the existing .vscode/mcp.json could not be read, so it was left alone' }
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      return { written: false, reason: 'the existing .vscode/mcp.json is not an object, so it was left alone' }
    }
  }

  // VS Code's workspace format: a `servers` object, each entry type "stdio".
  // GitHub Copilot CLI reads a different file, with an `mcpServers` key and
  // "type": "local", and does not read this one.
  config.servers = (config.servers && typeof config.servers === 'object') ? config.servers : {}

  const already = Boolean(config.servers.defra)
  if (!already) {
    config.servers.defra = { type: 'stdio', command: 'npx', args: [DEFRA_MCP_NAME] }
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
  return { written: true, already }
}
