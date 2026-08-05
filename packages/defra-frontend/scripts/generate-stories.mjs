import {
  listComponents, loadFixtures, loadMacroOptions, macroName,
  listDefraComponents, loadDefraFixtures, loadDefraMacroOptions, defraMacroName,
  listDefraPages
} from '../lib/render.mjs'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'src/stories/generated'
mkdirSync(OUT, { recursive: true })

const deviations = existsSync('../../deviations.json')
  ? JSON.parse(readFileSync('../../deviations.json', 'utf8')) : {}

// An override diverges from an upstream component; an addition has no upstream
// equivalent. Different governance, so different labelling — collapsing them
// would hide which components carry an upstream-bump review burden.
const registry = deviations.components ?? {}
const additions = deviations.additions ?? {}

const title = (s) => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
const exportName = (s) => {
  const n = s.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
             .replace(/[^a-zA-Z0-9]/g, '')
  const c = n[0].toUpperCase() + n.slice(1)
  return /^[0-9]/.test(c) ? 'Fx' + c : c
}

// argTypes come straight from macro-options.json, so prop tables are never
// hand-written and never go stale on an upstream bump.
function argTypes (opts) {
  const map = {}
  for (const o of opts) {
    map[o.name] = {
      description: (o.description || '').replace(/\n/g, ' '),
      table: { type: { summary: o.type }, category: o.required ? 'Required' : 'Optional' }
    }
  }
  return map
}

function storiesFile ({ renderArg, storyTitle, macro, importPath, renderFn, description, fixtures, opts }) {
  let out = `// GENERATED — do not edit.
import { ${renderFn} } from '../../../lib/render.mjs'

export default {
  title: '${storyTitle}',
  parameters: {
    macro: '${macro}',
    // Where a service would import this from — the code panel reconstructs the
    // Nunjucks call from these two, so it can never drift from the real name.
    importPath: '${importPath}',
    docs: { description: { component: ${JSON.stringify(description)} } }
  },
  argTypes: ${JSON.stringify(argTypes(opts), null, 2).replace(/\n/g, '\n  ')},
  render: (args) => ${renderFn}('${renderArg}', args)
}
`
  for (const fx of fixtures) {
    out += `
export const ${exportName(fx.name)} = {
  name: ${JSON.stringify(fx.name)},${fx.description ? `
  parameters: { docs: { description: { story: ${JSON.stringify(fx.description)} } } },` : ''}
  args: ${JSON.stringify(fx.options, null, 2).replace(/\n/g, '\n  ')}
}
`
  }
  return out
}

let storyCount = 0
const index = []

// A Defra component either forks (macro.njk + own template, a registered
// deviation) or declares `use` in its fixtures — a sanctioned configuration
// of an upstream macro, rendered through the ordinary govuk render path.
const defra = listDefraComponents().map((dir) => {
  const fx = loadDefraFixtures(dir)
  return { dir, use: fx.use, fixtures: fx.fixtures }
})
const overriddenUpstream = new Set(defra.filter(d => !d.use).map(d => d.dir))
const usedUpstream = new Map(defra.filter(d => d.use).map(d => [d.use, d.dir]))

// --- Upstream components, restyled by tokens only --------------------------
for (const component of listComponents()) {
  const visible = loadFixtures(component).fixtures.filter(f => !f.hidden)
  if (!visible.length) continue

  let note = ''
  if (overriddenUpstream.has(component)) {
    note = ` A registered Defra deviation exists — see “Defra / ${title(component)}”. This govuk version is for \`*.service.gov.uk\` services only.`
  } else if (usedUpstream.has(component)) {
    note = ` Defra services configure this component directly — see “Defra / ${title(usedUpstream.get(component))}”.`
  }

  writeFileSync(join(OUT, `${component}.stories.js`), storiesFile({
    renderArg: component,
    storyTitle: `GOV.UK (Defra themed)/${title(component)}`,
    macro: macroName(component),
    importPath: `govuk/components/${component}/macro.njk`,
    renderFn: 'render',
    description: 'Upstream GOV.UK Frontend component, restyled by Defra tokens only. No markup changes.' + note,
    fixtures: visible,
    opts: loadMacroOptions(component)
  }))
  storyCount += visible.length
  index.push({ component, stories: visible.length, source: 'upstream' })
}

// --- Defra components: forks from their own fixtures, usages from upstream --
for (const { dir, use, fixtures } of defra) {
  const visible = fixtures.filter(f => !f.hidden)
  if (!visible.length) continue

  const dev = registry[dir]
  const add = additions[dir]

  let description, source, section
  if (use) {
    description = `Not a fork — upstream \`${macroName(use)}\` in its sanctioned Defra configuration. Markup is 100% govuk-frontend.`
    source = `Defra usage of ${use}`
    section = 'Defra'
  } else if (add) {
    description = `${add.id} — no GOV.UK Frontend equivalent. ${add.whyNotUpstream} Follows ${add.priorArt}. JavaScript: ${add.javascript}.`
    source = 'addition'
    section = 'Defra additions'
  } else if (dev) {
    description = `${dev.id} — ${dev.reason}. Registered in deviations.json; review ${dev.review}.`
    source = 'Defra override'
    section = 'Defra'
  } else {
    description = `UNREGISTERED — add ${dir} to deviations.json under \`components\` (if it overrides an upstream component) or \`additions\` (if it has no upstream equivalent) before shipping.`
    source = 'UNREGISTERED'
    section = 'Defra'
  }

  writeFileSync(join(OUT, `defra-${dir}.stories.js`), storiesFile({
    renderArg: use ?? dir,
    storyTitle: `${section}/${title(dir)}`,
    macro: use ? macroName(use) : defraMacroName(dir),
    importPath: use
      ? `govuk/components/${use}/macro.njk`
      : `defra/components/${dir}/macro.njk`,
    renderFn: use ? 'render' : 'renderDefra',
    description,
    fixtures: visible,
    opts: use ? loadMacroOptions(use) : loadDefraMacroOptions(dir)
  }))
  storyCount += visible.length
  index.push({ component: dir, stories: visible.length, source })
}

// --- Page types -------------------------------------------------------------
// One story per page type, matching the carbon budget names exactly. The error
// variant is a second story rather than a control so the two states can be
// compared side by side in the sidebar.
for (const page of listDefraPages()) {
  const stories = [{ export: 'Default', name: title(page), args: {} }]
  if (page === 'question-page') {
    stories.push({ export: 'WithError', name: 'with error', args: { showError: true } })
  }

  let out = `// GENERATED — do not edit. Page composition lives in
// src/defra/pages/${page}/template.njk
import { renderPage } from '../../../lib/render.mjs'

export default {
  title: 'Pages/${title(page)}',
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: ${JSON.stringify(
      `Whole-page composition, matching the \`${page}\` carbon budget. Composition only — every element is an upstream GOV.UK macro or a registered Defra deviation. This is what the byte budget in \`npm run carbon\` measures.`
    )} } }
  },
  render: (args) => renderPage('${page}', args)
}
`
  for (const s of stories) {
    out += `
export const ${s.export} = {
  name: ${JSON.stringify(s.name)},
  args: ${JSON.stringify(s.args)}
}
`
  }
  writeFileSync(join(OUT, `page-${page}.stories.js`), out)
  storyCount += stories.length
  index.push({ component: page, stories: stories.length, source: 'page type' })
}

console.log(`\nGenerated ${storyCount} stories across ${index.length} entries -> ${OUT}\n`)
console.log('Component'.padEnd(22) + 'Stories'.padStart(8) + '   Source')
console.log('─'.repeat(56))
for (const i of index) {
  console.log(i.component.padEnd(22) + String(i.stories).padStart(8) + '   ' + i.source)
}
console.log('─'.repeat(56))

const count = (s) => index.filter(i => i.source === s).length
const unregistered = count('UNREGISTERED')
console.log(
  `${count('page type')} page types, ${count('addition')} additions, ` +
  `${count('Defra override')} overrides, ` +
  `${index.filter(i => i.source.startsWith('Defra usage')).length} usages, ` +
  `${count('upstream')} upstream unmodified\n`
)
if (unregistered) {
  console.log(`${unregistered} UNREGISTERED component(s) — declare them in deviations.json\n`)
  process.exitCode = 1
}
