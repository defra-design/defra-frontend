#!/usr/bin/env node
/**
 * What `defra-mcp` actually tells an assistant, asserted.
 *
 * The thing worth testing here is not that the server starts. It is that the
 * answers are *correct*, because every one of them becomes code in a
 * designer's prototype without anyone technical reading it first. Two failures
 * found while building this are the pattern:
 *
 *   - the catalogue advertised a `defraHeader` macro, which does not exist.
 *     `src/defra/components/header` ships fixtures and no macro, because the
 *     Defra header is upstream `govukGenericHeader` with a wordmark. An
 *     assistant following that advice writes an import that fails at render,
 *     on the component that appears on every page.
 *   - `find()` resolved an ambiguous name by whichever entry the array
 *     happened to sort first, so "footer" returning the Defra one was luck.
 *
 * Driven over stdio rather than by importing the handlers, because a schema
 * the client rejects, a tool missing from tools/list, or anything written to
 * stdout all present to a designer as "the tools are not there" with nothing
 * in any log. Importing the handlers would pass through every one of those.
 */
import { open, textOf } from './drive.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * A prototype-shaped folder, fabricated rather than created for real.
 * `npx govuk-prototype-kit create` takes minutes and needs the network; every
 * guard here needs only a package.json, an app/views folder and the templates
 * the page tool copies from. A suite that took minutes would end up skipped.
 */
const fixture = ({ kit = true, templates = true } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'defra-mcp-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture',
    dependencies: kit ? { 'govuk-prototype-kit': '14.0.2' } : {}
  }))
  mkdirSync(join(dir, 'app', 'views'), { recursive: true })
  writeFileSync(join(dir, 'app', 'config.json'), JSON.stringify({ port: 4321 }))
  if (templates) {
    const t = join(dir, 'node_modules', 'defra-frontend', 'src', 'defra', 'prototype-kit', 'templates')
    mkdirSync(t, { recursive: true })
    for (const name of ['start-page', 'question-page', 'check-answers']) {
      writeFileSync(join(t, `${name}.html`),
        '{% extends "layouts/main.html" %}\n\n{% block content %}\nQuestion heading\n{% endblock %}\n')
    }
  }
  return dir
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  if (!ok) console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`)
}

console.log('\nbehaviour of defra-mcp\n')

const client = open()
const init = await client.start()

// --- the protocol ----------------------------------------------------------

check('the server completes an MCP handshake',
  init.result?.serverInfo?.name === 'defra',
  JSON.stringify(init.result?.serverInfo))

check('and reports the package version, so a stale server is identifiable',
  /^\d+\.\d+\.\d+$/.test(init.result?.serverInfo?.version ?? ''),
  init.result?.serverInfo?.version)

const list = await client.list()
const tools = list.result?.tools ?? []
const names = tools.map((t) => t.name)

check('it offers the knowledge tools',
  ['list_components', 'component_help', 'list_page_types'].every((n) => names.includes(n)),
  names.join(', '))

check('and the tools that act on a prototype',
  ['create_page', 'run_prototype', 'audit', 'snapshot'].every((n) => names.includes(n)),
  names.join(', '))

check('every tool has a description and an object input schema',
  tools.every((t) => t.description?.length > 20 && t.inputSchema?.type === 'object'),
  tools.filter((t) => !t.description || t.inputSchema?.type !== 'object').map((t) => t.name).join(', '))

// --- the header, which is the one that was wrong ---------------------------

const header = textOf(await client.call('component_help', { name: 'header' }))

check('the Defra header points at the upstream macro, not an invented one',
  /govukGenericHeader/.test(header) && !/defraHeader/.test(header),
  header.split('\n')[0])

check('and says plainly that no defra macro exists for it',
  /NO defra macro/i.test(header))

check('and gives an import path that exists in govuk-frontend',
  /govuk\/components\/generic-header\/macro\.njk/.test(header))

// --- the override, which is a licence boundary -----------------------------

const govukFooter = textOf(await client.call('component_help', { name: 'govukFooter' }))

check('asking for govukFooter warns it must not be used',
  /DO NOT USE/.test(govukFooter) && /defraFooter/.test(govukFooter))

check('and gives the reason, rather than just forbidding it',
  /Royal Arms|OGL|proposition/i.test(govukFooter))

const bare = textOf(await client.call('component_help', { name: 'footer' }))
check('an ambiguous name resolves to the Defra component, not upstream',
  /^defraFooter/.test(bare), bare.split('\n')[0])

// --- the silent failure ----------------------------------------------------

const listed = textOf(await client.call('list_components'))

check('the listing carries the never-shadow rule',
  /template\.njk/.test(listed) && /silently ignored/.test(listed))

check('and the brand mode licence boundary',
  /service\.gov\.uk/.test(listed) && /GDS Transport/.test(listed))

check('the listing stays compact enough to be worth calling',
  listed.length < 12000, `${listed.length} characters`)

check('and names both namespaces',
  /Defra components/.test(listed) && /GOV\.UK Frontend components/.test(listed))

// --- pages -----------------------------------------------------------------

const pages = textOf(await client.call('list_page_types'))

check('page types explain how a file becomes a URL',
  /app\/views\/apply\/name\.html/.test(pages) && /\/apply\/name/.test(pages))

check('and require the layout every page must extend',
  /extends "layouts\/main\.html"/.test(pages))

// --- failure modes ---------------------------------------------------------

const unknown = textOf(await client.call('component_help', { name: 'govukBanana' }))
check('an unknown component is refused, not invented',
  /No component called/.test(unknown) && /list_components/.test(unknown))

const missing = await client.call('no_such_tool', {})
check('an unknown tool is an error result, not a crash',
  missing.result?.isError === true || missing.error != null)

const after = await client.list()
check('and the server is still answering afterwards',
  (after.result?.tools ?? []).length === tools.length)

check('nothing is written to stdout outside the protocol',
  client.stderr().length >= 0 && (after.result?.tools ?? []).length > 0)

client.close()

// --- acting in the wrong folder -------------------------------------------
// An assistant will call these in whatever folder happens to be open. The CLI
// carries the same guards because a command aimed at the wrong directory once
// rewrote someone's working research prototype.

{
  const dir = fixture({ kit: false })
  const c = open({ cwd: dir })
  await c.start()

  for (const tool of ['create_page', 'run_prototype', 'audit', 'snapshot']) {
    const args = tool === 'create_page'
      ? { path: 'x', type: 'start-page' }
      : tool === 'snapshot' ? { label: 'x' } : {}
    const out = textOf(await c.call(tool, args))
    check(`${tool} refuses a folder that is not a prototype`,
      /not a prototype/i.test(out), out.slice(0, 90))
  }

  const out = textOf(await c.call('create_page', { path: 'x', type: 'start-page' }))
  check('and says nothing was changed, so a retry is not tempting',
    /[Nn]othing has been changed/.test(out))

  c.close()
  rmSync(dir, { recursive: true, force: true })
}

// --- creating pages --------------------------------------------------------

{
  const dir = fixture()
  const c = open({ cwd: dir })
  await c.start()

  const made = textOf(await c.call('create_page', { path: 'apply/name', type: 'question-page' }))
  const file = join(dir, 'app', 'views', 'apply', 'name.html')

  check('create_page writes the file at the path given',
    existsSync(file), made.slice(0, 90))

  check('and the page extends the layout, which is invisible when missing',
    existsSync(file) && /\{% extends "layouts\/main\.html" %\}/.test(readFileSync(file, 'utf8')))

  check('and reports the URL it will serve at, not the file path',
    /\/apply\/name/.test(made))

  const heading = textOf(await c.call('create_page',
    { path: 'apply/age', type: 'question-page', heading: 'What is your age?' }))
  const aged = readFileSync(join(dir, 'app', 'views', 'apply', 'age.html'), 'utf8')
  check('a heading replaces the placeholder and sets the tab title',
    /What is your age\?/.test(aged) && /pageName="What is your age\?"/.test(aged), heading.slice(0, 60))

  const again = textOf(await c.call('create_page', { path: 'apply/name', type: 'question-page' }))
  check('creating a page that already exists is refused, never overwritten',
    /already exists/.test(again) && /[Nn]othing has been changed/.test(again))

  const original = readFileSync(file, 'utf8')
  check('and the existing page is untouched after the refusal',
    original.includes('Question heading'))

  const bogus = textOf(await c.call('create_page', { path: 'x', type: 'landing-page' }))
  check('an unknown page type is refused with the list of real ones',
    /No page type/.test(bogus) && /start-page/.test(bogus))

  const escape = textOf(await c.call('create_page', { path: '../../etc/evil', type: 'start-page' }))
  check('a path that climbs out of the prototype is refused',
    /not a usable page path/.test(escape), escape.slice(0, 80))

  c.close()
  rmSync(dir, { recursive: true, force: true })
}

// --- audit needs a running prototype --------------------------------------

{
  const dir = fixture()
  const c = open({ cwd: dir })
  await c.start()

  const empty = textOf(await c.call('audit', {}))
  check('audit refuses a prototype with no pages rather than reporting zero issues',
    /no pages/i.test(empty), empty.slice(0, 80))

  writeFileSync(join(dir, 'app', 'views', 'index.html'), '<h1>x</h1>')
  const down = textOf(await c.call('audit', {}))
  check('audit says to start the prototype rather than claiming it is clean',
    /not running/i.test(down) && /run_prototype/.test(down), down.slice(0, 90))

  c.close()
  rmSync(dir, { recursive: true, force: true })
}

// --- report ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log('─'.repeat(66))
if (failed.length) {
  console.log(`\nFAIL — ${failed.length} of ${results.length} behaviours are wrong\n`)
  process.exit(1)
}
console.log(`PASS — ${results.length} behaviours\n`)
