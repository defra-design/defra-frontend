# CLAUDE.md

Context for working on `defra-frontend`. Read before changing anything.

## What this is

A theme layer over GOV.UK Frontend for Defra services. **Not a fork, not a
replacement.** `govuk-frontend` is a `peerDependency` and stays that way — a hard
dependency risks two copies in the tree and version skew, which is the exact
failure this architecture exists to prevent.

Verified against `govuk-frontend@6.4.0`.

## Non-obvious things that will cost you a day if you rediscover them

**1. You cannot override GOV.UK templates by search-path precedence.**
Every `macro.njk` in govuk-frontend does `{% include "./template.njk" %}` — a
*relative* include. Nunjucks resolves it inside `node_modules/govuk-frontend/dist`
regardless of search-path order. Shadowing `govuk/components/<x>/template.njk`
from our views directory **fails silently**: no error, it just renders upstream.

Deviations therefore live in the `defra` namespace with `defra*` macro names.
Never shadow a `govuk*` macro.

**2. `generic-header` already exists upstream and takes `logoText`/`logoHtml`.**
GDS added it for services outside the GOV.UK proposition, so it is the right
base for Defra — **do not build a Defra header component**. The footer is the
only genuine fork (Royal Arms + OGL assertion can't travel outside the
proposition).

Note the current header is a **text wordmark, which is a stopgap**. The
published Defra branding guidance requires the organisation logo, "included as
an SVG where possible", with the crest ignored by screen readers. That is a
`logoHtml` job — upstream already ships `with image logo` and `with text and
image logo` fixtures — and still needs no forked markup. Blocked only on
obtaining the official asset.

**3. The font override is one variable.**
`$govuk-include-default-font-face` derives from whether `"GDS Transport"` appears
in `$govuk-font-family`. Setting a system stack drops both `@font-face` blocks
automatically. Don't hand-manage the font-face flag.

## Brand modes — a licence boundary, not a preference

| Service on | Typeface | Header / footer |
|---|---|---|
| `*.service.gov.uk` | **must** use GDS Transport | GOV.UK header + footer |
| anything else | **must not** use GDS Transport | `govukGenericHeader` + `defraFooter` |

GDS Transport is licensed for `www.gov.uk`, `*.service.gov.uk`, `*.blog.gov.uk`
only. Default is `$defra-brand-mode: "defra"`.

## The two checks that are the point of the repo

```bash
npm run drift    # 692 upstream fixtures must render identical or be declared
npm run carbon   # page-type byte budgets, build fails on breach
```

`drift` fails on **undeclared** divergence. If a change is deliberate, register it
in `deviations.json` with a reason and approver. Never silence the check by
loosening the comparison.

`deviations.json` has three sections. `components` holds markup deviations and is
asserted mechanically by the drift check. `design` holds deviations from the
published Defra branding guidance (typeface, colour) — these cannot be caught by
comparing markup, so the drift report *prints* them instead. Printing is the
whole point: an unassertable deviation must still be visible to a reviewer.
`additions` holds components with no upstream equivalent — see below.

## Adding a component GOV.UK Frontend does not have

Every addition is permanent surface area with a review cost on each upstream
bump, against a house rule of preferring removal to addition. The bar is
therefore high, and the process is fixed:

1. **Check upstream first.** `ls node_modules/govuk-frontend/dist/govuk/components`.
   v6 absorbed `task-list`, `summary-list` cards, `pagination`, `password-input`,
   `service-navigation` and `exit-this-page` — all things departments once
   retrofitted. The `generic-header` note above is what happens when this step
   is skipped.
2. **Then check cross-government.** MoJ, HMRC and the GOV.UK publishing
   components have solved most of these, accessibility included. Follow their
   markup rather than re-deriving it; their edge cases were found in live
   services.
3. **Build in the `defra` namespace** with a `defra*` macro, `fixtures.json` and
   `macro-options.json`, so stories and prop tables generate themselves.
4. **Borrow upstream mixins, never restyle upstream classes.** Use
   `govuk-spacing`, `govuk-font`, `govuk-focused-text`, `govuk-functional-colour`.
   Component styles only ever ADD selectors — deleting the whole Defra block
   from `defra-frontend.scss` must not change how any upstream component renders.
5. **No-JS first.** The markup must work before JavaScript. `add-another`
   submits to the server, `sortable-table` headers are sort links, `filter` is a
   plain form. `timeout-dialog` is the sole exception and says so in its entry —
   which is why a service must never rely on it as the only session protection.
6. **Register it in `additions`** with the prior art, why upstream has no
   equivalent, and whether it has been proposed back. An unregistered component
   fails `npm run stories`.

Registered so far: DEF-101 timeline, DEF-102 card, DEF-103 add-another,
DEF-104 filter, DEF-105 sortable-table, DEF-106 timeout-dialog.

DEF-102 card is deliberately narrow — heading, optional description, optional
meta, and *either* a whole-card link *or* footer actions, never both, because a
stretched overlay would make the actions unreachable. The macro enforces it
rather than documenting it. A request for a new card option is a signal that the
layout wants a different component, not a bigger card.

Page types live in `src/defra/pages/<name>/template.njk`, one per carbon budget.
They are composition only — every element is an upstream macro or a registered
deviation. `carbon` renders and measures them, so the budgets check real markup;
a page type with no declared budget fails the build rather than passing silently.
Adding a page type means adding a budget. They are also the `Pages` section in
Storybook, which is where the system should be reviewed — component stories
cannot show whether the hierarchy holds on a real page.

Renovate raises `govuk-frontend` bumps as their own PR and never auto-merges.
The drift check on that PR *is* the design review.

## Carbon — say it carefully

SWDM v4 via CO2.js, GB grid intensity, green hosting assumed `false`.

Always publish alongside any number:
- directional figures for comparing design decisions, **not audited emissions data**
- SWDM v4 runs 40–67% below v3; never compare against a pre-v4 baseline
- green hosting is the most auditable lever and it sits with Core Delivery
  Platform, not with this repo

Do not assume green hosting `true` to flatter the numbers. Do not turn a score
into a badge.

**No grading, ever.** The check deliberately refuses to say whether a gCO2e
figure is good or bad, and must not be made to. The uncertainty in the method
cannot support a grade, and a grade travels out of context in a way a raw
number does not. Give context by comparison instead — the two defensible
comparisons are already in the output:

- **against the committed baseline** (`carbon-baseline.json`) — answers "did
  this change make it worse?", which the budget cannot, because a budget is a
  ceiling and says nothing until you hit it
- **against the alternative design decision** — the GOV.UK/Defra brand-mode row

The baseline is refreshed explicitly, never automatically:

```bash
npm run carbon -- --update-baseline
```

An auto-updating baseline always reports zero drift and is worth nothing.
Because the file is committed, a weight increase surfaces as a reviewable diff
in the PR that causes it. The delta **reports and does not fail** — budgets are
the gate; a deliberate increase should be explainable, not blocked.

Budgets live in `carbon-budgets.json` and are read by both the check and
Storybook. One source, two readers — never duplicate the numbers.

## Storybook code panels

Each story shows a **Show code** disclosure beneath it with the Nunjucks call
and the rendered HTML — the two things a developer actually copies. The Docs
tab's own "Show code" is transformed to show the same Nunjucks rather than
Storybook's JavaScript render function, which no service ever writes.

Both are derived: the Nunjucks is reconstructed from the `macro` and
`importPath` the generator records, and the HTML is the story's own output, so
neither can drift from what the component is.

It is not a tab beside Controls/Actions/Interactions, because that is a manager
addon and Storybook's manager UI is React. Same reason the carbon readout lives
in the preview iframe. If a panel tab is ever judged worth a React devDependency
in `apps/storybook` (it would not ship), that is the change to make — it does
not affect the package.

## Carbon readout

The Storybook readout follows the same rule. It is a full-width footer bar —
Storybook is a desktop tool, so spanning the viewport removes the wrapping
problem rather than managing it, and the bar expands upward when opened:

```
🌳 ≈ 3.05 mg CO2e  first uncached load · body 864 B · 35% of html budget · + 26.3 KB shared        ▸ method
```

The carbon figure leads — it is a carbon readout, and hiding the carbon would
be a strange thing for one to do. It is stated as **the whole first uncached
load**, the only quantity here that means anything physically, never as a
per-story score. What follows is what the story actually changes: its own body
weight, its share of the page budget where one exists, and the shared
stylesheet and bundle labelled as shared.

Showing them together matters. The combined figure is ~95% shared stylesheet,
so a button (2.96 mg) and a whole page (3.05 mg) differ by about 7% — quoted
alone it would look like a per-story score while mostly measuring something the
story does not affect. Sitting `body 98 B` next to `+ 26.3 KB shared` makes the
reason legible instead of requiring a footnote. Keep the breakdown beside the
figure, and do not colour-code anything against a threshold.

## Defra tech constraints (not negotiable)

Node.js with Hapi. GOV.UK Frontend Nunjucks templates. Vanilla JavaScript.
**No React, no Vue.** Storybook must therefore be `@storybook/html-vite`.

Code in the open in a Defra GitHub org, Defra README standards, SonarQube,
Dependabot/Renovate.

## Build order

1. ~~settings layer + `defra` namespace + footer~~ done
2. ~~drift check + deviation registry~~ done
3. ~~carbon budgets~~ done
4. ~~Storybook (`apps/storybook`) + carbon readout~~ done — badge lives in the
   preview iframe (vanilla JS), not a manager addon (manager UI is React)
5. Prototype kit plugin — the adoption lever, designers won't read docs
6. Eleventy docs site via `govuk-eleventy-plugin`, reading the same fixtures

## Maps — use `@defra/interactive-map`, do not depend on it

https://github.com/DEFRA/interactive-map — MIT, public, accessibility-first,
Nunjucks + SCSS, provider-based so the map engine is a separate entry point.
It is the right map component for Defra and this repo should never build one.

**But it must not become a dependency of `@defra/frontend`, today.** It declares
`govuk-frontend: ^5.13.0` as a *direct* dependency, not a peer. We are on 6.4.0
as a peer. Installing it puts two copies of govuk-frontend in the tree — the
precise failure the first paragraph of this file says the architecture exists to
prevent. The drift check would still read the root v6 and pass, while a built
page shipped both. A check that passes while the thing it guards against is
happening is worse than no check.

Also weigh, if it is ever adopted:
- `preact` is a direct dependency, against "vanilla JavaScript, no React, no Vue".
  Consumers never write it, but it is in the bundle.
- `maplibre-gl` is a direct dependency. A map page cannot live inside the 12 KB
  JS budget and should not pretend to: give it its own `map-page` budget set from
  a real measurement, rather than loosening the existing ones.
- Published as `0.0.1-alpha` / `0.0.37-alpha`. Alpha.

Until then: services that need a map install it themselves alongside this
package. The unblocking action is upstream — ask them to move `govuk-frontend`
to a peerDependency supporting v6, which also fixes it for every other consumer.

## Open decisions — ask, don't guess

- **`@use` migration.** Sass emits ~172 `@import` deprecation warnings. v6 ships
  both modern and `.import.scss` files. Cheap now, breaking for every consumer
  later. Not yet decided.
- **Org.** Currently `defra-design` (prototype org). If this becomes a production
  dependency it arguably belongs in `DEFRA` alongside `design-standards`. GitHub
  preserves redirects on transfer.
- **Governance.** No Defra design authority has approved this yet. README says so.
  Don't remove that line until it's untrue. Note this is narrower than it was:
  published Defra branding guidance now exists (see Brand cues), so the question
  is approval of *this library*, not the absence of any standard.
- **Typeface — decided, registered as DEF-002.** The branding guidance requires
  "Helvetica or Arial CSS font stacks"; this repo ships a `system-ui` stack.
  Both drop New Transport and both cost zero font bytes, so licence and carbon
  are unaffected — but Helvetica and Arial ship two weights, which would
  collapse the weight scale that carries the hierarchy. Declared in
  `deviations.json` under `design`, pending the design authority. **Do not
  silently "fix" the stack to match the guidance** — changing it means
  rebuilding the hierarchy on size, space and colour, which is a design job,
  not a find-and-replace.
- **Brand cues.** Partly resolved. Defra publishes branding guidance in its
  Digital Service Manual — https://digital.defra.gov.uk/design/branding,
  maintained by the AI Capability and Enablement team. It corroborates the
  brand-mode split (off-GOV.UK services **must not** use the GOV.UK header,
  Crown logo or footer; **must not** use New Transport) and gives one hard
  value: **Defra green `#00a33b`**, to be used "sparingly, for example in
  headers or navigation borders".

  `#00a33b` is **3.33:1 on white — it fails WCAG AA for body text** and must
  never be a link, label or body colour. It passes for large text and non-text
  UI, and carries black text at 5.88:1. It is therefore used in exactly one
  place: the keyline under the header. The interactive greens stay on v6's own
  palette ramp, which is both AA-compliant and what the guidance means by
  "consistent with the GOV.UK frontend palette". The GOV.UK crown header is
  pinned back to GOV.UK blue, because functional `brand` drives both and the
  crown's colour is not ours to re-point.

  Still unowned: no audit across the wider estates (Environment Agency, Natural
  England, RPA, APHA), and the guidance says "agency equivalent" without
  defining them.

## House style

Swiss/minimal. 8px grid. Leading-trim typography. Prefer removing a component
over adding an option to it.

**Weight carries the hierarchy.** With a restrained palette and no imagery,
weight does the work colour and illustration do elsewhere. Three tiers, Defra
mode only:

| Weight | Used for |
|---:|---|
| 400 | body copy, hints, checkbox/radio option labels |
| 500 | button labels |
| 600 | the header wordmark |
| 700 | form prompts, table headers, summary-list keys (upstream bold) |
| 800 | headings, incl. label/legend size modifiers, panel and error-summary titles |

Chrome stops below the heading tier on purpose: the wordmark should not
out-rank the page `h1`.

**500 is not portable.** SF Pro and Roboto ship a real 500; Segoe UI goes
Regular 400 → Semibold 600, so CSS weight matching rounds 500 down to 400 and
the lift vanishes on Windows. 600 is the only step above regular that renders
everywhere. If Windows becomes the primary target, move
`$defra-font-weight-button` to 600.

Upstream stops at 400/700 because GDS Transport ships only two faces — the
system stacks carry more, so Defra mode gets a third tier for free. Reach for
a weight step before a size step. Weights above 700 vary by platform; the step
is 100 so a fallback to 700 degrades to upstream's appearance.
