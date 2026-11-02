#!/usr/bin/env node
/**
 * Builds lib/catalogue.json — what the server knows about the design system.
 *
 * Generated, never hand-written, for the same reason the Storybook prop tables
 * are: `macro-options.json` is the only honest source for a macro's parameters,
 * and a hand-kept copy goes stale on the first upstream bump without anything
 * saying so.
 *
 * It is precomputed rather than read at runtime because the server runs inside
 * a designer's prototype, where `packages/defra-frontend` does not exist and
 * `govuk-frontend` resolves somewhere else entirely. `lib/render.mjs` reads its
 * sources with paths relative to its own package, so importing it from the
 * installed server would fail — and fail at the moment a designer first asked
 * a question, which is the worst possible time.
 *
 * `--check` regenerates and diffs instead of writing, so CI fails when the
 * catalogue and the design system have drifted apart. Same shape as the drift
 * check: generated data that can quietly diverge from its source is exactly
 * what this repo already guards against everywhere else.
 *
 * Deliberately NO timestamp in the output. A generated-at field would make
 * every --check report a difference, and a check that always fails gets
 * ignored, which is worse than not having one.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..')
const frontend = join(root, 'packages', 'defra-frontend')
const OUT = join(here, '..', 'lib', 'catalogue.json')

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

// render.mjs configures nunjucks against relative paths when it is imported,
// so the working directory has to be right BEFORE the import, not after.
process.chdir(frontend)
const render = await import(join(frontend, 'lib', 'render.mjs'))

const deviations = read(join(root, 'deviations.json'))
const overridden = Object.keys(deviations.components ?? {})

/**
 * Keep the fields an assistant needs to write a correct macro call and drop
 * the rest. Nesting is preserved: `label.text` and `fieldset.legend.text` are
 * where most of GOV.UK's real parameters live, so flattening would throw away
 * the half that matters.
 */
const params = (opts) => (opts ?? []).map((o) => ({
  name: o.name,
  type: o.type,
  required: Boolean(o.required),
  description: (o.description ?? '').replace(/\s+/g, ' ').trim(),
  ...(o.params ? { params: params(o.params) } : {})
}))

/**
 * One example per component, preferring the fixture named "default". The
 * fixtures are the same ones the drift check renders, so an example here is
 * known to produce the markup this repo ships rather than something invented.
 */
const example = (fixtures) => {
  const list = fixtures?.fixtures ?? []
  const chosen = list.find((f) => f.name === 'default') ?? list[0]
  return chosen ? { name: chosen.name, options: chosen.options } : null
}

const components = []

/**
 * A Defra component is one of three things, and conflating any two of them
 * produces advice that does not work:
 *
 *   configuration  fixtures declare `use` — there is NO defra macro. It is an
 *                  upstream macro in a sanctioned Defra configuration, 100%
 *                  govuk-frontend markup. `header` is this: generic-header
 *                  with a Defra wordmark, which is why CLAUDE.md says not to
 *                  build a Defra header component.
 *   addition       own macro, registered in deviations.additions, no upstream
 *                  equivalent.
 *   override       own macro, registered in deviations.components, replaces an
 *                  upstream component that must not be used.
 *
 * The first was briefly emitted here as an addition, which advertised a
 * `defraHeader` macro that does not exist — an import that fails at render, on
 * the one component that appears on every page.
 */
const defra = render.listDefraComponents().map((dir) => {
  const fixtures = render.loadDefraFixtures(dir)
  return { dir, use: fixtures.use, fixtures }
})

const configures = new Map(defra.filter((d) => d.use).map((d) => [d.use, d.dir]))

for (const name of render.listComponents()) {
  const superseded = overridden.includes(name)
  const configuredBy = configures.get(name)
  components.push({
    name,
    namespace: 'govuk',
    macro: render.macroName(name),
    import: `govuk/components/${name}/macro.njk`,
    status: superseded ? 'superseded' : 'upstream',
    ...(superseded
      ? {
          supersededBy: render.defraMacroName(name),
          why: deviations.components[name]?.reason ?? null
        }
      : {}),
    ...(configuredBy ? { defraConfiguration: configuredBy } : {}),
    params: params(render.loadMacroOptions(name)),
    example: example(render.loadFixtures(name))
  })
}

for (const { dir, use, fixtures } of defra) {
  const addition = deviations.additions?.[dir]
  const override = deviations.components?.[dir]

  if (use) {
    // No defra macro exists. Point at the upstream one, carrying the Defra
    // options as the example so the configuration is what gets copied.
    components.push({
      name: dir,
      namespace: 'defra',
      macro: render.macroName(use),
      import: `govuk/components/${use}/macro.njk`,
      status: 'configuration',
      configures: use,
      why: (fixtures.fixtures?.[0]?.description ?? '').replace(/\s+/g, ' ').trim() || null,
      params: params(render.loadMacroOptions(use)),
      example: example(fixtures)
    })
    continue
  }

  components.push({
    name: dir,
    namespace: 'defra',
    macro: render.defraMacroName(dir),
    import: `defra/components/${dir}/macro.njk`,
    status: override ? 'override' : 'addition',
    ...(override ? { replaces: render.macroName(dir), why: override.reason ?? null } : {}),
    ...(addition
      ? { why: [addition.whyNotUpstream, addition.priorArt && `Follows ${addition.priorArt}.`]
          .filter(Boolean).join(' ') || null }
      : {}),
    params: params(render.loadDefraMacroOptions(dir)),
    example: example(fixtures)
  })
}

components.sort((a, b) =>
  a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name))

const catalogue = {
  govukFrontend: read(join(root, 'node_modules', 'govuk-frontend', 'package.json')).version,
  defraFrontend: read(join(frontend, 'package.json')).version,
  pageTypes: render.listDefraPages(),
  components
}

const next = JSON.stringify(catalogue, null, 2) + '\n'

if (process.argv.includes('--check')) {
  let current = ''
  try { current = readFileSync(OUT, 'utf8') } catch { /* not generated yet */ }
  if (current !== next) {
    console.error(`
catalogue is stale

  lib/catalogue.json does not match the design system it was built from.
  Something changed in src/defra/components, in govuk-frontend, or in
  deviations.json, and the server would answer designers from the old copy.

  Regenerate it:

    npm run catalogue -w defra-mcp
`)
    process.exit(1)
  }
  console.log(`catalogue matches the design system — ${components.length} components`)
  process.exit(0)
}

writeFileSync(OUT, next)
console.log(`catalogue written — ${components.length} components, ${catalogue.pageTypes.length} page types`)
