import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const pkg = (p) => fileURLToPath(new URL(`../../../packages/defra-frontend/${p}`, import.meta.url))

// Shared weights for the carbon readout, computed here because the preview
// iframe cannot gzip its own assets. Stale until `npm run build`; the badge
// says so.
const distCss = pkg('dist/defra-frontend.min.css')
const cssGz = existsSync(distCss) ? gzipSync(readFileSync(distCss), { level: 9 }).length : 0

const distJs = fileURLToPath(new URL('../../../node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.js', import.meta.url))
const jsGz = existsSync(distJs) ? gzipSync(readFileSync(distJs), { level: 9 }).length : 0

// Same file the carbon check reads — budgets are never duplicated.
const budgetsPath = fileURLToPath(new URL('../../../carbon-budgets.json', import.meta.url))
const budgets = existsSync(budgetsPath) ? JSON.parse(readFileSync(budgetsPath, 'utf8')) : {}

// GitHub Pages serves a project site from /<repo>/, not from the domain root.
// Two things break at a subpath and both are fixed here rather than in CI:
//
//   1. Vite's asset URLs, via `base`.
//   2. `$govuk-assets-path`, which defaults to the absolute "/assets/". The
//      built CSS references /assets/images/govuk-crest.svg, which would 404.
//      Prepending the variable wins over the `!default` in the package.
//
// Defaults to "/" so local dev is unaffected.
const BASE = process.env.STORYBOOK_BASE_PATH || '/'

export default {
  framework: '@storybook/html-vite',
  stories: ['../../../packages/defra-frontend/src/stories/generated/*.stories.js'],
  addons: ['@storybook/addon-docs'],
  staticDirs: [
    { from: '../../../node_modules/govuk-frontend/dist/govuk/assets', to: '/assets' }
  ],
  viteFinal: (config) => {
    config.define = {
      ...config.define,
      __DEFRA_CSS_GZ__: JSON.stringify(cssGz),
      __DEFRA_JS_GZ__: JSON.stringify(jsGz),
      __DEFRA_BUDGETS__: JSON.stringify(budgets)
    }
    config.base = BASE
    config.server = { ...config.server, fs: { allow: [repoRoot] } }
    config.css = {
      ...config.css,
      preprocessorOptions: {
        scss: {
          // Wins over the `!default` in the package, so asset URLs resolve
          // under a GitHub Pages subpath. No-op when BASE is "/".
          additionalData: `$govuk-assets-path: "${BASE}assets/";\n`,
          loadPaths: [`${repoRoot}node_modules`],
          quietDeps: true,
          silenceDeprecations: ['import']
        }
      }
    }
    // Stories import lib/render.mjs (Node, fs-backed). In the browser build the
    // browser twin answers instead; the generated stories stay untouched.
    config.plugins = [
      {
        name: 'defra-render-browser-shim',
        enforce: 'pre',
        resolveId (source) {
          if (source.endsWith('/lib/render.mjs')) return pkg('lib/render.browser.mjs')
        }
      },
      ...config.plugins
    ]
    return config
  }
}
