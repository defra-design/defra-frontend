import { find, NEVER_SHADOW } from '../catalogue.mjs'

/**
 * Renders the macro's parameters and a known-good example.
 *
 * The example is a fixture, not something written here — the same fixtures the
 * drift check renders against upstream. So an example shown to a designer is
 * one this repo has already proved produces the right markup.
 */
const indent = (params, depth = 0) => params.flatMap((p) => {
  const pad = '  '.repeat(depth + 1)
  const req = p.required ? ' (required)' : ''
  const head = `${pad}${p.name}: ${p.type}${req}`
  const desc = p.description ? `\n${pad}  ${p.description}` : ''
  return [head + desc, ...(p.params ? indent(p.params, depth + 1) : [])]
})

export const componentHelp = {
  name: 'component_help',
  description:
    'Get the macro name, import path, parameters and a working example for ' +
    'one component. Call this before writing a macro call, rather than ' +
    'guessing parameter names — GOV.UK macros fail quietly when given ' +
    'parameters they do not recognise, so a wrong name renders a component ' +
    'with the option silently missing.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Macro name such as govukInput, or a component name such as input.'
      }
    },
    required: ['name'],
    additionalProperties: false
  },
  handler ({ name }) {
    const c = find(name)
    if (!c) {
      return `No component called "${name}". Call list_components to see what exists.`
    }

    const example = c.example
      ? [
          `Example — the "${c.example.name}" fixture:`,
          '',
          `  {% from "${c.import}" import ${c.macro} %}`,
          `  {{ ${c.macro}(${JSON.stringify(c.example.options, null, 2)
            .split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n')}) }}`
        ].join('\n')
      : 'No fixture ships for this component.'

    const warning = c.status === 'superseded'
      ? `\nDO NOT USE THIS. ${c.macro} is superseded by ${c.supersededBy}.\n` +
        `Reason: ${c.why ?? 'registered as a Defra deviation.'}\n`
      : c.status === 'override'
        ? `\nThis replaces ${c.replaces}. Reason: ${c.why ?? 'registered deviation.'}\n`
        : c.status === 'configuration'
          // The whole point of this status: there is no defra macro to import.
          ? `\nThere is NO defra macro for this. It is upstream ${c.macro} in a\n` +
            `Defra configuration — the markup is 100% govuk-frontend. Import the\n` +
            `upstream macro below and pass the options shown in the example.\n` +
            (c.why ? `Reason: ${c.why}\n` : '')
          : c.defraConfiguration
            ? `\nDefra services configure this component directly — see the\n` +
              `"${c.defraConfiguration}" entry for the sanctioned options.\n`
            : ''

    return [
      `${c.macro} — ${c.namespace}/${c.name} (${c.status})`,
      warning,
      `Import:  {% from "${c.import}" import ${c.macro} %}`,
      '',
      c.params.length ? `Parameters:\n${indent(c.params).join('\n')}` : 'Takes no parameters.',
      '',
      example,
      '',
      NEVER_SHADOW
    ].filter((s) => s !== '').join('\n')
  }
}
