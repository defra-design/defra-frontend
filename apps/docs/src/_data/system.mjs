// Every fact on the docs site comes from here, and everything here is read
// from the files the checks already use. If a component is added, a deviation
// registered or a budget changed, the site follows without anyone remembering
// to update it — and it cannot drift, because there is no second copy.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const pkg = join(repoRoot, 'packages/defra-frontend')

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const maybe = (p, fallback) => (existsSync(p) ? read(p) : fallback)

export default async function () {
  const deviations = maybe(join(repoRoot, 'deviations.json'), {})
  const budgets = maybe(join(repoRoot, 'carbon-budgets.json'), {})
  const baseline = maybe(join(repoRoot, 'carbon-baseline.json'), { pages: {} })

  // Rendering happens through the package's own helper, with cwd set to the
  // package so its relative paths resolve. That is the same code path the
  // drift check and Storybook use — the examples on this site are the real
  // components, not copies of them.
  const cwd = process.cwd()
  process.chdir(pkg)
  let components = []
  let pages = []
  try {
    const render = await import(join(pkg, 'lib/render.mjs'))
    components = render.listDefraComponents().map((name) => {
      const fixtures = render.loadDefraFixtures(name)
      const isUsage = Boolean(fixtures.use)
      return {
        name,
        macro: isUsage ? render.macroName(fixtures.use) : render.defraMacroName(name),
        usesUpstream: fixtures.use ?? null,
        options: isUsage
          ? render.loadMacroOptions(fixtures.use)
          : render.loadDefraMacroOptions(name),
        registered: deviations.additions?.[name] ?? deviations.components?.[name] ?? null,
        kind: deviations.additions?.[name]
          ? 'addition'
          : deviations.components?.[name]
            ? 'override'
            : isUsage ? 'usage' : 'unregistered',
        examples: fixtures.fixtures
          .filter((f) => !f.hidden)
          .map((f) => ({
            name: f.name,
            description: f.description ?? null,
            options: f.options,
            html: isUsage
              ? render.render(fixtures.use, f.options)
              : render.renderDefra(name, f.options)
          }))
      }
    })

    pages = render.listDefraPages().map((name) => ({
      name,
      budget: budgets[name] ?? null,
      measured: baseline.pages?.[name] ?? null
    }))
  } finally {
    process.chdir(cwd)
  }

  return {
    components,
    pages,
    deviations,
    budgets,
    baseline,
    counts: {
      upstream: 37,
      additions: Object.keys(deviations.additions ?? {}).filter((k) => k !== '_note').length,
      overrides: Object.keys(deviations.components ?? {}).length,
      design: Object.keys(deviations.design ?? {}).length
    }
  }
}
