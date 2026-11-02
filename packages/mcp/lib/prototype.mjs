/**
 * Where the tools act, and whether they should act at all.
 *
 * The server runs with its working directory set to the folder VS Code has
 * open, which for a designer is their prototype. That is an assumption worth
 * checking rather than trusting: an assistant will happily call snapshot in
 * whatever folder happens to be open, and the guards in the CLI exist because
 * a command aimed at the wrong directory once rewrote someone's working
 * research prototype.
 *
 * Same test as the CLI uses — a package.json that depends on
 * govuk-prototype-kit — so the two agree about what a prototype is.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const root = () => process.cwd()

const manifest = (dir) => {
  const path = join(dir, 'package.json')
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

export function assertPrototype (dir = root()) {
  const pkg = manifest(dir)
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  if (!pkg || !deps['govuk-prototype-kit']) {
    throw new Error(
      `This folder is not a prototype — ${dir} has no govuk-prototype-kit ` +
      'dependency. Open the prototype folder in VS Code, or make one with ' +
      '`npx defra-create-prototype <name>` in a terminal. Nothing has been ' +
      'changed.'
    )
  }
  return { dir, pkg, deps }
}

/**
 * The kit reads this from app/config.json, and create-prototype writes one
 * port per prototype so two can run at once. Guessing 3000 instead would send
 * a designer to whichever prototype happened to start first.
 */
export function port (dir = root()) {
  try {
    const config = JSON.parse(readFileSync(join(dir, 'app', 'config.json'), 'utf8'))
    return typeof config.port === 'number' ? config.port : 3000
  } catch {
    return 3000
  }
}

export const viewsDir = (dir = root()) => join(dir, 'app', 'views')

/** Page files, as paths relative to app/views. Excludes layouts and snapshots. */
export function pages (dir = root()) {
  const base = viewsDir(dir)
  const skip = new Set(['layouts', 'snapshots'])
  const walk = (current, prefix = '') => {
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { return [] }
    return entries.flatMap((entry) => {
      if (prefix === '' && skip.has(entry.name)) return []
      const next = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) return walk(join(current, entry.name), next)
      return entry.name.endsWith('.html') ? [next] : []
    })
  }
  return walk(base).sort()
}

/** Where a views-relative page file is served from. */
export const urlFor = (file) => {
  const path = file.replace(/\.html$/, '')
  return path === 'index' ? '/' : '/' + path.replace(/\/index$/, '')
}

export const isRunning = async (p = port()) => {
  try {
    const response = await fetch(`http://localhost:${p}/`, {
      signal: AbortSignal.timeout(1500)
    })
    return response.ok || response.status < 500
  } catch {
    return false
  }
}
