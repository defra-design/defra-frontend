#!/usr/bin/env node
/**
 * What `defra-create-prototype` actually does, asserted.
 *
 * Three bugs reached npm from this package in one day, every one found by
 * someone using it rather than by anything here:
 *
 *   - it told designers to run `npm start`, the command the kit itself warns
 *     against, so changes never appeared
 *   - `--update` would install Defra Frontend and raise govuk-frontend across
 *     three majors in a prototype that had never used either, wrecking
 *     someone's working research prototype from a command named "update"
 *   - `--check` reported a protected prototype as unreachable, which reads as
 *     "yours is down" when it is in fact working
 *
 * The library has `drift`, `carbon` and `boundary`. This package had nothing,
 * and it is the part non-technical designers actually run, where a wrong answer
 * costs them their work rather than a wrong pixel.
 *
 * Deliberately no real prototypes. Every guard here needs only a package.json
 * and an app/views folder, so the fixtures are fabricated and the whole suite
 * runs in seconds — fast enough for every push, where a suite that took three
 * minutes would get moved to a nightly job and then ignored. Creating a real
 * prototype is covered by `instructions --live`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'

const cli = fileURLToPath(new URL('../bin/create.mjs', import.meta.url))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  if (!ok) console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`)
}

/**
 * Asynchronous on purpose. The stub servers below run in this process, and
 * spawnSync blocks the event loop — so a synchronous child could never be
 * answered by a server that is waiting for its turn to accept the connection.
 * That deadlocks, and presents as the check failing rather than as the test
 * harness being wrong.
 */
const run = (args, cwd) => new Promise((resolve) => {
  const child = spawn('node', [cli, ...args], { cwd })
  let out = ''
  child.stdout.on('data', (d) => { out += d })
  child.stderr.on('data', (d) => { out += d })
  child.on('close', (status) => resolve({ out, status }))
})

const tmp = () => mkdtempSync(join(tmpdir(), 'defra-behaviour-'))

/**
 * A file's contents, or '' if it is not there.
 *
 * Defensive on purpose. A plain readFileSync inside an assertion throws when a
 * bug moves or deletes the file it is checking, and an uncaught throw here ends
 * the whole run — so the one assertion that would have named the bug reports
 * nothing, and every block after it is skipped. Found by mutation: making
 * --snapshot move the live pages rather than copy them failed the suite with a
 * stack trace and no failing assertion, which is the least useful way for a
 * test to be right.
 */
const text = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/** A JSON file's contents, or null if it is missing or unreadable. */
const json = (path) => {
  try {
    return JSON.parse(text(path))
  } catch {
    return null
  }
}

/**
 * A prototype, as far as these commands are concerned: a package.json naming
 * govuk-prototype-kit, and some pages. Nothing is installed.
 */
function fixture ({ deps = { 'govuk-prototype-kit': '14.0.2' }, pages = {}, git = false } = {}) {
  const dir = tmp()
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: deps }, null, 2))
  for (const [path, body] of Object.entries(pages)) {
    const full = join(dir, 'app', 'views', path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  mkdirSync(join(dir, 'app', 'views', 'layouts'), { recursive: true })
  writeFileSync(join(dir, 'app', 'views', 'layouts', 'main.html'), '{% block content %}{% endblock %}\n')
  if (git) {
    const q = { cwd: dir, stdio: 'ignore' }
    spawnSync('git', ['init', '-b', 'main'], q)
    spawnSync('git', ['add', '-A'], q)
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'fixture'], q)
  }
  return dir
}

/** A stub server, so the check's own logic is what gets tested. */
function stub (handler) {
  return new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}

console.log('\nbehaviour of defra-create-prototype')
console.log('─'.repeat(66))

// --- update ----------------------------------------------------------------

{
  // The destructive one. A prototype that never used Defra Frontend must be
  // refused, not upgraded across three govuk-frontend majors.
  const dir = fixture({ deps: { 'govuk-prototype-kit': '13.16.2', 'govuk-frontend': '^4.7.0' } })
  const { out, status } = await run(['--update'], dir)
  check('update refuses a prototype that never used Defra Frontend',
    status === 1 && /does not use Defra Frontend/.test(out),
    `exit ${status}`)
  check('and says what it found, so the refusal is checkable',
    /govuk-frontend \^4\.7\.0/.test(out))
  check('and does not touch package.json',
    json(join(dir, 'package.json'))?.dependencies['govuk-frontend'] === '^4.7.0')
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir = fixture({ deps: {} })
  const { out, status } = await run(['--update'], dir)
  check('update refuses a folder that is not a prototype',
    status === 1 && /does not look like a prototype/.test(out), `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

// --- variants --------------------------------------------------------------

{
  const dir = fixture({ pages: { 'start.html': 'x' } })
  const { out, status } = await run(['--variants'], dir)
  check('variants refuses outside version control',
    status === 1 && /not in version control/.test(out), `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir = fixture({ pages: { 'start.html': 'x' }, git: true })
  writeFileSync(join(dir, 'app', 'views', 'uncommitted.html'), 'y')
  const { out, status } = await run(['--variants'], dir)
  check('variants refuses with unsaved changes',
    status === 1 && /not saved to git/.test(out), `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

{
  // Link rewriting is the whole feature. A page moved into current/ must keep
  // to its own version, without breaking assets or the kit's own pages.
  const page = [
    '{% extends "layouts/main.html" %}',
    '<a href="/task-list">next</a>',
    '<form action="/submit"></form>',
    '<img src="/public/x.png">',
    // An asset via href, which is what a stylesheet link looks like. src is
    // never rewritten anyway, so only this one actually tests the skip list.
    '<link rel="stylesheet" href="/public/stylesheets/application.css">',
    '<a href="/manage-prototype">manage</a>',
    '<a href="https://gov.uk">out</a>',
    '<a href="/">home</a>'
  ].join('\n')
  const dir = fixture({ pages: { 'start.html': page }, git: true })
  const { status } = await run(['--variants'], dir)
  const future = text(join(dir, 'app', 'views', 'future', 'start.html'))
  const current = text(join(dir, 'app', 'views', 'current', 'start.html'))

  check('variants splits the pages', status === 0 &&
    existsSync(join(dir, 'app', 'views', 'current', 'start.html')) &&
    existsSync(join(dir, 'app', 'views', 'future', 'start.html')), `exit ${status}`)
  check('internal links are prefixed per version',
    future.includes('href="/future/task-list"') && current.includes('href="/current/task-list"'))
  check('form actions are prefixed too',
    future.includes('action="/future/submit"'))
  check('assets are left alone', future.includes('src="/public/x.png"'))
  check('stylesheets are left alone, which is the href case that matters',
    future.includes('href="/public/stylesheets/application.css"'))
  check('the kit\'s own pages are left alone', future.includes('href="/manage-prototype"'))
  check('external links are left alone', future.includes('href="https://gov.uk"'))
  check('a link to / becomes the version\'s own root', future.includes('href="/future/"'))
  check('extends is not rewritten', future.includes('{% extends "layouts/main.html" %}'))
  check('layouts stay shared, not copied into a version',
    existsSync(join(dir, 'app', 'views', 'layouts', 'main.html')) &&
    !existsSync(join(dir, 'app', 'views', 'future', 'layouts')))
  check('a landing page is written', existsSync(join(dir, 'app', 'views', 'index.html')))

  const again = await run(['--variants'], dir)
  check('variants refuses to run twice',
    again.status === 1 && /already has variants/.test(again.out), `exit ${again.status}`)
  rmSync(dir, { recursive: true, force: true })
}

// --- snapshots -------------------------------------------------------------

{
  const page = [
    '{% extends "layouts/main.html" %}',
    '<a href="/task-list">next</a>',
    '<form action="/submit"></form>',
    '<img src="/public/x.png">',
    '<link rel="stylesheet" href="/public/stylesheets/application.css">',
    '<a href="/manage-prototype">manage</a>',
    '<a href="/">home</a>'
  ].join('\n')
  const dir = fixture({ pages: { 'start.html': page, 'apply/name.html': '<a href="/apply/check">c</a>' } })
  const views = join(dir, 'app', 'views')
  const { status } = await run(['--snapshot', 'Round 1'], dir)
  const frozen = join(views, 'snapshots', 'round-1')

  check('snapshot freezes the pages under a slug of the label',
    status === 0 && existsSync(join(frozen, 'start.html')), `exit ${status}`)
  check('nested pages come with it', existsSync(join(frozen, 'apply', 'name.html')))
  // The whole promise of the feature: it is additive. --variants moves pages;
  // this must not, or a designer loses the thing they were about to iterate.
  check('the live pages are left exactly as they were',
    text(join(views, 'start.html')) === page)

  const start = text(join(frozen, 'start.html'))
  check('links inside stay inside the snapshot',
    start.includes('href="/snapshots/round-1/task-list"'))
  check('form actions too', start.includes('action="/snapshots/round-1/submit"'))
  check('a link to / becomes the snapshot\'s own root',
    start.includes('href="/snapshots/round-1/"'))
  check('assets are left alone, which is the href case that matters',
    start.includes('href="/public/stylesheets/application.css"'))
  check('the kit\'s own pages are left alone', start.includes('href="/manage-prototype"'))
  check('the layout is shared, not frozen', !existsSync(join(frozen, 'layouts')))

  const manifest = () => json(join(dir, 'snapshots.json'))?.snapshots ?? []
  check('a manifest records the label and the date',
    manifest()[0]?.label === 'Round 1' && /^\d{4}-\d{2}-\d{2}$/.test(manifest()[0]?.taken),
    JSON.stringify(manifest()[0]))
  check('and what it was built against', manifest()[0]?.kit === '14.0.2')
  check('and how many pages it holds', manifest()[0]?.pages === 2)
  check('an index page lists them', existsSync(join(views, 'snapshots', 'index.html')))

  // Without excluding the snapshots folder from the copy, each snapshot would
  // contain every earlier one and the folder would roughly double every time.
  const second = await run(['--snapshot', 'Round 2', '--note', 'before the new task list'], dir)
  check('a second snapshot does not copy the first',
    second.status === 0 && !existsSync(join(views, 'snapshots', 'round-2', 'snapshots')),
    `exit ${second.status}`)
  check('both are in the manifest, newest first',
    manifest().length === 2 && manifest()[0].slug === 'round-2')
  check('a note is kept with the snapshot',
    manifest()[0].note === 'before the new task list')

  const again = await run(['--snapshot', 'Round 1'], dir)
  check('the same name twice is refused rather than overwritten',
    again.status === 1 && /already a snapshot/.test(again.out), `exit ${again.status}`)

  rmSync(dir, { recursive: true, force: true })
}

{
  // A prototype that already has pages under app/views/snapshots is not one of
  // ours. Taking the folder over would silently exclude the designer's own
  // pages from every snapshot from then on.
  const dir = fixture({ pages: { 'start.html': 'x', 'snapshots/mine.html': 'y' } })
  const { out, status } = await run(['--snapshot', 'round 1'], dir)
  check('an existing snapshots folder that is not ours is not taken over',
    status === 1 && /was not\nmade by this command/.test(out), `exit ${status}`)
  check('and the designer\'s page is still there',
    existsSync(join(dir, 'app', 'views', 'snapshots', 'mine.html')))
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir = fixture({ deps: {} })
  const { status } = await run(['--snapshot', 'round 1'], dir)
  check('snapshot refuses a folder that is not a prototype', status === 1, `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir = fixture()
  const { out, status } = await run(['--snapshot', 'round 1'], dir)
  check('snapshot refuses a prototype with no pages yet',
    status === 1 && /no pages to snapshot/.test(out), `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir = fixture({ pages: { 'start.html': 'x' } })
  const { status } = await run(['--snapshot', '!!!'], dir)
  check('a label with no letters or numbers in it is refused', status === 1, `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

{
  // Variants and snapshots have to compose: freezing a prototype that has two
  // states must keep both, each still reachable in its own journey.
  const dir = fixture({ pages: { 'start.html': '<a href="/task-list">n</a>' }, git: true })
  await run(['--variants'], dir)
  const { status } = await run(['--snapshot', 'Round 1'], dir)
  const frozen = join(dir, 'app', 'views', 'snapshots', 'round-1')
  check('a snapshot of a variant prototype keeps both states',
    status === 0 && existsSync(join(frozen, 'current', 'start.html')) &&
    existsSync(join(frozen, 'future', 'start.html')), `exit ${status}`)
  check('and their links are nested under the snapshot',
    text(join(frozen, 'current', 'start.html'))
      .includes('href="/snapshots/round-1/current/task-list"'))
  rmSync(dir, { recursive: true, force: true })
}

// --- check -----------------------------------------------------------------

{
  const open = await stub((req, res) => { res.writeHead(200); res.end('<h1>a service</h1>') })
  const { out, status } = await run(['--check', open.url])
  check('check reports an unprotected prototype',
    status === 1 && /NOT PROTECTED/.test(out), `exit ${status}`)
  check('and names NODE_ENV, which is almost always the cause',
    /NODE_ENV/.test(out))
  open.close()
}

{
  const protectedStub = await stub((req, res) => {
    if (req.url.startsWith('/manage-prototype/password')) {
      res.writeHead(200); res.end('password page')
    } else {
      res.writeHead(302, { Location: '/manage-prototype/password?returnURL=%2F' }); res.end()
    }
  })
  const { out, status } = await run(['--check', protectedStub.url])
  check('check reports a protected prototype',
    status === 0 && /PROTECTED/.test(out) && !/NOT PROTECTED/.test(out), `exit ${status}`)
  protectedStub.close()
}

{
  // The bug that nearly shipped. In production mode the kit redirects http to
  // https; following that blindly gave "fetch failed", which reads as "your
  // prototype is down" for a prototype that is protected and working.
  const upgrading = await stub((req, res) => {
    res.writeHead(302, { Location: 'https://127.0.0.1:1/' }); res.end()
  })
  const { out, status } = await run(['--check', upgrading.url])
  check('an unreachable https upgrade is not reported as a dead prototype',
    status === 1 && /redirected to https/.test(out) && !/could not be reached\.\n\nCheck the address/.test(out),
    `exit ${status}`)
  check('and it says to check the https address instead',
    /--check https:/.test(out))
  upgrading.close()
}

{
  const { status } = await run(['--check', 'http://127.0.0.1:1'])
  check('an unreachable prototype exits non-zero', status === 1, `exit ${status}`)
}

{
  const { status } = await run(['--check'])
  check('check with no address exits non-zero', status === 1, `exit ${status}`)
}

// --- dashboard -------------------------------------------------------------

{
  const { buildDashboard } = await import('../bin/dashboard.mjs')
  const scan = tmp()
  const out = tmp()

  const proto = join(scan, 'a-service')
  mkdirSync(join(proto, 'app', 'views', 'current'), { recursive: true })
  mkdirSync(join(proto, 'app', 'views', 'future'), { recursive: true })
  writeFileSync(join(proto, 'package.json'),
    JSON.stringify({ dependencies: { 'govuk-prototype-kit': '14.0.2' } }))
  writeFileSync(join(proto, 'app', 'config.json'),
    JSON.stringify({ serviceName: 'A service', port: 4200 }))

  // Identical but for the prefixes --variants adds. Must read as unchanged:
  // without normalising, every page differs and the column is noise.
  writeFileSync(join(proto, 'app', 'views', 'current', 'same.html'), '<a href="/current/next">x</a>')
  writeFileSync(join(proto, 'app', 'views', 'future', 'same.html'), '<a href="/future/next">x</a>')
  // A real edit.
  writeFileSync(join(proto, 'app', 'views', 'current', 'edited.html'), '<p>before</p>')
  writeFileSync(join(proto, 'app', 'views', 'future', 'edited.html'), '<p>after</p>')
  // Only in one.
  writeFileSync(join(proto, 'app', 'views', 'future', 'new.html'), '<p>new</p>')

  const { found } = buildDashboard(scan, out)
  const states = Object.fromEntries((found[0]?.comparison ?? []).map((c) => [c.page, c.state]))

  check('dashboard finds a prototype', found.length === 1)
  check('it reads the service name', found[0]?.serviceName === 'A service')
  check('it reads the port', found[0]?.port === 4200)
  check('pages differing only by variant prefix read as unchanged',
    states['same.html'] === 'same', JSON.stringify(states))
  check('a real edit reads as a difference', states['edited.html'] === 'differs')
  check('a page in one version only is named as such', states['new.html'] === 'only in future')
  check('the page is written where asked', existsSync(join(out, 'index.html')))

  rmSync(scan, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
}

{
  // The dashboard's reason for reading snapshots: how far the live prototype
  // has moved since one was frozen. A page differing only by the snapshot's
  // link prefix has not moved at all.
  const { buildDashboard } = await import('../bin/dashboard.mjs')
  const scan = tmp()
  const out = tmp()
  const proto = join(scan, 'a-service')
  const views = join(proto, 'app', 'views')
  const frozen = join(views, 'snapshots', 'round-1')
  mkdirSync(frozen, { recursive: true })
  writeFileSync(join(proto, 'package.json'),
    JSON.stringify({ dependencies: { 'govuk-prototype-kit': '14.0.2' } }))
  writeFileSync(join(proto, 'snapshots.json'), JSON.stringify({
    snapshots: [{ label: 'Round 1', slug: 'round-1', taken: '2026-10-01', pages: 2 }]
  }))

  writeFileSync(join(views, 'same.html'), '<a href="/next">x</a>')
  writeFileSync(join(frozen, 'same.html'), '<a href="/snapshots/round-1/next">x</a>')
  writeFileSync(join(views, 'edited.html'), '<p>after</p>')
  writeFileSync(join(frozen, 'edited.html'), '<p>before</p>')

  const { found } = buildDashboard(scan, out)
  const snapshot = found[0]?.snapshots?.[0]

  check('dashboard reads the snapshot manifest', snapshot?.label === 'Round 1')
  check('and counts only the pages that really changed since',
    snapshot?.changed === 1 && snapshot?.pages === 2, JSON.stringify(snapshot))
  check('frozen pages are not counted as pages of the prototype',
    found[0]?.pages.length === 2, JSON.stringify(found[0]?.pages))

  rmSync(scan, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
}

// --- accessibility audit ---------------------------------------------------
// The browser is not tested here — pa11y brings its own Chromium and downloads
// it on first use, which is minutes and hundreds of megabytes, so a suite that
// did that would not run on every push. What is tested is everything around it:
// which pages get audited, which get excluded and why, and how findings are
// grouped. Those are the parts that decide whether the answer is right.

{
  const { pagePaths } = await import('../bin/audit.mjs')
  const dir = fixture({
    pages: {
      'index.html': 'x',
      'start.html': 'x',
      'apply/index.html': 'x',
      'apply/name.njk': 'x',
      'apply/deep/nested.html': 'x',
      'notes.md': 'x',
      'snapshots/round-1/start.html': 'x'
    }
  })
  const paths = pagePaths(join(dir, 'app', 'views'))

  check('audit maps index.html to the route above it', paths.includes('/'))
  check('and apply/index.html to its folder', paths.includes('/apply'))
  check('and a page to its path without the extension', paths.includes('/start'))
  check('njk pages are audited too', paths.includes('/apply/name'))
  check('nested pages are found', paths.includes('/apply/deep/nested'))
  check('non-pages are ignored', !paths.some((p) => p.includes('notes')))
  // Both would be noise rather than findings: the layout is not a page, and a
  // frozen round is a copy nobody is going to change.
  check('the shared layout is not audited', !paths.some((p) => p.includes('layouts')))
  check('frozen snapshots are not audited', !paths.some((p) => p.includes('snapshots')),
    JSON.stringify(paths))
  rmSync(dir, { recursive: true, force: true })
}

{
  // The false pass this exists to prevent. A page that 500s still returns a
  // body — the kit's error page — which audits clean and would be counted as a
  // page with no problems.
  const { reachable } = await import('../bin/audit.mjs')
  const server = await stub((req, res) => {
    if (req.url === '/broken') { res.writeHead(500); res.end('<h1>Error</h1>') } else if (req.url === '/moved') { res.writeHead(302, { Location: '/' }); res.end() } else { res.writeHead(200); res.end('<h1>fine</h1>') }
  })
  const { ok, broken } = await reachable(server.url, ['/', '/broken', '/moved'])

  check('a page that renders is audited', ok.includes('/'))
  check('a page that errors is not audited as though it had rendered',
    !ok.includes('/broken') && broken.some((b) => b.path === '/broken'))
  check('and the status it gave is reported',
    broken.find((b) => b.path === '/broken')?.reason === 'answered 500')
  check('a page that redirects is not audited under its own name',
    !ok.includes('/moved') && broken.some((b) => b.path === '/moved'))
  server.close()
}

{
  const { reachable } = await import('../bin/audit.mjs')
  const { ok, broken } = await reachable('http://127.0.0.1:1', ['/'])
  check('an unreachable page is reported, not silently dropped',
    ok.length === 0 && broken.length === 1)
}

{
  // Grouped by issue, because one bad pattern in a shared include is one thing
  // to change and a page-by-page list hides that entirely.
  const { summarise } = await import('../bin/audit.mjs')
  const issue = (code, selector) => ({
    code,
    type: 'error',
    // axe appends its documentation URL to every message, which is the most
    // useful part of the finding and pushes the line past a terminal's width.
    message: `${code} is wrong (https://dequeuniversity.com/rules/axe/4.13/${code})`,
    selector
  })
  const { issues, errors, warnings } = summarise({
    'http://localhost:4000/a': [issue('label', '#one'), issue('color-contrast', 'p')],
    'http://localhost:4000/b': [issue('label', '#two'),
      { code: 'region', type: 'warning', message: 'region', selector: 'div' }],
    'http://localhost:4000/c': [issue('label', '#three')],
    // pa11y-ci puts a string here when the page could not be loaded at all.
    'http://localhost:4000/d': 'Error: timed out'
  })

  check('findings are counted by severity', errors === 4 && warnings === 1,
    `${errors} errors, ${warnings} warnings`)
  check('the same issue across pages is one finding',
    issues.filter((i) => i.code === 'label').length === 1)
  check('and it names every page it is on',
    issues.find((i) => i.code === 'label')?.pages.join() === '/a,/b,/c')
  check('the most widespread issue comes first', issues[0]?.code === 'label')
  check('errors are listed before warnings',
    issues.findIndex((i) => i.type === 'warning') === issues.length - 1)
  check('examples name the page as well as the element',
    issues[0]?.examples[0]?.path === '/a' && issues[0]?.examples[0]?.selector === '#one')
  check('axe\'s documentation link is pulled out of the message, not left in it',
    issues[0]?.message === 'label is wrong' &&
    issues[0]?.help === 'https://dequeuniversity.com/rules/axe/4.13/label',
    JSON.stringify({ message: issues[0]?.message, help: issues[0]?.help }))
  check('a page pa11y could not load does not break the summary',
    issues.every((i) => !i.pages.includes('/d')))
}

{
  // The report must not read as a pass. It is the thing that gets forwarded,
  // and "0 errors" on its own is the claim this whole feature must not make.
  const { renderReport } = await import('../bin/audit.mjs')
  const html = renderReport({
    name: 'a-service',
    base: 'http://localhost:4000',
    audited: ['/'],
    broken: [{ path: '/check', reason: 'answered 500' }],
    summary: { issues: [], errors: 0, warnings: 0 }
  })
  check('a clean report still says it is not an accessibility test',
    /has not been accessibility tested/.test(html) && /not a score/.test(html))
  check('and pages that were not checked are named in it',
    /\/check/.test(html) && /answered 500/.test(html))
  check('and it is not described as passing', !/\bpass(ed|es)\b/i.test(html.replace(/quoted as a pass/, '')))
  // axe accepts a placeholder as a field's accessible name, so the one mistake
  // a prototype is most likely to contain is the one it cannot report. The
  // report has to say so itself, since nothing in the findings will.
  check('and it names the placeholder-as-label gap, which it cannot detect',
    /placeholder/.test(html) && /&lt;label&gt;/.test(html))
}

{
  // The premise this feature was first built on was wrong: `npx pa11y-ci` does
  // NOT come with a browser. puppeteer's Chromium arrives through a postinstall
  // script and npx does not run it, so pa11y installed cleanly and then failed
  // with "Could not find Chrome (ver. 156.0.8078.47)". Driving the browser
  // already on the machine is both the fix and the better answer — instant
  // rather than a few hundred megabytes through a government proxy.
  const { findBrowser, missingBrowser, explainFailure } = await import('../bin/audit.mjs')
  const found = (env, platform, matches) =>
    findBrowser({ env, platform, exists: (p) => matches.some((m) => p.includes(m)) })

  check('a browser path set by hand wins over anything found',
    findBrowser({ env: { PUPPETEER_EXECUTABLE_PATH: '/set/by/hand' }, platform: 'darwin', exists: () => true }) ===
      '/set/by/hand')
  check('otherwise the installed Chrome is used',
    found({}, 'darwin', ['Google Chrome'])?.includes('Google Chrome'))
  check('Edge counts, being on every Defra Windows laptop',
    found({}, 'win32', ['msedge'])?.includes('msedge'))
  check('an override pointing at nothing is ignored rather than used',
    found({ CHROME_PATH: '/gone' }, 'darwin', ['Google Chrome'])?.includes('Google Chrome'))
  check('no browser at all is reported as none rather than guessed at',
    findBrowser({ env: {}, platform: 'darwin', exists: () => false }) === null)

  check('the missing-browser failure is recognised, since it has a real fix',
    missingBrowser('Error: Could not find Chrome (ver. 156.0.8078.47). This can occur if'))
  check('and an unrelated failure is not mistaken for it',
    !missingBrowser('Error: connect ECONNREFUSED 127.0.0.1:3000'))
  // Inheriting stderr printed npm's warnings and a raw stack trace above our
  // own message, and left nothing for the message itself to say.
  check('npm deprecation noise is not reported as the error',
    explainFailure('npm warn deprecated glob@7\nnpm warn deprecated inflight\nError: the real problem\n  at x') ===
      'Error: the real problem\n  at x')
}

{
  const dir = fixture({ deps: {} })
  const { status } = await run(['--audit'], dir)
  check('audit refuses a folder that is not a prototype', status === 1, `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir = fixture()
  const { out, status } = await run(['--audit'], dir)
  check('audit refuses a prototype with no pages, rather than starting a server',
    status === 1 && /no pages to audit/.test(out), `exit ${status}`)
  rmSync(dir, { recursive: true, force: true })
}

// --- editor wiring ---------------------------------------------------------
// The bootstrap: a designer who could hand-write .vscode/mcp.json would not
// need the server it configures, so the command they already run writes it.
// The risk is the merge. A prototype may already configure other MCP servers,
// and replacing that file to add ours would remove theirs with nothing said.

{
  const { writeEditorConfig } = await import('../bin/wire-editor.mjs')

  {
    const dir = fixture()
    const result = writeEditorConfig(dir)
    const config = json(join(dir, '.vscode', 'mcp.json'))
    check('wiring an unconfigured prototype writes the VS Code workspace format',
      result.written && config?.servers?.defra?.type === 'stdio' &&
      config?.servers?.defra?.command === 'npx' &&
      config?.servers?.defra?.args?.includes('defra-mcp'),
      JSON.stringify(config?.servers?.defra ?? null))
    rmSync(dir, { recursive: true, force: true })
  }

  {
    const dir = fixture()
    mkdirSync(join(dir, '.vscode'), { recursive: true })
    writeFileSync(join(dir, '.vscode', 'mcp.json'), JSON.stringify({
      servers: { somebodyElse: { type: 'stdio', command: 'node', args: ['theirs.mjs'] } }
    }, null, 2))

    writeEditorConfig(dir)
    const config = json(join(dir, '.vscode', 'mcp.json'))

    check('and keeps MCP servers someone else had already configured',
      config?.servers?.somebodyElse?.args?.[0] === 'theirs.mjs',
      JSON.stringify(config?.servers ?? null))
    check('while still adding its own',
      Boolean(config?.servers?.defra))
    rmSync(dir, { recursive: true, force: true })
  }

  {
    const dir = fixture()
    mkdirSync(join(dir, '.vscode'), { recursive: true })
    writeFileSync(join(dir, '.vscode', 'mcp.json'), '{ not json at all')
    const result = writeEditorConfig(dir)
    check('an mcp.json that cannot be parsed is left exactly as it was',
      !result.written && text(join(dir, '.vscode', 'mcp.json')) === '{ not json at all',
      result.reason)
    rmSync(dir, { recursive: true, force: true })
  }

  {
    const dir = fixture()
    mkdirSync(join(dir, '.vscode'), { recursive: true })
    writeFileSync(join(dir, '.vscode', 'mcp.json'), JSON.stringify({
      servers: { defra: { type: 'stdio', command: 'node', args: ['/their/own/build.mjs'] } }
    }))
    writeEditorConfig(dir)
    const config = json(join(dir, '.vscode', 'mcp.json'))
    check('a defra server someone has pointed somewhere else is not overwritten',
      config?.servers?.defra?.args?.[0] === '/their/own/build.mjs',
      JSON.stringify(config?.servers?.defra ?? null))
    rmSync(dir, { recursive: true, force: true })
  }
}

{
  // Asserted against the source because create.mjs cannot be imported — it
  // reads process.argv at module scope and exits in dozens of places. The
  // instructions check reads this same file as text for the same reason.
  //
  // The distinction matters more than it looks: run() exits the process on a
  // non-zero status. Installing the assistant server with it would abandon a
  // half-made prototype whenever the registry is unreachable — behind a
  // government proxy, or simply before the package is published — at the very
  // last step, after the kit and Defra Frontend are already in place.
  const source = text(cli)
  const install = source.split('\n').find((l) => l.includes('DEFRA_MCP_NAME}@latest'))
  check('installing the assistant server cannot abort creating a prototype',
    Boolean(install) && install.includes('tryRun('), (install ?? '(line not found)').trim())
}

// --- report ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log('─'.repeat(66))
if (failed.length) {
  console.log(`\nFAIL — ${failed.length} of ${results.length} behaviours are wrong\n`)
  process.exit(1)
}
console.log(`PASS — ${results.length} behaviours\n`)
