import { catalogue } from '../catalogue.mjs'

/**
 * What a page in a prototype has to look like, which is mostly about the two
 * things that are invisible when wrong: the layout it extends, and where the
 * file sits.
 *
 * The kit maps app/views to routes by path, so a file in the wrong place
 * produces a 404 rather than an error, and a page that does not extend the
 * layout renders without the header and footer — looking like a styling
 * problem rather than a missing line.
 */
export const listPageTypes = {
  name: 'list_page_types',
  description:
    'The page types a Defra prototype ships, how a page file maps to a URL, ' +
    'and the layout every page must extend. Call this before creating a page ' +
    'by hand.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler () {
    return [
      `Page types (${catalogue.pageTypes.length}):`,
      ...catalogue.pageTypes.map((p) => `  ${p}`),
      '',
      'Use create_page to make one — it writes the correct extends and the',
      'right file location. Only write a page by hand if no type fits.',
      '',
      'HOW A FILE BECOMES A URL',
      '  app/views/index.html                 ->  /',
      '  app/views/apply/name.html            ->  /apply/name',
      '  app/views/apply/index.html           ->  /apply',
      '',
      'EVERY PAGE MUST START WITH',
      '  {% extends "layouts/main.html" %}',
      '',
      'That path is resolved from the views root, not relative to the file, so',
      'it is the same line in every page however deeply nested. A page without',
      'it renders with no header or footer, which reads as a CSS problem and',
      'is not one.',
      '',
      'Set {% set pageName="..." %} too — it becomes the browser tab title.'
    ].join('\n')
  }
}
