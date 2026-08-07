import '../../../packages/defra-frontend/src/defra-frontend.scss'
import { initAll } from 'govuk-frontend'
import { initAll as initDefra } from '../../../packages/defra-frontend/src/defra-frontend.mjs'
import { withCarbon } from './carbon.js'
import { withCode, docsSourceTransform } from './code.js'
import { installPseudoStateRules } from './pseudo-states.js'

// govuk-frontend components refuse to init without these body signals.
document.body.classList.add('js-enabled', 'govuk-frontend-supported')

// Some components only make sense at the width they actually occupy. A side
// navigation stretched across the full canvas is not the component anyone will
// ship, and judging it there leads to fixing problems that do not exist. A
// fixture can declare its column and the story is rendered inside one.
const withColumn = (story, context) => {
  const column = context.parameters?.column
  const out = story()
  if (!column) return out

  const row = document.createElement('div')
  row.className = 'govuk-grid-row'
  const col = document.createElement('div')
  col.className = `govuk-grid-column-${column}`
  if (typeof out === 'string') col.innerHTML = out
  else col.appendChild(out)
  row.appendChild(col)
  return row
}

// Re-init behaviours after every render. Each render replaces the DOM, so
// nothing is double-bound; errors from stories rendered without required
// options are upstream's problem, not ours to mask.
const withGovukJs = (story) => {
  const out = story()
  window.requestAnimationFrame(() => {
    // Runs after the stylesheet exists; no-ops once each sheet is mirrored.
    installPseudoStateRules()
    try {
      initAll()
    } catch (e) {
      console.warn('govuk-frontend init:', e.message)
    }
    // Defra components init separately — they are a different package with a
    // different bundle, and a failure in one must not stop the other.
    initDefra()
  })
  return out
}

export default {
  tags: ['autodocs'],
  // withCode runs outermost so it sees the story's final markup.
  // withColumn runs first so the others see the wrapped markup.
  decorators: [withGovukJs, withCarbon, withCode, withColumn],
  parameters: {
    layout: 'padded',
    options: {
      // Companion packages sort last: they are demonstrated here, not shipped
      // by @defra/frontend, and the ordering should say so.
      // Introduction first: Storybook opens on the first entry, and landing
      // someone in Accordion with no context is not an introduction to
      // anything. Companion packages last — demonstrated, not shipped.
      storySort: {
        order: [
          'Introduction',
          'Pages',
          'Defra',
          'Defra additions',
          'GOV.UK (Defra themed)',
          'Companion packages'
        ]
      }
    },
    docs: {
      // The Docs page "Show code" defaults to the JavaScript render function,
      // which is a Storybook implementation detail no service ever writes.
      // Show the Nunjucks call instead.
      source: { language: 'django', transform: docsSourceTransform }
    }
  }
}
