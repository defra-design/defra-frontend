/**
 * DEF-106 — session timeout dialog.
 *
 * Warns before a session expires and offers an extension, per WCAG 2.2.1.
 *
 * The announcement strategy is the part worth reading. A countdown that
 * updates a live region every second produces a screen reader announcement
 * every second, which is unusable — it drowns out everything else and cannot
 * be interrupted. So the visible countdown ticks every second, while a
 * separate polite region announces only at decreasing intervals. Sighted and
 * screen reader users get the same information at a usable rate.
 */
export class TimeoutDialog {
  static moduleName = 'defra-timeout-dialog'

  // Seconds remaining at which to announce. Sparse early, tighter at the end.
  static ANNOUNCE_AT = [120, 60, 30, 20, 10, 5]

  constructor (root) {
    this.dialog = root
    this.timeout = Number(root.dataset.timeout) || 900
    this.warning = Number(root.dataset.warning) || 120
    this.signOutUrl = root.dataset.signOutUrl
    this.keepAliveUrl = root.dataset.keepAliveUrl

    this.countdownEl = root.querySelector('[data-countdown]')
    this.keepAliveButton = root.querySelector('[data-keep-alive]')

    // Native <dialog> is required. Without it there is no reliable focus trap,
    // so rather than ship a broken half-modal, do nothing and let the server's
    // own session handling take over.
    if (typeof root.showModal !== 'function') return

    this.status = document.createElement('div')
    this.status.className = 'govuk-visually-hidden'
    this.status.setAttribute('aria-live', 'polite')
    root.appendChild(this.status)

    this.keepAliveButton?.addEventListener('click', () => this.keepAlive())

    // Escape closes a native dialog. Treat that as "stay signed in" rather
    // than leaving the session to expire silently behind a dismissed warning.
    root.addEventListener('close', () => {
      if (!this.expired) this.keepAlive()
    })

    this.start()
  }

  start () {
    clearTimeout(this.warnTimer)
    this.warnTimer = setTimeout(
      () => this.warn(),
      (this.timeout - this.warning) * 1000
    )
  }

  warn () {
    this.remaining = this.warning
    this.announced = new Set()
    this.render()

    if (!this.dialog.open) this.dialog.showModal()
    // Focus the extension, not the sign-out: the safe default should be the
    // one reached by pressing Enter.
    this.keepAliveButton?.focus()

    clearInterval(this.ticker)
    this.ticker = setInterval(() => {
      this.remaining -= 1
      if (this.remaining <= 0) return this.expire()
      this.render()
    }, 1000)
  }

  render () {
    const text = this.format(this.remaining)
    if (this.countdownEl) this.countdownEl.textContent = text

    // Announce only at the chosen thresholds — see the class comment.
    if (TimeoutDialog.ANNOUNCE_AT.includes(this.remaining) && !this.announced.has(this.remaining)) {
      this.announced.add(this.remaining)
      this.status.textContent = `You will be signed out in ${text}`
    }
  }

  format (seconds) {
    if (seconds >= 60) {
      const m = Math.ceil(seconds / 60)
      return `${m} minute${m === 1 ? '' : 's'}`
    }
    return `${seconds} second${seconds === 1 ? '' : 's'}`
  }

  async keepAlive () {
    clearInterval(this.ticker)
    if (this.dialog.open) this.dialog.close()

    if (this.keepAliveUrl) {
      // A failed extension must not look like a successful one. If the server
      // cannot be reached the session is probably already gone, so warn again
      // straight away rather than resetting the full timer.
      try {
        const res = await fetch(this.keepAliveUrl, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(String(res.status))
      } catch {
        return this.warn()
      }
    }
    this.start()
  }

  expire () {
    this.expired = true
    clearInterval(this.ticker)
    if (this.signOutUrl) window.location.assign(this.signOutUrl)
  }
}
