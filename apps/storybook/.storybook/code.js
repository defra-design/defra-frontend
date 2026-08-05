// Shows the Nunjucks call and the rendered HTML beneath each story, the way
// the GOV.UK Design System shows them beneath each example.
//
// It sits in the preview iframe rather than in the addon panel next to
// Controls. A panel tab there is a manager addon, and Storybook's manager UI
// is React — which this repo does not use. The same reasoning kept the carbon
// readout in the preview.
//
// Both blocks are DERIVED, never hand-written: the Nunjucks is reconstructed
// from the macro name and import path the generator recorded, and the HTML is
// the story's own output. Neither can drift from what the component actually
// is.

/** JSON, but with unquoted keys where they are safe — how GDS writes examples. */
function toNunjucksValue (value, indent = 2) {
  const pad = ' '.repeat(indent)
  const padEnd = ' '.repeat(Math.max(0, indent - 2))

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const items = value.map((v) => pad + toNunjucksValue(v, indent + 2))
    return `[\n${items.join(',\n')}\n${padEnd}]`
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return '{}'
    const entries = keys.map((k) => {
      // Nunjucks accepts quoted keys, but unquoted reads better and matches
      // the upstream documentation.
      const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)
      return `${pad}${key}: ${toNunjucksValue(value[k], indent + 2)}`
    })
    return `{\n${entries.join(',\n')}\n${padEnd}}`
  }
  return JSON.stringify(value)
}

function nunjucksFor (context) {
  const { macro, importPath } = context.parameters ?? {}
  if (!macro || !importPath) return null
  const args = context.args ?? {}
  const params = Object.keys(args).length ? toNunjucksValue(args) : '{}'
  return `{% from "${importPath}" import ${macro} %}\n\n{{ ${macro}(${params}) }}`
}

/**
 * Indent HTML for reading. Deliberately simple: it only breaks between tags
 * and never touches text content, so it cannot alter what is being shown.
 */
function formatHtml (html) {
  const void_ = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'])
  const tokens = html.replace(/>\s+</g, '><').split(/(<[^>]+>)/).filter((t) => t.trim())
  let depth = 0
  const lines = []
  for (const token of tokens) {
    const isTag = token.startsWith('<')
    const isClose = token.startsWith('</')
    const name = isTag ? token.match(/^<\/?([\w-]+)/)?.[1] : null
    const selfClosing = isTag && (token.endsWith('/>') || void_.has(name))

    if (isClose) depth = Math.max(0, depth - 1)
    lines.push('  '.repeat(depth) + token.trim())
    if (isTag && !isClose && !selfClosing && !token.startsWith('<!')) depth += 1
  }
  return lines.join('\n')
}

function block (label, code) {
  const wrap = document.createElement('section')
  wrap.style.cssText = 'margin-top:16px'

  const heading = document.createElement('h2')
  heading.textContent = label
  heading.style.cssText =
    'margin:0 0 4px;font:600 12px/1.4 ui-monospace,monospace;color:#505a5f;' +
    'text-transform:uppercase;letter-spacing:0.04em'

  const pre = document.createElement('pre')
  pre.style.cssText =
    'margin:0;padding:12px;overflow:auto;max-height:22rem;' +
    'font:12px/1.6 ui-monospace,monospace;color:#0b0c0c;' +
    'background:#f3f2f1;border:1px solid #b1b4b6;white-space:pre'
  // textContent, not innerHTML — this is untrusted-shaped content and must be
  // displayed as text, never parsed.
  pre.textContent = code

  wrap.append(heading, pre)
  return wrap
}

/** Storybook decorator: append the Nunjucks and HTML for this story. */
export const withCode = (story, context) => {
  const out = story()
  if (context.viewMode !== 'story') return out

  const html = typeof out === 'string' ? out : out?.outerHTML ?? ''

  window.requestAnimationFrame(() => {
    document.getElementById('defra-code')?.remove()

    const details = document.createElement('details')
    details.id = 'defra-code'
    details.style.cssText = 'margin:24px 0 0;font-family:system-ui,sans-serif'

    const summary = document.createElement('summary')
    summary.textContent = 'Show code'
    summary.style.cssText =
      'cursor:pointer;font:14px/1.5 system-ui,sans-serif;color:#0f7a52;' +
      'text-decoration:underline;padding:4px 0'
    details.appendChild(summary)

    const njk = nunjucksFor(context)
    if (njk) details.appendChild(block('Nunjucks', njk))
    details.appendChild(block('HTML', formatHtml(html)))

    document.body.appendChild(details)
  })

  return out
}

// Also used for the Docs page, so "Show code" there shows the Nunjucks call
// rather than the JavaScript render function, which no service ever writes.
export const docsSourceTransform = (_code, context) => nunjucksFor(context) ?? _code
