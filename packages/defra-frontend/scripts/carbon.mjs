import { co2, averageIntensity } from '@tgwf/co2'
import { gzipSync } from 'node:zlib'
import { readFileSync, statSync } from 'node:fs'

// SWDM v4 is the CO2.js default from v0.18. Declared explicitly anyway, because
// the v3->v4 change moved results 40-67% and silent model drift makes every
// historical baseline meaningless.
const emissions = new co2({ model: 'swd', version: 4 })

// GB grid intensity from Ember, shipped with CO2.js.
const gridIntensity = averageIntensity.data.GBR

// Green hosting: Defra runs on Core Delivery Platform (Azure). Not verifiable
// via the Green Web Foundation directory from here, so we assume false.
// Assuming true would flatter every number in this report.
const GREEN_HOST = false

export function estimate (bytes) {
  return emissions.perByteTrace(bytes, GREEN_HOST, {
    gridIntensity: { device: gridIntensity, network: gridIntensity }
  })
}

const gz = (path) => gzipSync(readFileSync(path), { level: 9 }).length

// --- Page-type budgets. These are the actual deliverable. -------------------
// Bytes over the wire, gzipped, first uncached load.
const BUDGETS = {
  'start-page':   { css: 20_000, js: 0,      fonts: 0, html: 8_000 },
  'question-page':{ css: 20_000, js: 5_000,  fonts: 0, html: 10_000 },
  'check-answers':{ css: 20_000, js: 0,      fonts: 0, html: 15_000 }
}

const rows = []
function report (label, parts) {
  const total = Object.values(parts).reduce((a, b) => a + b, 0)
  const t = estimate(total)
  rows.push({ label, ...parts, total, co2: t.co2 })
}

const cssDefra = gz('dist/defra-frontend.min.css')
const cssGovuk = gz('/tmp/baseline.css')
const fontsGovuk = statSync('../../node_modules/govuk-frontend/dist/govuk/assets/fonts/bold-b542beb274-v2.woff2').size +
                   statSync('../../node_modules/govuk-frontend/dist/govuk/assets/fonts/light-94a07e06a1-v2.woff2').size

report('GOV.UK brand mode  (Transport)', { css: cssGovuk, fonts: fontsGovuk, html: 9_000 })
report('Defra brand mode   (system)   ', { css: cssDefra, fonts: 0,          html: 9_000 })

const pad = (s, n) => String(s).padEnd(n)
const num = (n) => n.toLocaleString('en-GB').padStart(9)

console.log('\nFirst uncached load, question page, gzipped')
console.log('─'.repeat(74))
console.log(pad('', 32) + num('css') + num('fonts') + num('total') + '   gCO2e')
console.log('─'.repeat(74))
for (const r of rows) {
  console.log(pad(r.label, 32) + num(r.css) + num(r.fonts) + num(r.total) +
    '   ' + r.co2.toFixed(4))
}
console.log('─'.repeat(74))
const saved = rows[0].total - rows[1].total
const pct = ((rows[0].co2 - rows[1].co2) / rows[0].co2 * 100)
console.log(`Saved: ${saved.toLocaleString('en-GB')} bytes  (${pct.toFixed(1)}% of estimated page emissions)`)

// --- Budget gate -----------------------------------------------------------
const b = BUDGETS['question-page']
const actual = { css: cssDefra, js: 0, fonts: 0, html: 9_000 }
console.log('\nBudget check — question-page (Defra mode)')
console.log('─'.repeat(74))
let fail = false
for (const [k, limit] of Object.entries(b)) {
  const v = actual[k]
  const ok = v <= limit
  if (!ok) fail = true
  console.log(`  ${pad(k, 10)} ${num(v)} / ${num(limit)}   ${ok ? 'PASS' : 'FAIL'}`)
}
console.log('─'.repeat(74))
console.log(fail ? 'BUDGET BREACH — build should fail' : 'Within budget\n')

console.log('Method: SWDM v4 via CO2.js, GB grid intensity, green hosting assumed false.')
console.log('Directional figures for comparing design decisions. Not audited emissions data.\n')
process.exit(fail ? 1 : 0)
