# defra-frontend

Defra Frontend contains the code you need to build a user interface for Defra
services. It is a **theme layer over [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend)**,
not a replacement for it.

Two things make it different from other departmental frontends:

1. **It does not fork GOV.UK components.** GOV.UK Frontend is a peer dependency.
   Every GOV.UK component is restyled through the settings layer and renders
   byte-identical markup. CI proves this on every commit against the 692 fixtures
   that GOV.UK Frontend publishes.
2. **Payload is a budget, not an aspiration.** Page-type byte budgets are enforced
   in CI. A breach fails the build.

## Status

Alpha. Nothing here is stable. Not yet approved by a Defra design authority —
see `docs/spec.md` for open governance questions.

## Requirements

Node.js 22 (see `.nvmrc`).

## Quick start

```bash
npm ci
npm run check      # build, drift check, carbon budgets
npm run stories    # generate Storybook stories from upstream fixtures
```

## Which brand mode do I need?

This is a licence boundary, not a style preference.

| Your service is on | Typeface | Header / footer |
|---|---|---|
| `*.service.gov.uk` | **must** use GDS Transport | GOV.UK header and footer |
| anything else | **must not** use GDS Transport | `govukGenericHeader` + `defraFooter` |

GDS Transport is licensed for `www.gov.uk`, `*.service.gov.uk` and `*.blog.gov.uk`
only. Defra Frontend defaults to `$defra-brand-mode: "defra"` — system fonts, no
webfont download. Set it to `"govuk"` if your service is on `service.gov.uk`.

## Carbon

Estimates use the Sustainable Web Design Model v4 via CO2.js, GB grid intensity,
green hosting assumed `false`.

These are **directional figures for comparing design decisions, not audited
emissions data.** SWDM v4 runs 40–67% below v3, so never compare a number here
against a pre-v4 baseline. The most auditable carbon decision available is
verified green hosting, and that sits with Core Delivery Platform rather than
with this repo.

Measured, first uncached question page, gzipped:

| Brand mode | CSS | Fonts | Total | gCO2e |
|---|---:|---:|---:|---:|
| GOV.UK | 15,669 | 64,862 | 89,531 | 0.0098 |
| Defra | 15,548 | 0 | 24,548 | 0.0027 |

## Deviating from GOV.UK Frontend

Don't, unless you must. If you must:

1. Build it in the `defra` namespace with a `defra*` macro name. Never shadow a
   `govuk*` macro — `macro.njk` uses a relative include, so shadowing fails
   silently rather than erroring.
2. Register it in `deviations.json` with a reason and an approver.
3. CI fails on undeclared divergence.

## Contributing

Check the [GOV.UK Design System](https://design-system.service.gov.uk/) first.
Then check whether another department has already solved it. A component only
belongs here if it is genuinely Defra-specific and genuinely reusable.

## Licence

Code is MIT. Documentation is © Crown copyright, available under the Open
Government Licence v3.
