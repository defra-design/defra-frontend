import { catalogue, components, NEVER_SHADOW, BRAND_RULE } from '../catalogue.mjs'

/**
 * Deliberately returns one line per component and no parameters. The full
 * catalogue is ~220KB; returning it would fill the context window with
 * parameter tables for 50 components to answer "what is there?". Detail is
 * component_help's job, one component at a time.
 */
export const listComponents = {
  name: 'list_components',
  description:
    'List every component available in a Defra prototype — the GOV.UK ' +
    'Frontend set plus the Defra additions and overrides. Call this before ' +
    'writing any page markup, so the page is composed from components that ' +
    'exist rather than invented ones.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        enum: ['govuk', 'defra', 'all'],
        description: 'Which set to list. Defaults to all.'
      }
    },
    additionalProperties: false
  },
  handler ({ namespace = 'all' } = {}) {
    const wanted = namespace === 'all'
      ? components
      : components.filter((c) => c.namespace === namespace)

    const note = (c) => {
      if (c.status === 'superseded') return `DO NOT USE — superseded by ${c.supersededBy}`
      if (c.status === 'override') return `replaces ${c.replaces}`
      if (c.status === 'addition') return 'Defra addition, no GOV.UK equivalent'
      // Not a Defra macro at all: upstream markup in a Defra configuration.
      // Saying so here stops an assistant inventing a defra* name for it.
      if (c.status === 'configuration') return `upstream ${c.macro}, configured for Defra — there is no defra${c.name[0].toUpperCase()}${c.name.slice(1)} macro`
      if (c.defraConfiguration) return `Defra services configure this — see the "${c.defraConfiguration}" entry`
      return ''
    }
    const line = (c) => {
      const n = note(c)
      return `  ${c.macro.padEnd(28)}${c.name}${n ? '  ' + n : ''}`
    }

    const defra = wanted.filter((c) => c.namespace === 'defra')
    const govuk = wanted.filter((c) => c.namespace === 'govuk')

    const sections = []
    if (defra.length) {
      sections.push(`Defra components (${defra.length})\n${defra.map(line).join('\n')}`)
    }
    if (govuk.length) {
      sections.push(`GOV.UK Frontend components (${govuk.length})\n${govuk.map(line).join('\n')}`)
    }

    return [
      `govuk-frontend ${catalogue.govukFrontend}, defra-frontend ${catalogue.defraFrontend}`,
      '',
      sections.join('\n\n'),
      '',
      'Call component_help with a macro name for its parameters and a working example.',
      '',
      'RULES',
      `- ${NEVER_SHADOW}`,
      `- ${BRAND_RULE}`
    ].join('\n')
  }
}
