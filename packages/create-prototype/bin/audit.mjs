/**
 * Run an accessibility audit over a prototype's own pages.
 *
 * Two things make this worth having rather than telling designers to install
 * pa11y themselves.
 *
 * The first is that we know what the pages are. A generic tool needs a URL, or
 * a sitemap, or a crawl — and a prototype has neither a sitemap nor reliable
 * links between every page, so a crawl misses whole journeys. The kit maps
 * app/views to routes, so the list of pages is already on disk.
 *
 * The second is that a page which did not render must not be reported as a page
 * with no problems. A check-answers page reading session data that is not there
 * can return 500, pa11y will happily audit the kit's error page, and the result
 * is a clean bill of health for a page nobody has tested. So every URL is asked
 * for its status first, and anything that is not 200 is named as unchecked
 * rather than counted as a pass.
 *
 * The browser is not a dependency of this package. pa11y is fetched by npx on
 * demand, and pointed at the Chrome already on the machine.
 *
 * It took running this to find out that `npx pa11y-ci` does NOT come with a
 * browser. pa11y depends on puppeteer, whose Chromium arrives through a
 * postinstall script, and npx does not run it — so pa11y installs fine and then
 * fails with "Could not find Chrome (ver. 156.0.8078.47)", a pinned version
 * that `puppeteer browsers install chrome` would not necessarily match either.
 *
 * Using the installed browser is the better answer regardless. It is instant
 * rather than a few hundred megabytes, and on a government laptop behind a
 * proxy a large download is the likeliest thing to fail.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'

// Frozen copies and the shared layout are not pages of the prototype. Auditing
// snapshots would also multiply the runtime by however many rounds someone has
// kept, to report problems in pages nobody is going to change.
const NOT_AUDITED = ['layouts', 'snapshots']

const PAGE = /\.(html|njk)$/

/**
 * The URL paths a prototype serves from app/views.
 *
 * The kit's routing, which is what this has to agree with: a file at
 * `apply/name.html` is served at `/apply/name`, and `index.html` in a folder is
 * served at the folder itself.
 */
export function pagePaths (viewsDir) {
  if (!existsSync(viewsDir)) return []
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (dir === viewsDir && NOT_AUDITED.includes(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!PAGE.test(entry.name)) continue
      const parts = relative(viewsDir, path).split(sep)
      const file = parts.pop().replace(PAGE, '')
      const route = file === 'index' ? parts : [...parts, file]
      found.push('/' + route.join('/'))
    }
  }
  walk(viewsDir)
  // A prototype with both index.html and index.njk would otherwise be asked
  // about the same route twice.
  return [...new Set(found)]
}

/**
 * Ask each page for its status, so a page that did not render is not audited
 * as though it had. Returns the ones worth auditing and the ones that are not.
 */
export async function reachable (base, paths, fetchImpl = fetch) {
  const ok = []
  const broken = []
  for (const path of paths) {
    try {
      const response = await fetchImpl(`${base}${path}`, { redirect: 'manual' })
      // A redirect is the prototype's own journey logic — a page that sends you
      // somewhere else has not failed, but auditing it would audit wherever it
      // sent you under this page's name.
      if (response.status >= 300 && response.status < 400) {
        broken.push({ path, reason: `redirects to ${response.headers.get('location') ?? 'somewhere else'}` })
      } else if (response.ok) {
        ok.push(path)
      } else {
        broken.push({ path, reason: `answered ${response.status}` })
      }
    } catch (error) {
      broken.push({ path, reason: error.message })
    }
  }
  return { ok, broken }
}

/**
 * Group pa11y's output by issue rather than by page.
 *
 * By page is how the tool reports it and the wrong way round for acting on it:
 * one missing label pattern in a shared include is twelve findings on twelve
 * pages and one thing to change. Grouping by issue puts the size of each
 * problem next to it.
 */
export function summarise (results) {
  const issues = new Map()
  let errors = 0
  let warnings = 0

  // axe appends its documentation URL to the message, which is the most useful
  // thing in the finding and the worst place to put it — it pushes every line
  // past the width of a terminal. Pulled out and shown as what it is.
  const split = (message = '') => {
    const match = /^(.*?)\s*\((https?:\/\/[^)]+)\)\s*$/.exec(message)
    return match ? { message: match[1], help: match[2] } : { message, help: null }
  }

  for (const [url, found] of Object.entries(results ?? {})) {
    // pa11y-ci puts a string here when the page itself could not be loaded.
    if (!Array.isArray(found)) continue
    const path = (() => {
      try {
        return new URL(url).pathname
      } catch {
        return url
      }
    })()

    for (const issue of found) {
      if (issue.type === 'error') errors++
      else if (issue.type === 'warning') warnings++
      else continue

      const key = `${issue.type}:${issue.code}`
      if (!issues.has(key)) {
        issues.set(key, {
          code: issue.code,
          type: issue.type,
          ...split(issue.message),
          pages: new Set(),
          examples: []
        })
      }
      const entry = issues.get(key)
      entry.pages.add(path)
      if (entry.examples.length < 3 && issue.selector) {
        entry.examples.push({ path, selector: issue.selector })
      }
    }
  }

  const list = [...issues.values()]
    .map((i) => ({ ...i, pages: [...i.pages].sort() }))
    // Errors before warnings, then by how much of the prototype is affected.
    .sort((a, b) =>
      (a.type === b.type ? 0 : a.type === 'error' ? -1 : 1) ||
      b.pages.length - a.pages.length ||
      a.code.localeCompare(b.code))

  return { issues: list, errors, warnings }
}

// Where a Chromium-based browser normally is. Edge is listed because it is
// installed by default on a Defra Windows laptop, and it is Chromium underneath
// so puppeteer drives it the same way.
const BROWSERS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ]
}

/**
 * The browser to drive, or null to let pa11y look for its own.
 *
 * Null is not a failure: someone may have puppeteer's Chromium cached from
 * another project, and pa11y will find it. It only becomes a failure if the run
 * then says it could not find Chrome, which is handled where that is reported.
 */
export function findBrowser (
  { env = process.env, platform = process.platform, exists = existsSync } = {}
) {
  // Both conventions, because a developer who has set one of these has a
  // reason, and overriding it would be rude.
  for (const name of ['PUPPETEER_EXECUTABLE_PATH', 'CHROME_PATH']) {
    if (env[name] && exists(env[name])) return env[name]
  }
  for (const path of BROWSERS[platform] ?? BROWSERS.linux) {
    if (exists(path)) return path
  }
  return null
}

/** True when a pa11y failure was the missing-browser one, which has a fix. */
export const missingBrowser = (stderr = '') =>
  /Could not find (Chrome|Chromium|browser)/i.test(stderr)

const escape = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** A report to keep or send on, since terminal output cannot be attached to anything. */
export function renderReport ({ name, base, audited, broken, summary }) {
  const row = (i) => `<section class="issue ${i.type}">
    <h3>${escape(i.message)}</h3>
    <p class="meta">
      <code>${escape(i.code)}</code> · ${i.type} ·
      ${i.pages.length} of ${audited.length} page${audited.length === 1 ? '' : 's'}
      ${i.help ? `· <a href="${escape(i.help)}">how to fix</a>` : ''}
    </p>
    <ul>${i.examples.map((e) => `<li><code>${escape(e.selector)}</code> on
      <a href="${escape(base + e.path)}">${escape(e.path)}</a></li>`).join('')}</ul>
    ${i.pages.length > i.examples.length
      ? `<p class="pages">Every page: ${i.pages.map((p) =>
          `<a href="${escape(base + p)}">${escape(p)}</a>`).join(' ')}</p>`
      : ''}
  </section>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility audit — ${escape(name)}</title>
<style>
  :root { --ink: #0b0c0c; --muted: #505a5f; --line: #b1b4b6; --red: #d4351c; --amber: #f47738; --bg: #fff; }
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
  h3 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
  .intro, .caveat { color: var(--muted); max-width: 70ch; }
  .caveat { border-left: 4px solid var(--line); padding-left: 16px; margin: 32px 0; }
  .issue { border-top: 4px solid var(--line); padding-top: 16px; margin-bottom: 32px; }
  .issue.error { border-color: var(--red); }
  .issue.warning { border-color: var(--amber); }
  .meta { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
  ul { margin: 0 0 8px; padding-left: 20px; }
  li { font-size: 14px; }
  .pages { font-size: 13px; color: var(--muted); margin: 0; }
  code { font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .ok { font-weight: 500; }
  footer { color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); padding-top: 16px; }
</style>
</head>
<body>
<main>
  <h1>Accessibility audit</h1>
  <p class="intro">
    ${escape(name)} · ${audited.length} page${audited.length === 1 ? '' : 's'} checked ·
    ${summary.issues.length} thing${summary.issues.length === 1 ? '' : 's'} to fix ·
    ${summary.errors} error${summary.errors === 1 ? '' : 's'},
    ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'} in total
  </p>
  <div class="caveat">
    <p>
      <strong>An automated check finds a minority of accessibility problems.</strong>
      It reads the markup. It cannot tell you whether the page makes sense read
      aloud, whether the reading order matches the visual order, whether an
      error message explains how to fix the error, or whether a journey can be
      completed by keyboard. Those need a person.
    </p>
    <p>
      So this is a list of things to fix, not a score, and a prototype with no
      errors here has not been accessibility tested. Nothing in this file should
      be quoted as a pass.
    </p>
    <p>
      One gap worth knowing by name, because it is a common prototyping habit:
      a field with a <code>placeholder</code> and no <code>&lt;label&gt;</code>
      raises nothing here. axe takes the placeholder as the field's name, so
      the field looks named — but a placeholder is not a label. It disappears
      as soon as someone types, it is grey on white, and it leaves the field
      unnamed for anyone who comes back to it. Check by eye that every field
      has a visible label that stays put.
    </p>
  </div>
  ${summary.issues.length
    ? summary.issues.map(row).join('')
    : '<p class="ok">No automated issues found in the pages checked. See above for what that does and does not mean.</p>'}
  ${broken.length
    ? `<section class="issue">
        <h3>Not checked</h3>
        <p class="meta">These pages did not return a page to check, so they are
        absent from the counts above rather than counted as passing.</p>
        <ul>${broken.map((b) => `<li><code>${escape(b.path)}</code> — ${escape(b.reason)}</li>`).join('')}</ul>
      </section>`
    : ''}
  <footer>
    axe-core via pa11y, against WCAG 2.1 AA — axe's own "best practice" rules
    are outside that and were not run, so things like heading order are not
    covered here. Written
    ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.
  </footer>
</main>
</body>
</html>
`
}

/**
 * Run pa11y over the given URLs via npx, and return its parsed JSON.
 *
 * A config file rather than arguments: the runner and standard belong with the
 * URLs, and pa11y-ci reads `.pa11yci`-shaped JSON from a path.
 */
export function runPa11y (base, paths, { browser = findBrowser() } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'defra-audit-'))
  const configPath = join(work, 'pa11y.json')
  writeFileSync(configPath, JSON.stringify({
    defaults: {
      // axe-core rather than pa11y's default HTML CodeSniffer: it is the engine
      // most Defra developers and auditors already use, so a finding here is
      // one they will recognise rather than one they have to translate.
      runners: ['axe'],
      standard: 'WCAG2AA',
      timeout: 30000,
      chromeLaunchConfig: {
        // Harmless on a laptop, and required wherever this runs in a container.
        args: ['--no-sandbox'],
        ...(browser ? { executablePath: browser } : {})
      }
    },
    urls: paths.map((p) => `${base}${p}`)
  }, null, 2))

  try {
    const result = spawnSync('npx', ['-y', 'pa11y-ci', '--config', configPath, '--json'], {
      encoding: 'utf8',
      // Both captured, never inherited. Inheriting stderr printed npm's
      // deprecation warnings and a raw Node stack trace above our own message,
      // and left result.stderr null — so the one place that explains what went
      // wrong had nothing to explain it with.
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...(browser ? { PUPPETEER_EXECUTABLE_PATH: browser } : {}) }
    })

    const stderr = result.stderr ?? ''
    // The JSON reporter writes the report to stdout, but npx and puppeteer can
    // write to it too, so take the outermost JSON object rather than all of it.
    const start = result.stdout?.indexOf('{') ?? -1
    const end = result.stdout?.lastIndexOf('}') ?? -1
    if (start === -1 || end <= start) {
      return { failed: true, stderr, status: result.status, browser }
    }
    try {
      return { report: JSON.parse(result.stdout.slice(start, end + 1)), browser }
    } catch (error) {
      return { failed: true, stderr: `${error.message}\n${stderr}`, status: result.status, browser }
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * The lines of a failure worth showing someone. npx prints deprecation
 * warnings on stderr whether anything is wrong or not, so the last few lines
 * are usually noise and the useful one is wherever the error starts.
 */
export function explainFailure (stderr = '') {
  const lines = stderr.split('\n').filter((l) => l.trim() && !/^npm (warn|notice)/.test(l))
  const first = lines.findIndex((l) => /^(Error|TypeError|\w*Error):/.test(l.trim()))
  return (first === -1 ? lines.slice(-4) : lines.slice(first, first + 4)).join('\n')
}
