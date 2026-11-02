import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { assertPrototype, viewsDir, urlFor } from '../prototype.mjs'
import { catalogue } from '../catalogue.mjs'

/**
 * Writes a page from a shipped template.
 *
 * Templates are read from the prototype's own node_modules rather than copied
 * into this package, so a page created here is the same page the kit's "Create
 * a new page" menu produces, at the design system version that prototype is
 * actually pinned to. A bundled copy would drift and nothing would say so.
 *
 * The two things this gets right that a hand-written page usually gets wrong
 * are both invisible when wrong: the layout line, and where the file sits.
 */
const TEMPLATES = 'node_modules/defra-frontend/src/defra/prototype-kit/templates'

const clean = (value) => String(value ?? '').trim()
  .replace(/^\/+|\/+$/g, '')
  .replace(/\.html$/, '')

export const createPage = {
  name: 'create_page',
  description:
    'Create a page in the prototype from a Defra page template, at the right ' +
    'path and extending the right layout. Prefer this over writing a page ' +
    'file directly: a page that does not extend layouts/main.html renders ' +
    'with no header or footer, which looks like a styling problem and is not.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Where it lives, without .html — "apply/name" serves at /apply/name. ' +
          'Use "index" for the start of the service.'
      },
      type: {
        type: 'string',
        description: `One of: ${['start-page', 'question-page', 'check-answers'].join(', ')}.`
      },
      heading: {
        type: 'string',
        description: 'Optional. The page heading and browser tab title.'
      }
    },
    required: ['path', 'type'],
    additionalProperties: false
  },
  handler ({ path, type, heading }) {
    const { dir } = assertPrototype()

    const target = clean(path)
    if (!target || target.includes('..')) {
      throw new Error(`"${path}" is not a usable page path.`)
    }

    const kind = clean(type)
    if (!catalogue.pageTypes.includes(kind)) {
      throw new Error(
        `No page type called "${type}". Available: ${catalogue.pageTypes.join(', ')}.`
      )
    }

    const source = join(dir, TEMPLATES, `${kind}.html`)
    if (!existsSync(source)) {
      throw new Error(
        `This prototype has no ${kind} template at ${TEMPLATES}. It may ` +
        'predate the templates — run `npx defra-create-prototype --update` ' +
        'in a terminal from the prototype folder.'
      )
    }

    const file = join(viewsDir(dir), `${target}.html`)
    if (existsSync(file)) {
      // Refuse rather than overwrite. An assistant retrying a call must not be
      // able to erase a page a designer has been working on.
      throw new Error(
        `app/views/${target}.html already exists. Nothing has been changed — ` +
        'edit it directly, or choose another path.'
      )
    }

    let content = readFileSync(source, 'utf8')
    if (heading) {
      const text = clean(heading) || heading
      content = content
        .replace(/Service name|Question heading/g, text)
        .replace(/\{% block content %\}/, `{% set pageName="${text}" %}\n\n{% block content %}`)
    }

    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)

    return [
      `Created app/views/${target}.html from the ${kind} template.`,
      `It serves at ${urlFor(target + '.html')}`,
      '',
      'The template carries placeholder content — replace it with the real',
      'question, hint and options. Check it renders before moving on: a',
      'Nunjucks mistake shows as a 500 page, not as a build error.'
    ].join('\n')
  }
}
