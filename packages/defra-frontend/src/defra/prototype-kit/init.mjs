/**
 * Prototype Kit entry point.
 *
 * The kit loads a plugin's `scripts` as plain files — it does not import them
 * as modules and call anything. Pointing it at `defra-frontend.mjs` therefore
 * loaded the components and never started them: add-another, filter and
 * sortable-table rendered but did nothing, and "Add another" submitted the
 * whole form instead of adding an item.
 *
 * govuk-frontend solves this with its own `dist/govuk-prototype-kit/init.js`,
 * separate from its library entry point. This is the same thing: the library
 * entry stays a library, and this file is the only place that assumes it is
 * running in a page.
 */
import { initAll } from '../../defra-frontend.mjs'

// The kit loads plugin scripts at the end of the body, so the DOM is usually
// ready — but `defer`/`type="module"` ordering is not something to rely on
// when the cost of being wrong is components that silently do nothing.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initAll())
} else {
  initAll()
}
