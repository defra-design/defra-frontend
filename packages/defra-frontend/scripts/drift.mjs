import { listComponents, loadFixtures, render, normalise } from '../lib/render.mjs'
import { readFileSync, existsSync } from 'node:fs'

// Runs with cwd = packages/defra-frontend; the registry lives at repo root.
const deviations = existsSync('../../deviations.json')
  ? JSON.parse(readFileSync('../../deviations.json', 'utf8')) : {}

// Markup deviations, checked mechanically below.
const registry = deviations.components ?? {}
// Design deviations (typeface, colour) cannot be caught by comparing markup,
// so they are reported rather than asserted — visible in CI instead of buried.
const design = deviations.design ?? {}

let total = 0, matched = 0
const registered = new Map(), unregistered = [], errors = []

for (const component of listComponents()) {
  for (const fx of loadFixtures(component).fixtures) {
    total++
    try {
      const same = normalise(render(component, fx.options)) === normalise(fx.html)
      if (same) matched++
      else if (registry[component]) {
        registered.set(component, (registered.get(component) || 0) + 1)
      } else {
        unregistered.push(`${component} / ${fx.name}`)
      }
    } catch (e) { errors.push(`${component} / ${fx.name}: ${e.message}`) }
  }
}

console.log(`\ngovuk-frontend drift report`)
console.log('─'.repeat(66))
console.log(`Fixtures checked            ${total}`)
console.log(`Identical to upstream       ${matched}`)
console.log(`Registered deviations       ${[...registered.values()].reduce((a,b)=>a+b,0)}`)
console.log(`UNREGISTERED deviations     ${unregistered.length}`)
console.log(`Render errors               ${errors.length}`)
console.log('─'.repeat(66))

for (const [c, n] of registered) {
  const d = registry[c]
  console.log(`  ${d.id}  ${c}  (${n} fixtures)`)
  console.log(`        ${d.reason}`)
}
for (const u of unregistered.slice(0, 10)) console.log(`  UNREGISTERED  ${u}`)
for (const e of errors.slice(0, 5)) console.log(`  ERROR  ${e}`)

// Not assertable by markup comparison — surfaced so a reviewer sees them.
const designEntries = Object.entries(design)
if (designEntries.length) {
  console.log('\nDesign deviations (declared, not markup-checkable)')
  for (const [name, d] of designEntries) {
    console.log(`  ${d.id}  ${name}`)
    console.log(`        deviates from: ${d.deviatesFrom}`)
    console.log(`        approved by:   ${d.approvedBy}`)
  }
}

const fail = unregistered.length || errors.length
console.log('─'.repeat(66))
console.log(fail ? '\nFAIL — undeclared divergence from GOV.UK Frontend\n'
                 : '\nPASS — all divergence from GOV.UK Frontend is declared\n')
process.exit(fail ? 1 : 0)
