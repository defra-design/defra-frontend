// Per-story weight readout, rendered inside the preview iframe. Deliberately
// not a manager addon: manager UI is written in React, and this repo is
// vanilla JavaScript only. Same method as scripts/carbon.mjs — SWDM v4, GB
// grid, green hosting false.
//
// Two UX rules, both load-bearing:
//
// 1. NO GRADE. There is no rating, no colour-coding of the total against a
//    "good" threshold, no badge. The method cannot support it (see the header
//    of scripts/carbon.mjs) and a grade would be read as a verdict.
//
// 2. Lead with what the story CONTROLS. An earlier version showed one combined
//    mg CO2e figure per story. That figure was ~95% shared stylesheet, so a
//    button and a whole page differed by about 7% — it looked like a per-story
//    score while mostly measuring something the story does not affect. Markup
//    is what a component decides; the stylesheet and the bundle are paid once
//    per service and cached. They are now shown separately and labelled.
import { co2, averageIntensity } from '@tgwf/co2'

const emissions = new co2({ model: 'swd', version: 4 })
const gb = averageIntensity.data.GBR

const estimate = (bytes) =>
  emissions.perByteTrace(bytes, false, {
    gridIntensity: { device: gb, network: gb }
  }).co2

async function gzipSize (text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return (await new Response(stream).arrayBuffer()).byteLength
}

const cssGz = typeof __DEFRA_CSS_GZ__ === 'number' ? __DEFRA_CSS_GZ__ : 0
const jsGz = typeof __DEFRA_JS_GZ__ === 'number' ? __DEFRA_JS_GZ__ : 0
const budgets = typeof __DEFRA_BUDGETS__ === 'object' ? __DEFRA_BUDGETS__ : {}

const bytes = (n) => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`

// One paragraph per line — no manual wrapping. Hard-wrapping this text would
// make it, rather than the content, decide how wide the panel is.
const METHOD = [
  'Gzipped, first uncached load. SWDM v4 via CO2.js, GB grid intensity, green hosting assumed false.',
  'Directional figures for comparing design decisions. Not audited emissions data. There is deliberately no rating: an absolute figure is not "good" or "bad" on its own. Compare against the budget, or against the alternative design decision.',
  'Shared cost is the stylesheet and the govuk-frontend bundle. Every page in a service pays it once and it is cached thereafter, so it is not this story’s weight — it is the floor every story sits on.',
  'Body is the story fragment only. `npm run carbon` measures the whole document, shell included, so its figure for a page is higher than the body shown here. The budget quoted is that whole-document budget.',
  'CSS weight comes from the last `npm run build`, so it is stale until you rebuild. Green hosting is the biggest lever and sits with Core Delivery Platform, not this repo.'
].join('\n\n')

// Decorative only. Inherits currentColor rather than carrying its own colour:
// a green leaf beside a number reads as approval, which is the verdict this
// readout is built to avoid. It marks the readout, it does not rate it.
const TREE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" ' +
  'viewBox="0 0 256 256" aria-hidden="true" focusable="false" style="flex:none">' +
  '<path d="M198.1,62.59a76,76,0,0,0-140.2,0A71.71,71.71,0,0,0,16,127.8C15.9,166,48,199,86.14,200A72.09,72.09,0,0,0,120,192.47V232a8,8,0,0,0,16,0V192.47A72.17,72.17,0,0,0,168,200l1.82,0C208,199,240.11,166,240,127.8A71.71,71.71,0,0,0,198.1,62.59ZM169.45,184a56.08,56.08,0,0,1-33.45-10v-41l43.58-21.78a8,8,0,1,0-7.16-14.32L136,115.06V88a8,8,0,0,0-16,0v51.06L83.58,120.84a8,8,0,1,0-7.16,14.32L120,156.94v17a56,56,0,0,1-33.45,10C56.9,183.23,31.92,157.52,32,127.84A55.77,55.77,0,0,1,67.11,76a8,8,0,0,0,4.53-4.67,60,60,0,0,1,112.72,0A8,8,0,0,0,188.89,76,55.79,55.79,0,0,1,224,127.84C224.08,157.52,199.1,183.23,169.45,184Z"></path></svg>'

function shell () {
  let el = document.getElementById('defra-carbon')
  if (el) return el

  el = document.createElement('details')
  el.id = 'defra-carbon'
  // A full-width footer bar rather than a floating card. This is a Storybook-
  // only tool viewed on a desktop, so there is no reason to fight for width:
  // spanning the viewport removes the wrapping problem instead of managing it.
  //
  // column-reverse puts the summary at the bottom and the method panel above
  // it, so the bar stays pinned to the bottom edge and expands upward when
  // opened, rather than pushing its own detail off-screen.
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
    'display:flex;flex-direction:column-reverse;' +
    'font:11px/1.5 ui-monospace,monospace;color:#0b0c0c;background:#fff;' +
    'border-top:1px solid #b1b4b6'

  const summary = document.createElement('summary')
  summary.style.cssText =
    'padding:6px 12px;cursor:pointer;list-style:none;color:#505a5f;' +
    'display:flex;align-items:center;gap:8px'
  summary.innerHTML = TREE_ICON
  const text = document.createElement('span')
  text.id = 'defra-carbon-summary'
  text.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0'
  summary.appendChild(text)

  const body = document.createElement('div')
  body.id = 'defra-carbon-detail'
  // Sits above the summary (column-reverse), so the divider is its own
  // bottom border. Prose still gets a readable measure — a full-width
  // paragraph at 11px would be unreadable regardless of available space.
  body.style.cssText =
    'padding:12px;border-bottom:1px solid #b1b4b6;white-space:pre-line;' +
    'color:#505a5f;max-width:48rem;max-height:16rem;overflow:auto'
  body.textContent = METHOD

  el.append(summary, body)
  document.body.appendChild(el)

  // Keep the bar from covering the end of a story. Re-measured on toggle
  // because the panel changes height when opened.
  const reserve = () => {
    document.body.style.paddingBottom = `${el.getBoundingClientRect().height + 8}px`
  }
  el.addEventListener('toggle', reserve)
  requestAnimationFrame(reserve)
  return el
}

/** Storybook decorator: measure the rendered story, update the readout. */
export const withCarbon = (story, context) => {
  const out = story()
  if (context.viewMode !== 'story') return out

  const html = typeof out === 'string' ? out : out?.outerHTML ?? ''
  gzipSize(html).then((htmlGz) => {
    const el = shell()
    const summary = el.querySelector('#defra-carbon-summary')

    // Page stories carry a budget, which is the only honest "is this a lot?"
    // answer available — it is a threshold someone agreed to, not a grade.
    const pageName = Object.keys(budgets).find(
      (p) => context.title === `Pages/${p.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}`
    )
    const budget = pageName ? budgets[pageName].html : null

    // "body", not "markup": Storybook renders the story fragment, while the
    // budget covers the whole document. Saying "35% of budget" without that
    // scope would read as the page total when the shell pushes it higher.
    const parts = [`body ${bytes(htmlGz)}`]
    if (budget) {
      const pct = Math.round((htmlGz / budget) * 100)
      parts.push(`${pct}% of html budget`)
    }
    parts.push(`+ ${bytes(cssGz + jsGz)} shared`)

    // The carbon figure is the headline — it is a carbon readout, and burying
    // it would be a strange thing for one to do. What it must NOT be is a
    // per-story score, so it is stated as the whole first uncached load (the
    // only quantity here that means anything physically) with the byte
    // breakdown beneath it as the thing a story actually changes.
    //
    // Still no grade: no colour-coding, no threshold, no rating.
    const mg = estimate(htmlGz + cssGz + jsGz) * 1000

    // Each metric is atomic. Without this the line breaks inside a value
    // ("+ 26.3" / "KB shared"), which reads as two numbers instead of one.
    // Wrapping is still allowed, but only at the separators.
    // One row now the bar spans the viewport. The carbon figure leads, the
    // byte breakdown follows as supporting detail, and the method affordance
    // is pushed to the far edge so it reads as an action, not another metric.
    const nowrap = (t, style = '') =>
      `<span style="white-space:nowrap;${style}">${t}</span>`
    const sep = '<span style="color:#b1b4b6">·</span>'

    summary.innerHTML =
      nowrap(`≈ ${mg.toFixed(2)} mg CO2e`, 'color:#0b0c0c') +
      nowrap('first uncached load') +
      sep +
      parts.map((p) => nowrap(p)).join(sep) +
      nowrap('▸ method', 'margin-left:auto;padding-left:12px')

    summary.title = 'What this measures, and what it does not'
  })

  return out
}
