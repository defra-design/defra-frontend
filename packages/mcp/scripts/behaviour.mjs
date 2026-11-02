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

// --- report ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log('─'.repeat(66))
if (failed.length) {
  console.log(`\nFAIL — ${failed.length} of ${results.length} behaviours are wrong\n`)
  process.exit(1)
}
console.log(`PASS — ${results.length} behaviours\n`)
