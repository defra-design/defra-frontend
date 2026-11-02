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

// --- report ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log('─'.repeat(66))
if (failed.length) {
  console.log(`\nFAIL — ${failed.length} of ${results.length} behaviours are wrong\n`)
  process.exit(1)
}
console.log(`PASS — ${results.length} behaviours\n`)
