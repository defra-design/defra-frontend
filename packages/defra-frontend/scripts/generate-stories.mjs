import { listComponents, loadFixtures, loadMacroOptions, macroName } from '../lib/render.mjs'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'src/stories/generated'
mkdirSync(OUT, { recursive: true })

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

let componentCount = 0, storyCount = 0
const index = []

for (const component of listComponents()) {
  const { fixtures } = loadFixtures(component)
  const opts = loadMacroOptions(component)
  const visible = fixtures.filter(f => !f.hidden)
  if (!visible.length) continue

  // A Defra template override, if present, is what actually renders.
  const overridden = existsSync(join('src/components', component, 'template.njk'))

  let out = `// GENERATED from govuk-frontend fixtures. Do not edit.
// Source: node_modules/govuk-frontend/dist/govuk/components/${component}/fixtures.json
import { render } from '../../../lib/render.mjs'

export default {
  title: '${overridden ? 'Defra overrides' : 'GOV.UK (Defra themed)'}/${title(component)}',
  parameters: {
    defraOverride: ${overridden},
    macro: '${macroName(component)}',
    docs: { description: { component: ${JSON.stringify(
      overridden
        ? `Defra template override. Deviation must be registered in deviations.md.`
        : `Upstream GOV.UK Frontend component, restyled by Defra tokens only. No markup changes.`
    )} } }
  },
  argTypes: ${JSON.stringify(argTypes(opts), null, 2).replace(/\n/g, '\n  ')},
  render: (args) => render('${component}', args)
}
`

  for (const fx of visible) {
    storyCount++
    out += `
export const ${exportName(fx.name)} = {
  name: ${JSON.stringify(fx.name)},${fx.description ? `
  parameters: { docs: { description: { story: ${JSON.stringify(fx.description)} } } },` : ''}
  args: ${JSON.stringify(fx.options, null, 2).replace(/\n/g, '\n  ')}
}
`
  }

  writeFileSync(join(OUT, `${component}.stories.js`), out)
  componentCount++
  index.push({ component, stories: visible.length, overridden })
}

console.log(`\nGenerated ${storyCount} stories across ${componentCount} components -> ${OUT}\n`)
console.log('Component'.padEnd(22) + 'Stories'.padStart(8) + '   Source')
console.log('─'.repeat(56))
for (const i of index) {
  console.log(i.component.padEnd(22) + String(i.stories).padStart(8) +
    '   ' + (i.overridden ? 'Defra override' : 'upstream'))
}
console.log('─'.repeat(56))
console.log(`${index.filter(i => i.overridden).length} Defra overrides, ${index.filter(i => !i.overridden).length} upstream unmodified\n`)
