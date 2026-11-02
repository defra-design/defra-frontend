/**
 * Loads the generated catalogue and holds the rules that have to travel with
 * it.
 *
 * The rules are here rather than written into each tool's prose because they
 * are the same rules in every answer, and a rule that is restated by hand in
 * four places is a rule that will eventually differ in one of them.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const catalogue = JSON.parse(
  readFileSync(join(here, 'catalogue.json'), 'utf8')
)

export const components = catalogue.components

export const find = (name) => {
  const wanted = String(name ?? '').trim().toLowerCase()
  // A macro name is unambiguous, so it wins outright. A bare name like
  // "footer" may exist in both namespaces, and there the Defra one is the
  // answer — it exists precisely because the upstream one must not be used.
  // Ordering this explicitly rather than leaning on how the array happens to
  // be sorted.
  return components.find((c) => c.macro.toLowerCase() === wanted) ??
    components.find((c) => c.name === wanted && c.namespace === 'defra') ??
    components.find((c) => c.name === wanted) ??
    null
}

/**
 * The failure this whole namespace exists to avoid, stated where an assistant
 * will actually read it.
 *
 * Every macro.njk in govuk-frontend includes "./template.njk" — a RELATIVE
 * include, which nunjucks resolves inside node_modules regardless of
 * search-path order. So a file placed at govuk/components/<x>/template.njk in
 * a prototype's views does nothing at all: no error, no warning, the upstream
 * component simply renders. It is the worst shape of bug, because the fix
 * looks applied.
 */
export const NEVER_SHADOW =
  'Never create a file at govuk/components/<name>/template.njk to change a ' +
  'GOV.UK component. GOV.UK macros include their template by relative path, ' +
  'so a file placed there is silently ignored — the page renders the upstream ' +
  'component and nothing reports a problem. Use the defra* macro where one ' +
  'exists, or compose from upstream macros.'

/**
 * Not a style preference. GDS Transport is licensed for www.gov.uk,
 * *.service.gov.uk and *.blog.gov.uk only, and the GOV.UK footer asserts the
 * Royal Arms and the Open Government Licence. A Defra service on another
 * domain using either is making a claim it is not entitled to make.
 */
export const BRAND_RULE =
  'Brand mode is a licence boundary. On *.service.gov.uk a service must use ' +
  'GDS Transport with the GOV.UK header and footer. Anywhere else it must ' +
  'not: use govukGenericHeader and defraFooter. The default for prototypes ' +
  'is the Defra mode, so prefer defraFooter over govukFooter unless the ' +
  'prototype is on a service.gov.uk address.'
