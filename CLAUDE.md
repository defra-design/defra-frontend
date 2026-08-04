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

**2. `generic-header` already exists upstream and takes `logoText`.**
GDS added it for services outside the GOV.UK proposition. Defra has no logo mark,
so a text wordmark header is a **token-only restyle with zero forked markup**.
Do not build a Defra header component. The footer is the only genuine fork
(Royal Arms + OGL assertion can't travel outside the proposition).

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

## Defra tech constraints (not negotiable)

Node.js with Hapi. GOV.UK Frontend Nunjucks templates. Vanilla JavaScript.
**No React, no Vue.** Storybook must therefore be `@storybook/html-vite`.

Code in the open in a Defra GitHub org, Defra README standards, SonarQube,
Dependabot/Renovate.

## Build order

1. ~~settings layer + `defra` namespace + footer~~ done
2. ~~drift check + deviation registry~~ done
3. ~~carbon budgets~~ done
4. Storybook (`apps/storybook`, currently empty) + carbon toolbar addon
5. Prototype kit plugin — the adoption lever, designers won't read docs
6. Eleventy docs site via `govuk-eleventy-plugin`, reading the same fixtures

## Open decisions — ask, don't guess

- **`@use` migration.** Sass emits ~172 `@import` deprecation warnings. v6 ships
  both modern and `.import.scss` files. Cheap now, breaking for every consumer
  later. Not yet decided.
- **Org.** Currently `defra-design` (prototype org). If this becomes a production
  dependency it arguably belongs in `DEFRA` alongside `design-standards`. GitHub
  preserves redirects on transfer.
- **Governance.** No Defra design authority has approved this yet. README says so.
  Don't remove that line until it's untrue.
- **Brand cues.** No audit has been done across the Defra estates. Tokens in
  `defra-frontend.scss` are placeholders derived from GOV.UK defaults, not from
  Defra brand research. Treat colour values as unowned until that audit happens.

## House style

Swiss/minimal. 8px grid. Leading-trim typography. Prefer removing a component
over adding an option to it.
