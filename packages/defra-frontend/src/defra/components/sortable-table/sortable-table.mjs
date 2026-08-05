/**
 * DEF-105 — sortable table.
 *
 * Enhancement only. The headers are already links that sort server-side; this
 * intercepts them and sorts in place.
 *
 * Two accessibility points that are easy to get wrong:
 *
 * 1. `aria-sort` must be updated on the th, and only ONE column may carry a
 *    value other than "none". Leaving a stale value on a previously sorted
 *    column reports two sorted columns, which is incoherent.
 *
 * 2. Re-ordering rows silently is a change of context a screen reader user
 *    cannot see. The new order is announced through a polite live region.
 */
export class SortableTable {
  static moduleName = 'defra-sortable-table'

  constructor (root) {
    this.table = root
    this.body = root.querySelector('tbody')
    if (!this.body) return

    this.status = document.createElement('div')
    this.status.className = 'govuk-visually-hidden'
    this.status.setAttribute('aria-live', 'polite')
    root.insertAdjacentElement('afterend', this.status)

    root.querySelectorAll('th[aria-sort]').forEach((th) => {
      const link = th.querySelector('.defra-sortable-table__button')
      link?.addEventListener('click', (e) => {
        e.preventDefault()
        const current = th.getAttribute('aria-sort')
        this.sort(th, current === 'ascending' ? 'descending' : 'ascending')
      })
    })
  }

  sort (th, direction) {
    const headers = [...this.table.querySelectorAll('th[aria-sort]')]
    const index = [...th.parentNode.children].indexOf(th)

    const rows = [...this.body.querySelectorAll('tr')]
    const value = (row) => {
      const cell = row.children[index]
      if (!cell) return ''
      // An explicit sort value wins: display text is frequently not sortable
      // ("14 January 2026", "£1,200"), and parsing it back out is guesswork.
      return cell.dataset.sortValue ?? cell.textContent.trim()
    }

    const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' })
    rows.sort((a, b) => {
      const result = collator.compare(value(a), value(b))
      return direction === 'ascending' ? result : -result
    })
    rows.forEach((row) => this.body.appendChild(row))

    // Exactly one column may report a sort state.
    headers.forEach((h) => h.setAttribute('aria-sort', 'none'))
    th.setAttribute('aria-sort', direction)

    const name = th.textContent.trim()
    this.status.textContent =
      `Sorted by ${name}, ${direction === 'ascending' ? 'ascending' : 'descending'}`
  }
}
