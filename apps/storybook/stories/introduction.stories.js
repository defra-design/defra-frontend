// The landing page. Storybook opens on the first entry in the sidebar, which
// was previously Accordion — a component with no context around it.
//
// Deliberately built FROM the design system: govuk typography and layout
// classes, and defraCard for the section guide. If the tokens break, this page
// breaks with them, so it can never drift into being a pretty lie about what
// the library looks like.
//
// Copy follows the GOV.UK style: plain, measured, no slogans. Resist the pull
// towards punchy fragments — this is documentation for colleagues, not a
// product page.
import { renderDefra } from '../../../packages/defra-frontend/lib/render.mjs'

const card = (params) => renderDefra('card', params)

const SECTIONS = [
  {
    title: 'Pages',
    text: 'Whole-page compositions: a start page, a question page and a check answers page. These are the easiest place to judge the system as a whole, and they are what the carbon budgets measure.'
  },
  {
    title: 'Defra',
    text: 'The service chrome: the header and the footer. The header is the upstream govukGenericHeader configured for Defra rather than a fork of it. The footer is the one genuine fork, registered as DEF-001.'
  },
  {
    title: 'Defra additions',
    text: 'Components that GOV.UK Frontend does not provide: timeline, card, add another, filter, sortable table and timeout dialog. Each one follows existing cross-government work and is registered with the reasoning behind it.'
  },
  {
    title: 'GOV.UK (Defra themed)',
    text: 'All 37 upstream components, restyled through tokens alone. The markup is unchanged from upstream, and the drift check confirms this on every commit.'
  },
  {
    title: 'Companion packages',
    text: 'Shown here for reference rather than shipped as part of this library. Services that need them install them separately.'
  }
]

export default {
  title: 'Introduction',
  // No autodocs page for a page that is already documentation.
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true }
  },
  render: () => {
    const el = document.createElement('div')
    el.className = 'govuk-width-container'
    el.style.cssText = 'padding: 2rem 1rem 4rem; max-width: 50rem'
    el.innerHTML = `
      <span class="govuk-tag govuk-tag--red">Work in progress</span>

      <h1 class="govuk-heading-xl govuk-!-margin-top-4">Defra Frontend</h1>

      <p class="govuk-body-l">
        A theme layer over GOV.UK Frontend for Defra services. It does not fork
        GOV.UK Frontend and it does not replace it.
      </p>

      <div class="govuk-inset-text">
        This is an unapproved prototype. The colour and typeface values are
        placeholders rather than the result of a brand audit, and the library is not
        yet approved for use in a live service.
      </div>

      <h2 class="govuk-heading-m">What this is</h2>
      <p class="govuk-body">
        <code>govuk-frontend</code> remains a peer dependency. Everything specific to
        Defra is a token override in the settings layer, so upstream components keep
        their own markup and their own accessibility work. Two checks run on every
        commit:
      </p>
      <ul class="govuk-list govuk-list--bullet">
        <li><strong>Drift</strong> — the 692 upstream fixtures must render identically to GOV.UK Frontend. Anything that diverges has to be declared, with a reason and an approver.</li>
        <li><strong>Carbon</strong> — each page type has a byte budget, measured from the pages as they actually render. The build fails if a budget is exceeded.</li>
      </ul>

      <h2 class="govuk-heading-m">Brand modes</h2>
      <p class="govuk-body">
        This is a licence boundary rather than a preference. Services on
        <code>*.service.gov.uk</code> use GDS Transport with the GOV.UK header and
        footer. Services elsewhere do not, and instead use a system font stack with
        Defra chrome. Defra's published branding guidance takes the same position.
      </p>
      <p class="govuk-body">
        The typeface is settled by that licence, but it is also the single largest
        carbon saving in the system. GDS Transport is two WOFF2 files, around 63 KB
        on a first uncached load, and a system font stack removes them rather than
        making them smaller: the fonts are already on the device. On a question page
        that is a reduction of about two thirds of the estimated emissions, which is
        more than every other decision here put together. It is worth being plain
        that this is a consequence of the licence rather than a design choice made
        for its own sake — but it is a welcome one, and it is why the fonts budget
        for every page type is zero rather than merely small.
      </p>

      <h2 class="govuk-heading-m">Where things are</h2>
      <div id="defra-intro-sections"></div>

      <h2 class="govuk-heading-m">Reading a story</h2>
      <p class="govuk-body">
        Each story has a <strong>Show code</strong> section beneath it containing the
        Nunjucks call and the rendered HTML. The bar along the bottom gives the page
        weight and an estimated carbon figure for the first uncached load. It is not a
        score and nothing here is graded; open <strong>method</strong> in that bar for
        what the figure does and does not cover.
      </p>

      <p class="govuk-body">
        <a class="govuk-link" href="https://github.com/defra-design/defra-frontend">Source on GitHub</a> ·
        <a class="govuk-link" href="https://design-system.service.gov.uk/">GOV.UK Design System</a> ·
        <a class="govuk-link" href="https://digital.defra.gov.uk/design/branding">Defra branding guidance</a>
      </p>
    `
    el.querySelector('#defra-intro-sections').innerHTML =
      SECTIONS.map((s) => card({ title: s.title, text: s.text, headingLevel: 3 })).join('')
    return el
  }
}

export const StartHere = { name: 'Start here' }
