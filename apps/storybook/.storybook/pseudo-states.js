// govuk-frontend state fixtures carry a class named literally ":hover",
// ":active" or ":focus". It is a marker for GDS's visual-regression harness,
// which forces real pseudo states in a headless browser. In an ordinary
// browser the class matches nothing, so every "<variant> hover state" story
// renders identical to its base — 12 stories showing the same thing.
//
// The fix derives from upstream rather than restating it: for each existing
// rule that targets :hover, emit a twin targeting .\:hover with the same
// declarations. Nothing is hand-copied, so a bump that changes a state style
// changes these stories automatically and there is nothing to drift.

const STATES = ['hover', 'active', 'focus']

// :hover -> .\:hover, but leave :focus-visible and :focus-within alone.
const PSEUDO = new RegExp(`:(${STATES.join('|')})(?![\\w-])`, 'g')
const toMarker = (selector) => selector.replace(PSEUDO, '.\\:$1')

const processed = new WeakSet()

function collect (rules, out) {
  for (const rule of rules) {
    // Recurse into @media, @supports, @layer
    if (rule.cssRules && !rule.selectorText) {
      collect(rule.cssRules, out)
      continue
    }
    if (!rule.selectorText || !PSEUDO.test(rule.selectorText)) continue
    PSEUDO.lastIndex = 0
    const selector = toMarker(rule.selectorText)
    if (selector !== rule.selectorText) out.push(`${selector}{${rule.style.cssText}}`)
  }
}

/** Mirror every pseudo-state rule onto its marker-class equivalent. */
export function installPseudoStateRules (doc = document) {
  const out = []
  for (const sheet of doc.styleSheets) {
    if (processed.has(sheet)) continue
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin, nothing we can read
    }
    processed.add(sheet)
    collect(rules, out)
  }
  if (!out.length) return 0

  const el = doc.createElement('style')
  el.dataset.defraPseudoStates = ''
  el.textContent = out.join('\n')
  doc.head.appendChild(el)
  return out.length
}
