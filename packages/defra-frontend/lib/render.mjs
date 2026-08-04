import nunjucks from 'nunjucks'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const GOVUK_DIST = '../../node_modules/govuk-frontend/dist'
export const COMPONENTS_DIR = join(GOVUK_DIST, 'govuk/components')

// Defra views come FIRST so a Defra template of the same path wins over GOV.UK.
// This is the whole override mechanism: precedence, not forking.
export const env = nunjucks.configure(['src', GOVUK_DIST], {
  autoescape: true,
  trimBlocks: true,
  lstripBlocks: true
})

/** kebab-case component dir -> govukCamelCase macro name */
export const macroName = (dir) =>
  'govuk' + dir.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')

/** Every component that ships fixtures */
export function listComponents () {
  return readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => existsSync(join(COMPONENTS_DIR, n, 'fixtures.json')))
    .sort()
}

export function loadFixtures (component) {
  return JSON.parse(
    readFileSync(join(COMPONENTS_DIR, component, 'fixtures.json'), 'utf8')
  )
}

export function loadMacroOptions (component) {
  const p = join(COMPONENTS_DIR, component, 'macro-options.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []
}

/** Render a component macro with the given params. */
export function render (component, params) {
  const macro = macroName(component)
  const tpl = `{% from "govuk/components/${component}/macro.njk" import ${macro} %}` +
              `{{ ${macro}(params) }}`
  return env.renderString(tpl, { params })
}

/** Normalise whitespace so we compare markup, not formatting. */
export const normalise = (html) =>
  html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
