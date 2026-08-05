// Browser twin of render.mjs, substituted by the Storybook Vite config.
// Same exports, same search-path semantics: defra views first, then the
// govuk-frontend dist. Template sources are bundled at build time because
// there is no filesystem in the preview iframe.
import nunjucks from 'nunjucks'

const strip = (files, re) => {
  const out = {}
  for (const [path, src] of Object.entries(files)) out[path.replace(re, '')] = src
  return out
}

// Defra views win over govuk-frontend, matching env order in render.mjs.
const defraSources = strip(
  import.meta.glob('../src/**/*.njk', { query: '?raw', import: 'default', eager: true }),
  /^\.\.\/src\//
)
const govukSources = strip(
  import.meta.glob('../../../node_modules/govuk-frontend/dist/**/*.njk', { query: '?raw', import: 'default', eager: true }),
  /^.*\/dist\//
)

const dirname = (p) => p.split('/').slice(0, -1).join('/')

// govuk-frontend macros do `{% include "./template.njk" %}`. FileSystemLoader
// resolves those relative to the including template; this loader must too.
const MapLoader = nunjucks.Loader.extend({
  getSource (name) {
    const key = name.replace(/^\/+/, '')
    const src = defraSources[key] ?? govukSources[key]
    if (src === undefined) throw new Error(`template not found: ${name}`)
    return { src, path: key, noCache: false }
  },
  isRelative: (name) => name.startsWith('./') || name.startsWith('../'),
  resolve (from, to) {
    const out = []
    for (const part of `${dirname(from)}/${to}`.split('/')) {
      if (part === '.' || part === '') continue
      if (part === '..') out.pop()
      else out.push(part)
    }
    return out.join('/')
  }
})

export const env = new nunjucks.Environment(new MapLoader(), {
  autoescape: true,
  trimBlocks: true,
  lstripBlocks: true
})

/** kebab-case component dir -> govukCamelCase macro name */
export const macroName = (dir) =>
  'govuk' + dir.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')

/** Render a component macro with the given params. */
export function render (component, params) {
  const macro = macroName(component)
  const tpl = `{% from "govuk/components/${component}/macro.njk" import ${macro} %}` +
              `{{ ${macro}(params) }}`
  return env.renderString(tpl, { params })
}

/** kebab-case component dir -> defraCamelCase macro name */
export const defraMacroName = (dir) =>
  'defra' + dir.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')

/** Render a Defra deviation macro with the given params. */
export function renderDefra (component, params) {
  const macro = defraMacroName(component)
  const tpl = `{% from "defra/components/${component}/macro.njk" import ${macro} %}` +
              `{{ ${macro}(params) }}`
  return env.renderString(tpl, { params })
}

/** Render a whole page type. */
export function renderPage (page, params = {}) {
  return env.render(`defra/pages/${page}/template.njk`, { params })
}
