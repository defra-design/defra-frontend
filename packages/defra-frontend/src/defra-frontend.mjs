/**
 * defra-frontend JavaScript.
 *
 * Mirrors govuk-frontend's contract deliberately: components are found by
 * `data-module`, and `initAll` is called once after the DOM is ready. A Defra
 * service already knows this pattern, so there is nothing new to learn.
 *
 * Every component here is an enhancement to markup that already works — with
 * the single exception of the timeout dialog, which is registered as DEF-106
 * precisely because it cannot degrade. Nothing else may join that exception
 * without the same registration.
 */
import { AddAnother } from './defra/components/add-another/add-another.mjs'
import { Filter } from './defra/components/filter/filter.mjs'
import { SortableTable } from './defra/components/sortable-table/sortable-table.mjs'
import { TimeoutDialog } from './defra/components/timeout-dialog/timeout-dialog.mjs'

export { AddAnother, Filter, SortableTable, TimeoutDialog }

const COMPONENTS = [AddAnother, Filter, SortableTable, TimeoutDialog]

/**
 * Initialise every Defra component within `scope`.
 *
 * A failing component must not stop the others: a service page may carry
 * several, and one throwing should degrade that component to its no-JS
 * behaviour rather than taking the page's JavaScript down with it.
 */
export function initAll (scope = document) {
  for (const Component of COMPONENTS) {
    const selector = `[data-module="${Component.moduleName}"]`
    for (const el of scope.querySelectorAll(selector)) {
      // Guard against double-initialising when initAll runs more than once,
      // which it does in Storybook and in any page that re-renders.
      if (el.dataset.defraInitialised === 'true') continue
      try {
        new Component(el)
        el.dataset.defraInitialised = 'true'
      } catch (error) {
        console.error(`defra-frontend: ${Component.moduleName} failed to initialise`, error)
      }
    }
  }
}
