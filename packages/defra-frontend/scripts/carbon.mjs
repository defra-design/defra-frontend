import { co2, averageIntensity } from '@tgwf/co2'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { listDefraPages, renderPage, renderDocument, needsJavaScript } from '../lib/render.mjs'

// This script deliberately does NOT grade a page. There is no A-F rating, no
// "good/bad" verdict on a gCO2e figure, and there never should be — see the
// carbon section of CONTRIBUTING.md. The model carries far too much uncertainty to
// support a grade: SWDM v4 moved results 40-67% against v3, grid intensity is
// a national average, and green hosting is assumed rather than verified. A
// grade would imply precision the method does not have, and it travels well
// out of context in a way a raw number does not.
//
// What it does instead is give the two comparisons that ARE defensible:
//   - against a committed baseline, so a regression is visible
//   - against the alternative design decision (GOV.UK vs Defra brand mode)
// Both are relative. Neither claims the absolute number means anything on its
// own, which is exactly the claim that would be false.

// SWDM v4 is the CO2.js default from v0.18. Declared explicitly anyway, because
// the v3->v4 change moved results 40-67% and silent model drift makes every
// historical baseline meaningless.
const emissions = new co2({ model: 'swd', version: 4 })

// GB grid intensity from Ember, shipped with CO2.js.
const gridIntensity = averageIntensity.data.GBR

// Green hosting: Defra services run on Core Delivery Platform. CDP's own
// components point at AWS in eu-west-2 — S3, ElastiCache, ECS-shaped logs —
// rather than the Azure this comment used to assert, which was never checked.
// Treat even that as indicative: it is read off CDP's public repositories, not
// confirmed by anyone who runs the platform.
//
// Either way the figure below does not change. Verification would have to come
// from the Green Web Foundation directory for the actual region and provider,
// and until someone does that, false is the honest assumption — assuming true
// would flatter every number in this report.
const GREEN_HOST = false

export function estimate (bytes) {
  return emissions.perByteTrace(bytes, GREEN_HOST, {
    gridIntensity: { device: gridIntensity, network: gridIntensity }
  })
}

const gz = (path) => gzipSync(readFileSync(path), { level: 9 }).length
const gzText = (text) => gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).length

// Everything below is measured. Nothing about a page's weight is assumed.
//
// HTML is the full rendered document, shell included, not the body plus a
// guessed constant. JS is the real govuk-frontend bundle, charged to a page
// only when its markup actually initialises a component (any `data-module`) —
// detected from the rendered output rather than declared by hand, so it stays
// correct as pages change.
const jsBundle = gz('../../node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.js')

// Defra's own JavaScript, charged only to pages that use a defra component.
// Measured from unminified source, so it OVERSTATES what a service would ship
// after bundling. Deliberately the safe direction: a budget should never be
// met by an optimistic measurement.
const defraJs = readdirSync('src/defra/components', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join('src/defra/components', d.name, `${d.name}.mjs`))
  .filter((p) => existsSync(p))
const defraJsBytes = defraJs.length
  ? gzText(defraJs.map((p) => readFileSync(p, 'utf8')).join('\n'))
  : 0

const usesDefraComponent = (html) => /\sdata-module="defra-/.test(html)

const pages = Object.fromEntries(
  listDefraPages().map((page) => {
    const body = renderPage(page)
    return [page, {
      html: gzText(renderDocument(page)),
      js: (needsJavaScript(body) ? jsBundle : 0) +
          (usesDefraComponent(body) ? defraJsBytes : 0)
    }]
  })
)

// --- Page-type budgets. These are the actual deliverable. -------------------
// Bytes over the wire, gzipped, first uncached load.
// Set against measured pages, not guesses. The previous numbers assumed ~9,000
// bytes of HTML (real: ~1,200) and 0-5,000 of JS (real: 11,152, because every
// page initialises at least one component), so the HTML limits constrained
// nothing and the JS limits had never been tested against a real page at all.
//
// Headroom is deliberate but modest — enough for a page to grow, tight enough
// that a regression is a build failure rather than a shrug. Retune from the
// reported figures when a page type legitimately grows; do not raise a limit
// to make a breach go away.
//
// js is the whole govuk-frontend bundle. Getting a page to 0 means shipping no
// bundle at all, which is a service-level decision (no component may declare
// data-module), not something this repo can assert.
// Lives in carbon-budgets.json at the repo root so Storybook can show a story
// its own budget without duplicating the numbers. One source, two readers.
const BUDGETS = JSON.parse(readFileSync('../../carbon-budgets.json', 'utf8'))

const rows = []
function report (label, parts) {
  const total = Object.values(parts).reduce((a, b) => a + b, 0)
  const t = estimate(total)
  rows.push({ label, ...parts, total, co2: t.co2 })
}

const cssDefra = gz('dist/defra-frontend.min.css')
const cssGovuk = gz('../../node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.css')
const fontsGovuk = statSync('../../node_modules/govuk-frontend/dist/govuk/assets/fonts/bold-b542beb274-v2.woff2').size +
                   statSync('../../node_modules/govuk-frontend/dist/govuk/assets/fonts/light-94a07e06a1-v2.woff2').size

// The brand-mode comparison uses the question page, the most common page type
// in a transactional service. JS is counted on both sides: it is identical in
// either brand mode, and leaving it out of the denominator would inflate the
// headline saving. Fonts are the only thing that actually differs.
const q = pages['question-page']

report('GOV.UK brand mode  (Transport)', { css: cssGovuk, fonts: fontsGovuk, js: q.js, html: q.html })
report('Defra brand mode   (system)   ', { css: cssDefra, fonts: 0,          js: q.js, html: q.html })

const pad = (s, n) => String(s).padEnd(n)
const num = (n) => n.toLocaleString('en-GB').padStart(9)

console.log('\nFirst uncached load, question page, gzipped')
console.log('─'.repeat(74))
console.log(pad('', 32) + num('css') + num('fonts') + num('js') + num('total') + '   gCO2e')
console.log('─'.repeat(74))
for (const r of rows) {
  console.log(pad(r.label, 32) + num(r.css) + num(r.fonts) + num(r.js) + num(r.total) +
    '   ' + r.co2.toFixed(4))
}
console.log('─'.repeat(74))
const saved = rows[0].total - rows[1].total
const pct = ((rows[0].co2 - rows[1].co2) / rows[0].co2 * 100)
console.log(`Saved: ${saved.toLocaleString('en-GB')} bytes  (${pct.toFixed(1)}% of estimated page emissions)`)

// --- Change since baseline --------------------------------------------------
// The budget is a ceiling; it says nothing until you hit it. A page can double
// in weight and still pass. This answers the question a reviewer actually has:
// did this change make it worse?
//
// The baseline is committed and refreshed deliberately (`npm run carbon --
// --update-baseline`), never automatically. An auto-updating baseline always
// reports zero drift and is worth nothing. Because it is a tracked file, a
// weight increase shows up as a reviewable diff in the PR that causes it.
//
// This reports; it does not fail. Budgets are the gate. A deliberate increase
// should be explainable, not blocked.
const BASELINE = '../../carbon-baseline.json'
const current = {
  css: cssDefra,
  pages: Object.fromEntries(listDefraPages().map((p) => [p, pages[p]]))
}

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
  console.log(`\nBaseline updated — commit ${BASELINE.replace('../../', '')} with the change that caused it.\n`)
} else if (!existsSync(BASELINE)) {
  console.log('\nNo baseline recorded. Create one with: npm run carbon -- --update-baseline\n')
} else {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const deltas = []
  const diff = (label, now, before) => {
    if (before === undefined) return deltas.push([label, now, null])
    if (now !== before) deltas.push([label, now, now - before])
  }
  diff('css (all pages)', current.css, base.css)
  for (const [page, v] of Object.entries(current.pages)) {
    for (const k of ['html', 'js']) diff(`${page} ${k}`, v[k], base.pages?.[page]?.[k])
  }

  console.log('\nChange since baseline')
  console.log('─'.repeat(74))
  if (!deltas.length) {
    console.log('  No change.')
  } else {
    for (const [label, now, d] of deltas) {
      if (d === null) {
        console.log(`  ${pad(label, 26)} ${num(now)}   new — not in baseline`)
      } else {
        const g = estimate(Math.abs(d)).co2 * 1000
        console.log(`  ${pad(label, 26)} ${num(now)}   ${d > 0 ? '+' : ''}${d.toLocaleString('en-GB')} bytes` +
                    `  (${d > 0 ? '+' : '-'}${g.toFixed(3)} mg CO2e per uncached load)`)
      }
    }
    console.log('\n  Deliberate? Refresh with: npm run carbon -- --update-baseline')
  }
  console.log('─'.repeat(74))
}

// --- Budget gate -----------------------------------------------------------
// Every declared budget is checked, and every page type must have a budget.
// A page type with no budget is a silent gap, so it fails rather than passes.
let fail = false

console.log('\nBudget check — Defra mode, gzipped')
console.log('─'.repeat(74))

for (const page of listDefraPages()) {
  const budget = BUDGETS[page]
  if (!budget) {
    fail = true
    console.log(`\n  ${page}\n    NO BUDGET DECLARED — add one to BUDGETS before shipping this page type`)
    continue
  }
  const actual = { css: cssDefra, fonts: 0, ...pages[page] }
  console.log(`\n  ${page}`)
  for (const [k, limit] of Object.entries(budget)) {
    const v = actual[k]
    const ok = v <= limit
    if (!ok) fail = true
    const headroom = limit ? ` (${Math.round((1 - v / limit) * 100)}% headroom)` : ''
    console.log(`    ${pad(k, 8)} ${num(v)} / ${num(limit)}   ${ok ? 'PASS' : 'FAIL'}${ok ? headroom : ''}`)
  }
}

const orphaned = Object.keys(BUDGETS).filter((p) => !(p in pages))
if (orphaned.length) {
  console.log(`\n  Budgets with no page to measure: ${orphaned.join(', ')}`)
}

console.log('\n' + '─'.repeat(74))
console.log(fail ? 'BUDGET BREACH — build should fail\n' : 'Within budget\n')

console.log('Method: SWDM v4 via CO2.js, GB grid intensity, green hosting assumed false.')
console.log('Directional figures for comparing design decisions. Not audited emissions data.')
console.log('')
console.log('There is deliberately no rating here. An absolute gCO2e figure is not "good"')
console.log('or "bad" on its own — compare it against the baseline above, or against the')
console.log('alternative design decision. Never publish it as a score or a badge.')
console.log('')
console.log('Biggest lever is not in this repo: green hosting would change these numbers')
console.log('more than any design decision measured here, and it sits with Core Delivery')
console.log('Platform. Report that alongside any figure taken from this output.\n')
process.exit(fail ? 1 : 0)
