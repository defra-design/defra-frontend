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

// --- Defra namespace -------------------------------------------------------
// Registered deviations live under src/defra/components with defra* macro
// names and their own fixtures. Same file contract as upstream: fixtures.json
// and macro-options.json, so stories generate the same way.

export const DEFRA_COMPONENTS_DIR = 'src/defra/components'

/** kebab-case component dir -> defraCamelCase macro name */
export const defraMacroName = (dir) =>
  'defra' + dir.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')

export function listDefraComponents () {
  if (!existsSync(DEFRA_COMPONENTS_DIR)) return []
  return readdirSync(DEFRA_COMPONENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => existsSync(join(DEFRA_COMPONENTS_DIR, n, 'fixtures.json')))
    .sort()
}

export function loadDefraFixtures (component) {
  return JSON.parse(
    readFileSync(join(DEFRA_COMPONENTS_DIR, component, 'fixtures.json'), 'utf8')
  )
}

export function loadDefraMacroOptions (component) {
  const p = join(DEFRA_COMPONENTS_DIR, component, 'macro-options.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []
}

/** Render a Defra deviation macro with the given params. */
export function renderDefra (component, params) {
  const macro = defraMacroName(component)
  const tpl = `{% from "defra/components/${component}/macro.njk" import ${macro} %}` +
              `{{ ${macro}(params) }}`
  return env.renderString(tpl, { params })
}

// --- Page types ------------------------------------------------------------
// Whole-page compositions, one per carbon budget. They exist so the byte
// budgets measure a real page instead of an assumed constant, and so designers
// review the system as a page rather than as a parts bin. Composition only:
// every element is an upstream macro or a registered deviation.

export const DEFRA_PAGES_DIR = 'src/defra/pages'

export function listDefraPages () {
  if (!existsSync(DEFRA_PAGES_DIR)) return []
  return readdirSync(DEFRA_PAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => existsSync(join(DEFRA_PAGES_DIR, n, 'template.njk')))
    .sort()
}

/** Render a whole page type. */
export function renderPage (page, params = {}) {
  return env.render(`defra/pages/${page}/template.njk`, { params })
}

/**
 * Wrap a page in the document shell a Hapi service would serve. Exists so the
 * carbon check measures a real document instead of adding a guessed constant
 * for "the bits around the body".
 */
export function renderDocument (page, params = {}) {
  return `<!DOCTYPE html>
<html lang="en" class="govuk-template">
<head>
<meta charset="utf-8">
<title>${page.replace(/-/g, ' ')} - Defra</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#00a33b">
<link rel="stylesheet" href="/assets/defra-frontend.min.css">
</head>
<body class="govuk-template__body">
<script>document.body.className += ' js-enabled' + ('noModule' in HTMLScriptElement.prototype ? ' govuk-frontend-supported' : '');</script>
${renderPage(page, params)}
<script type="module" src="/assets/govuk-frontend.min.js"></script>
</body>
</html>`
}

/** Does this markup initialise any govuk-frontend behaviour? */
export const needsJavaScript = (html) => /\sdata-module=/.test(html)

/** Normalise whitespace so we compare markup, not formatting. */
export const normalise = (html) =>
  html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
