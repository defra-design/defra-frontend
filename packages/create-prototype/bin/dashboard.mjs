/**
 * A page listing every prototype in the shared folder, with its versions and
 * which pages differ between them.
 *
 * Two things it is for. Finding a prototype again — on one machine this was
 * eighteen folders with names like "defra form tool working backup 4:2:25", and
 * nothing recording which was which. And preparing a comparison session: before
 * showing someone a current and a future state, the useful thing to know is
 * which pages actually changed, so the session can concentrate on those.
 *
 * The difference check has one non-obvious part. `--variants` prefixes links so
 * each version keeps to its own journey, which means every copied page differs
 * textually from its twin — `/current/task-list` against `/future/task-list`.
 * A plain comparison therefore reports all pages as changed, which is worse
 * than no answer because it looks like one. The prefix is normalised away
 * first, so "differs" means a real content change and nothing else.
 *
 * Written as a file rather than served, so there is no process to start or
 * remember to stop, and no port to clash with a prototype's own.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const VARIANTS = ['current', 'future']
const PAGE = /\.(html|njk)$/

const read = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** Pages under a directory, as paths relative to it. */
const pagesIn = (root) => {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Insurance. app/views should never contain one, but a prototype that
      // has collected one would otherwise take a very long walk.
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (PAGE.test(entry.name)) found.push(relative(root, path))
    }
  }
  if (existsSync(root)) walk(root)
  return found.sort()
}

/**
 * Remove what `--variants` changed, so a comparison sees only real edits.
 * Without this every page differs and the column is noise.
 */
const normalise = (text) => text.replace(/\/(?:current|future)(?=[/"'])/g, '/<variant>')

const escape = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** Read one prototype folder, or null if it is not a prototype. */
function inspect (dir) {
  const pkg = read(join(dir, 'package.json'))
  if (!pkg) return null
  let parsed
  try {
    parsed = JSON.parse(pkg)
  } catch {
    return null
  }
  const deps = { ...parsed.dependencies, ...parsed.devDependencies }
  if (!deps['govuk-prototype-kit']) return null

  const config = read(join(dir, 'app', 'config.json'))
  let serviceName
  try {
    serviceName = config ? JSON.parse(config).serviceName : undefined
  } catch { /* leave undefined */ }

  const views = join(dir, 'app', 'views')
  const hasVariants = VARIANTS.every((v) => existsSync(join(views, v)))

  const prototype = {
    dir,
    folder: dir.split(/[\\/]/).pop(),
    serviceName: serviceName && serviceName !== 'Service name goes here'
      ? serviceName
      : undefined,
    kit: deps['govuk-prototype-kit'],
    govuk: deps['govuk-frontend'],
    defra: deps['defra-frontend'] ?? deps['@defra/frontend'] ?? deps['@defra-design/frontend'],
    changed: statSync(dir).mtime,
    hasVariants,
    pages: hasVariants ? [] : pagesIn(views).filter((p) => !p.startsWith('layouts')),
    comparison: []
  }

  if (!hasVariants) return prototype

  const [currentDir, futureDir] = VARIANTS.map((v) => join(views, v))
  const names = [...new Set([...pagesIn(currentDir), ...pagesIn(futureDir)])].sort()

  for (const page of names) {
    const a = read(join(currentDir, page))
    const b = read(join(futureDir, page))
    let state
    if (a === null) state = 'only in future'
    else if (b === null) state = 'only in current'
    else state = normalise(a) === normalise(b) ? 'same' : 'differs'
    prototype.comparison.push({ page, state })
  }

  return prototype
}

function render (prototypes, prototypesDir) {
  const rows = prototypes.map((p) => {
    const changed = p.comparison.filter((c) => c.state !== 'same')
    const summary = p.hasVariants
      ? `${changed.length} of ${p.comparison.length} pages differ`
      : `${p.pages.length} page${p.pages.length === 1 ? '' : 's'}, no versions`

    // Only the pages that differ are listed. An unchanged page is not something
    // you act on, and one real prototype here has 3,190 of them — a table of
    // every page would be unreadable at that size and uninformative at any.
    const unchanged = p.comparison.length - changed.length
    const comparison = !p.hasVariants
      ? ''
      : changed.length === 0
        ? `<p class="empty">The two versions are identical so far.</p>`
        : `<table>
          <thead><tr><th>Page</th><th>Current</th><th>Future</th><th></th></tr></thead>
          <tbody>${changed.map((c) => `
            <tr class="changed">
              <td><code>${escape(c.page)}</code></td>
              <td>${c.state === 'only in future' ? '—' : `<a href="http://localhost:3000/current/${escape(c.page.replace(PAGE, ''))}">open</a>`}</td>
              <td>${c.state === 'only in current' ? '—' : `<a href="http://localhost:3000/future/${escape(c.page.replace(PAGE, ''))}">open</a>`}</td>
              <td class="state">${escape(c.state)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${unchanged ? `<p class="empty">${unchanged} other page${unchanged === 1 ? '' : 's'} unchanged.</p>` : ''}`

    return `<section>
      <h2>${escape(p.serviceName ?? p.folder)}</h2>
      <p class="meta">
        <code>${escape(p.folder)}</code>
        · kit ${escape(p.kit)}
        · govuk-frontend ${escape(p.govuk ?? '—')}
        ${p.defra ? `· defra-frontend ${escape(p.defra)}` : '· <span class="warn">no defra-frontend</span>'}
        · changed ${p.changed.toISOString().slice(0, 10)}
      </p>
      <p class="summary">${escape(summary)}</p>
      <pre>cd "${escape(p.dir)}"
npm run dev</pre>
      ${comparison}
    </section>`
  }).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Defra prototypes</title>
<style>
  :root { --ink: #0b0c0c; --muted: #505a5f; --line: #b1b4b6; --green: #00a33b; --bg: #fff; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #f3f2f1; --muted: #b1b4b6; --line: #505a5f; --bg: #16191b; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--ink);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, arial, sans-serif;
  }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 32px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
  .intro { color: var(--muted); margin: 0 0 40px; max-width: 60ch; }
  section { border-top: 4px solid var(--green); padding-top: 16px; margin-bottom: 48px; }
  h2 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  .meta { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
  .summary { font-weight: 500; margin: 0 0 16px; }
  .warn { color: #d4351c; }
  pre {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    padding: 12px 16px; margin: 0 0 16px;
    font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
    /* Wrapped, not scrolled. These are paths meant to be copied whole, and a
       horizontal scrollbar hides the end of the line you need. */
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-weight: 600; padding: 8px; border-bottom: 1px solid var(--line); }
  td { padding: 8px; border-bottom: 1px solid color-mix(in srgb, var(--line) 40%, transparent); }
  tr.same td { color: var(--muted); }
  tr.changed .state { font-weight: 600; }
  code { font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .empty { color: var(--muted); }
  footer { color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); padding-top: 16px; }
</style>
</head>
<body>
<main>
  <h1>Defra prototypes</h1>
  <p class="intro">
    Everything in <code>${escape(prototypesDir)}</code>. The open links work for
    whichever prototype is running — they all use port 3000, so one at a time.
  </p>
  ${prototypes.length ? rows : '<p class="empty">No prototypes found yet.</p>'}
  <footer>
    Written ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.
    Run the command again to bring it up to date — this is a file, not a live page.
  </footer>
</main>
</body>
</html>
`
}

/**
 * Build the dashboard. Returns the path written, and the prototypes found.
 *
 * `scanDir` is read and `outDir` is written to, and they are allowed to differ
 * because prototypes made before the shared folder existed are scattered
 * elsewhere — commonly a folder of git repositories. Scanning there should not
 * drop an index.html into it, so the page always lands in the tool's own
 * folder and names the folder it describes.
 */
export function buildDashboard (scanDir, outDir = scanDir) {
  const found = []
  if (existsSync(scanDir)) {
    for (const entry of readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const prototype = inspect(join(scanDir, entry.name))
      if (prototype) found.push(prototype)
    }
  }
  // Most recently touched first, which is almost always the one being looked for.
  found.sort((a, b) => b.changed - a.changed)

  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, 'index.html')
  writeFileSync(path, render(found, scanDir))
  return { path, found }
}
