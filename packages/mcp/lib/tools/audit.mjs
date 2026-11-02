import { assertPrototype, port, isRunning, pages } from '../prototype.mjs'

/**
 * Runs axe-core over every page and reports what it found.
 *
 * The audit logic is imported, not shelled out — bin/audit.mjs is modular and
 * calls process.exit nowhere, which is exactly why it was written that way.
 *
 * What this returns is deliberately not a score. The caveat travels with the
 * findings because an assistant relaying "0 errors" to a designer, with no
 * qualification, would be telling them something false: automated checks find
 * a minority of accessibility problems, and the single most common mistake in
 * a prototype — a placeholder standing in for a label — is one axe cannot
 * report, because it accepts the placeholder as the field's name.
 */
export const audit = {
  name: 'audit',
  description:
    'Check every page of the running prototype against WCAG 2.1 AA with ' +
    'axe-core, and return what it found. Results are a list of things to fix, ' +
    'never a pass: say so when relaying them.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async handler () {
    const { dir } = assertPrototype()

    const list = pages(dir)
    if (!list.length) {
      throw new Error('This prototype has no pages to check yet.')
    }

    const p = port(dir)
    if (!await isRunning(p)) {
      throw new Error(
        `The prototype is not running, and the pages have to be served to be ` +
        `checked. Call run_prototype first.`
      )
    }

    const { pagePaths, reachable, summarise, runPa11y, findBrowser, missingBrowser, explainFailure } =
      await import('defra-create-prototype/bin/audit.mjs')

    const base = `http://localhost:${p}`
    const paths = pagePaths(`${dir}/app/views`)
    const { ok, broken } = await reachable(base, paths)

    if (!ok.length) {
      throw new Error(
        `None of the ${paths.length} pages returned anything to check. ` +
        (broken[0] ? `${broken[0].path} ${broken[0].reason}.` : '')
      )
    }

    // runPa11y reports failure in its return value rather than by throwing,
    // so there is nothing to catch here — a try/catch would silently treat
    // every failure as a success with no findings, which is the worst
    // possible answer to give someone about accessibility.
    const { report, failed, stderr } = runPa11y(base, ok, { browser: findBrowser() })

    if (failed) {
      throw new Error(missingBrowser(stderr)
        ? 'The check needs a Chromium-based browser to open the pages in, and ' +
          'could not find one. Install Google Chrome, or Microsoft Edge if it ' +
          'is already on the machine. If one is somewhere unusual, set ' +
          'PUPPETEER_EXECUTABLE_PATH to it.'
        : `The check could not be run.\n\n${explainFailure(stderr)}`)
    }

    const summary = summarise(report.results)

    const lines = [
      `${ok.length} page${ok.length === 1 ? '' : 's'} checked · ` +
      `${summary.issues.length} thing${summary.issues.length === 1 ? '' : 's'} to fix · ` +
      `${summary.errors} error${summary.errors === 1 ? '' : 's'}, ` +
      `${summary.warnings} warning${summary.warnings === 1 ? '' : 's'} in total`,
      ''
    ]

    if (summary.issues.length) {
      for (const issue of summary.issues) {
        lines.push(`${issue.type.toUpperCase()}  ${issue.message}`)
        lines.push(`  ${issue.code} · ${issue.pages.length} of ${ok.length} pages`)
        for (const example of issue.examples) {
          lines.push(`  ${example.path}  ${example.selector}`)
        }
        if (issue.help) lines.push(`  how to fix: ${issue.help}`)
        lines.push('')
      }
    } else {
      lines.push('No automated issues in the pages checked.', '')
    }

    if (broken.length) {
      lines.push('NOT CHECKED — these returned no page, so they are absent from the counts:')
      for (const b of broken) lines.push(`  ${b.path} — ${b.reason}`)
      lines.push('')
    }

    lines.push(
      'WHAT THIS DOES NOT TELL YOU',
      'An automated check reads the markup, which is a minority of',
      'accessibility. It cannot tell you whether the page makes sense read',
      'aloud, whether the reading order matches the visual order, or whether',
      'the journey can be completed by keyboard. Those need a person.',
      '',
      'In particular, a field with a placeholder and no <label> raises nothing',
      'here — axe takes the placeholder as the field\'s name. It is not a',
      'label: it disappears as soon as someone types. Check by eye.',
      '',
      'So this is a list of things to fix, not a score. Do not report it as a',
      'pass, and do not tell the designer the prototype is accessible.'
    )

    return lines.join('\n')
  }
}
