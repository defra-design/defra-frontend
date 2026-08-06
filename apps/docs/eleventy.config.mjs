// Docs site.
//
// NOT built on govuk-eleventy-plugin, which the build order originally named.
// That plugin depends on govuk-frontend ^4.3.0 and has no v5 or v6 line, so it
// would render this site three majors behind the library it documents — a
// documentation site that misrepresents the thing it documents is worse than
// none. It is built on plain Eleventy and themed by @defra/frontend instead,
// which also means the site is a live demonstration of the package.
//
// Every page is generated from the same sources the checks read: fixtures,
// macro-options, deviations.json, carbon-budgets.json and carbon-baseline.json.
// Nothing here restates a fact that lives somewhere else, so nothing here can
// contradict it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgRoot = fileURLToPath(new URL('../../packages/defra-frontend/', import.meta.url))

export default function (eleventyConfig) {
  // The compiled stylesheet from the package. Built by `npm run build` at the
  // repo root, so the docs always show the current tokens.
  eleventyConfig.addPassthroughCopy({
    [`${pkgRoot}dist/defra-frontend.min.css`]: 'assets/defra-frontend.min.css'
  })
  eleventyConfig.addPassthroughCopy({
    [`${pkgRoot}src/defra-frontend.mjs`]: 'assets/defra-frontend.mjs'
  })

  // Nunjucks needs to reach the package's views so the docs can render real
  // components rather than screenshots or hand-written markup.
  eleventyConfig.setNunjucksEnvironmentOptions({ trimBlocks: true, lstripBlocks: true })

  eleventyConfig.addFilter('json', (value) => JSON.stringify(value, null, 2))

  eleventyConfig.addFilter('title', (s) =>
    String(s).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  )

  eleventyConfig.addFilter('bytes', (n) =>
    n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
  )

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data'
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    // Served under /docs/ on GitHub Pages, alongside the Storybook at the root.
    pathPrefix: process.env.DOCS_PATH_PREFIX || '/'
  }
}
