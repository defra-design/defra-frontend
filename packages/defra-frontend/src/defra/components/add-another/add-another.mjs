/**
 * DEF-103 — add another.
 *
 * Enhancement only. Without this file the buttons submit and the server
 * re-renders; with it the round trip is skipped. Anything this does must
 * therefore also be doable server-side.
 *
 * The hard part is not cloning the markup, it is renumbering it. Every `id`,
 * `name`, `for` and `aria-describedby` carries an index, and a stale index
 * silently breaks either form submission or the link between an input and its
 * hint and error message — a failure that is invisible on screen and total
 * for a screen reader.
 */
export class AddAnother {
  static moduleName = 'defra-add-another'

  constructor (root) {
    this.root = root
    this.itemName = root.dataset.itemName || 'item'
    this.list = root.querySelector('.defra-add-another__items')
    this.addButton = root.querySelector('.defra-add-another__add')
    if (!this.list || !this.addButton) return

    // Announcements go through a polite live region rather than a focus jump
    // alone, so the change is reported without stealing the user's place.
    this.status = document.createElement('div')
    this.status.className = 'govuk-visually-hidden'
    this.status.setAttribute('aria-live', 'polite')
    root.appendChild(this.status)

    this.addButton.addEventListener('click', (e) => {
      e.preventDefault()
      this.add()
    })
    root.addEventListener('click', (e) => {
      const remove = e.target.closest('.defra-add-another__remove')
      if (remove && root.contains(remove)) {
        e.preventDefault()
        this.remove(remove.closest('.defra-add-another__item'))
      }
    })

    this.update()
  }

  get items () {
    return [...this.list.querySelectorAll('.defra-add-another__item')]
  }

  add () {
    const items = this.items
    const template = items[items.length - 1]
    const clone = template.cloneNode(true)

    // Clear values before reindexing so nothing carries over from the item
    // that happened to be used as the template.
    clone.querySelectorAll('input, textarea, select').forEach((field) => {
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = false
      else if (field.tagName === 'SELECT') field.selectedIndex = 0
      else field.value = ''
      field.removeAttribute('aria-invalid')
    })
    // Any error message rendered against the template item belongs to that
    // item's data, not to a blank one.
    clone.querySelectorAll('.govuk-error-message').forEach((el) => el.remove())
    clone.querySelectorAll('.govuk-form-group--error').forEach((el) => {
      el.classList.remove('govuk-form-group--error')
    })
    clone.querySelectorAll('.govuk-input--error, .govuk-textarea--error, .govuk-select--error')
      .forEach((el) => el.classList.remove('govuk-input--error', 'govuk-textarea--error', 'govuk-select--error'))

    this.list.appendChild(clone)
    this.update()

    const first = clone.querySelector('input, textarea, select')
    if (first) first.focus()
    this.announce(`${this.itemName} ${this.items.length} added`)
  }

  remove (item) {
    if (this.items.length <= 1) return
    const index = this.items.indexOf(item)
    item.remove()
    this.update()

    // Focus must land somewhere deliberate: the item that took this one's
    // place, or the add button if the last item was removed. Leaving focus on
    // a detached node sends it to <body> and loses the user's position.
    const items = this.items
    const next = items[index] || items[items.length - 1]
    const target = next?.querySelector('input, textarea, select') || this.addButton
    target.focus()
    this.announce(`${this.itemName} removed, ${items.length} remaining`)
  }

  /** Renumber legends, ids and every attribute that references an id. */
  update () {
    const items = this.items
    items.forEach((item, i) => {
      const legend = item.querySelector('.defra-add-another__legend')
      if (legend) legend.textContent = `${this.capitalise(this.itemName)} ${i + 1}`

      const remove = item.querySelector('.defra-add-another__remove')
      if (remove) {
        remove.value = String(i)
        const hidden = remove.querySelector('.govuk-visually-hidden')
        if (hidden) hidden.textContent = ` ${this.itemName} ${i + 1}`
      }

      // Rewrite the index inside id/name/for/aria-describedby. Matches both
      // `name="points[0][grid]"` and `id="points-0-grid"`.
      const reindex = (value) => value
        .replace(/\[(\d+)\]/g, `[${i}]`)
        .replace(/(^|[-_])(\d+)(?=[-_]|$)/g, `$1${i}`)

      item.querySelectorAll('[id], [name], [for], [aria-describedby]').forEach((el) => {
        for (const attr of ['id', 'name', 'for', 'aria-describedby']) {
          const value = el.getAttribute(attr)
          if (value) el.setAttribute(attr, reindex(value))
        }
      })
    })

    // With one item left, Remove would empty the form.
    const only = items.length === 1
    items.forEach((item) => {
      const remove = item.querySelector('.defra-add-another__remove')
      if (remove) remove.hidden = only
    })
  }

  announce (message) {
    this.status.textContent = message
  }

  capitalise (s) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
}
