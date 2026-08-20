# defra-frontend — verified findings and build spec

Everything below was executed against `govuk-frontend@6.4.0`, not assumed.

## 1. The fixture-driven sync works

| Check | Result |
|---|---|
| Components shipping `fixtures.json` in v6 dist | 37 |
| Fixtures rendered through Nunjucks | 692 |
| Byte-identical to upstream reference HTML | 692 / 692 |
| Storybook stories generated, zero hand-written | 271 |

`fixtures.json` gives `{ name, options, html, hidden, description }` per example.
`macro-options.json` gives the full prop table. Together they mean:

- stories generate themselves; a new upstream component appears wearing Defra tokens with no work
- prop tables never go stale
- a Renovate bump runs the drift check and tells you exactly which fixtures changed

**This is the "connection to GDS" made mechanical.** Adopt it.

## 2. Correction to the plan: you don't need to build a header

v6 ships **`generic-header`**, and its primary option is `logoText`. It was added
for services outside the GOV.UK proposition — exactly Defra's non-`service.gov.uk`
estate. Given Defra has no logo mark, a text wordmark header is a token-only
restyle with **zero forked markup**.

Revised: the only genuine fork is the **footer** (Royal Arms + OGL assertion
cannot be used outside the proposition). One component, not two.

## 3. Correction to the architecture: search-path precedence does NOT work

Each `macro.njk` does `{% include "./template.njk" %}` — a **relative** include.
Nunjucks resolves it inside `node_modules/govuk-frontend/dist` regardless of
search-path order. Shadowing `govuk/components/<x>/template.njk` from your own
views directory silently does nothing.

**Use a separate namespace instead.** `defra/components/footer/macro.njk`
exporting `defraFooter`. Deviations become explicit at the call site rather than
invisible template magic — better for assessment, better for review, and it means
the drift check can assert that *no* `govuk*` macro has been tampered with.

## 4. Typography override — one variable

```scss
$govuk-font-family: system-ui, -apple-system, "Segoe UI", Roboto, arial, sans-serif;
```

`$govuk-include-default-font-face` derives from whether `"GDS Transport"` appears
in the family, so this single line drops both `@font-face` blocks automatically.
Verified: 2 → 0.

## 5. Measured carbon impact

First uncached question page, gzipped, SWDM v4 via CO2.js, GB grid, green hosting `false`:

| Brand mode | CSS | Fonts | Total | gCO2e |
|---|---:|---:|---:|---:|
| GOV.UK (Transport) | 15,669 | 64,862 | 89,531 | 0.0098 |
| Defra (system fonts) | 15,548 | 0 | 24,548 | 0.0027 |

**72.6% reduction**, from one variable. Footer fork saves a further 3,039 bytes
of HTML per page (3,411 → 372).

Caveats to publish alongside any number:
- SWDM v4 runs 40–67% below v3; never compare across the methodology change
- directional figures for comparing design decisions, **not audited emissions data**
- green hosting is the most auditable lever and it sits with Core Delivery Platform, not with the DS

## 6. Build order

1. `defra-frontend` package — settings layer + `defra/` namespace + footer. `govuk-frontend` as **peerDependency**, never a hard dep.
2. `scripts/drift.mjs` + `deviations.json` — wire into CI. Unregistered divergence fails the build.
3. `scripts/generate-stories.mjs` — Storybook `@storybook/html-vite` (Defra forbids React/Vue).
4. `scripts/carbon.mjs` — per-page-type budgets in CI; Storybook toolbar addon showing per-story weight.
5. Prototype kit plugin — the adoption lever.
6. Eleventy docs site via `govuk-eleventy-plugin`, reading the same fixtures.

## 7. Open, needs your call

- Sass emits ~172 deprecation warnings on `@import`. v6 ships `.import.scss` and modern module files side by side — decide now whether to go `@use`-only, because migrating later is a breaking change for every consumer.
- Is this Defra-sanctioned or a designer-led pilot? Changes the governance chapter entirely.
- Are the brand cues across the estates consistent enough to tokenise, or is step 1 really a brand consolidation job?
