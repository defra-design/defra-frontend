/**
 * DEF-104 — filter.
 *
 * Enhancement only: adds a disclosure button so filters can be collapsed at
 * narrow widths. Without this the filters are simply always visible, which is
 * a perfectly good form.
 *
 * The button is created in JavaScript rather than rendered hidden in the
 * template, because a toggle button that does nothing is worse than no button
 * — it is a control that appears operable and is not.
 */
export class Filter {
  static moduleName = 'defra-filter'

  // Matches govuk-frontend's tablet breakpoint. Above it there is room for
  // filters and results side by side, so collapsing them only adds a step.
  static BREAKPOINT = '(min-width: 40.0625em)'

  constructor (root) {
    this.root = root
    this.content = root.querySelector('.defra-filter__content')
    this.header = root.querySelector('.defra-filter__header')
    if (!this.content || !this.header) return

    if (!this.content.id) this.content.id = `defra-filter-content-${Math.random().toString(36).slice(2)}`

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'govuk-button govuk-button--secondary defra-filter__toggle'
    this.button.setAttribute('aria-controls', this.content.id)
    this.button.addEventListener('click', () => this.toggle())
    this.header.appendChild(this.button)

    this.query = window.matchMedia(Filter.BREAKPOINT)
    this.query.addEventListener('change', () => this.apply())
    this.apply()
  }

  /**
   * Above the breakpoint the filters are always shown and the button is
   * removed from the accessibility tree entirely — leaving a hidden-but-
   * focusable control is a classic keyboard trap for sighted keyboard users.
   */
  apply () {
    const wide = this.query.matches
    this.button.hidden = wide
    if (wide) {
      this.content.hidden = false
      this.button.setAttribute('aria-expanded', 'true')
    } else {
      this.setExpanded(this.button.getAttribute('aria-expanded') === 'true')
    }
  }

  toggle () {
    this.setExpanded(this.button.getAttribute('aria-expanded') !== 'true')
  }

  setExpanded (expanded) {
    this.button.setAttribute('aria-expanded', String(expanded))
    this.button.textContent = expanded ? 'Hide filters' : 'Show filters'
    this.content.hidden = !expanded
  }
}
