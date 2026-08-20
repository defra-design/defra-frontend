# defra-frontend

Defra Frontend contains the code you need to build a user interface for Defra
services. It is a **theme layer over [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend)**,
not a replacement for it.

> **Work in progress — not for use in a live service.**
> Colour and typeface values are placeholders rather than the result of a brand
> audit, and no Defra design authority has approved this library. See
> [Status](#status).

## Documentation

| | |
|---|---|
| **[Components](https://defra-design.github.io/defra-frontend/)** | Storybook. Every component with live examples, the Nunjucks and HTML for each, and prop tables generated from the source. |
| **[Guidance and governance](https://defra-design.github.io/defra-frontend/docs/)** | Why things are the way they are: brand modes, the deviation register, carbon budgets. |
| **[Make a prototype](https://defra-design.github.io/defra-frontend/docs/prototyping/)** | Step by step, written for designers. Assumes no terminal experience. |
| **[CLAUDE.md](CLAUDE.md)** | Working on this repo: the decisions, the traps, and the rules for adding a component. |

## Which part do I need?

| I want to… | Go to |
|---|---|
| Build a prototype to test with users | [Making a prototype](#making-a-prototype) |
| Use these components in a real service | [Using it in a service](#using-it-in-a-service) |
| Browse what exists | [Storybook](https://defra-design.github.io/defra-frontend/) |
| Change or add a component | [Working on this repo](#working-on-this-repo) |

## What makes it different

1. **It does not fork GOV.UK components.** GOV.UK Frontend is a peer dependency.
   Every GOV.UK component is restyled through the settings layer and renders
   byte-identical markup. CI proves this on every commit against the 692 fixtures
   GOV.UK Frontend publishes.
2. **Payload is a budget, not an aspiration.** Page-type byte budgets are measured
   from real rendered pages and enforced in CI. A breach fails the build.

Eleven components have no GOV.UK Frontend equivalent. Each one is registered in
[`deviations.json`](deviations.json) with the cross-government prior art it
follows and whether it has been proposed back — see the
[deviation register](https://defra-design.github.io/defra-frontend/docs/deviations/).

## Making a prototype

```bash
npx github:defra-design/defra-frontend my-service
cd my-service
npm start
```

This runs the real GOV.UK Prototype Kit, then adds Defra styling, Defra page
templates and the Defra layout. The
[step-by-step guide](https://defra-design.github.io/defra-frontend/docs/prototyping/)
covers installing Node, using a terminal, and putting your prototype on GitHub.

Not published to npm yet, so the command above installs from this repository. It
will switch to npm without the instructions changing.

## Using it in a service

Defra services run Node.js with Hapi and GOV.UK Frontend Nunjucks templates.

```bash
npm install @defra/frontend govuk-frontend
```

**Styles.** Import the whole layer, which brings GOV.UK Frontend with it:

```scss
@import "@defra/frontend/src/defra-frontend";
```

Override tokens before that import — `$defra-brand-mode`, `$defra-font-stack`
and the weight scale all use `!default`. If your build imports GOV.UK Frontend
itself, use the two halves instead: `src/settings` before it, `src/post` after.

**Templates.** Add the package to your Nunjucks search path, then import macros
the same way as GOV.UK ones:

```njk
{% from "defra/components/timeline/macro.njk" import defraTimeline %}
{{ defraTimeline({ items: [ ... ] }) }}
```

**JavaScript.** Four components enhance markup that already works without it:

```js
import { initAll } from '@defra/frontend/javascript'
initAll()
```

`timeout-dialog` is the one exception — it does nothing without JavaScript, so
never rely on it as your only session protection.

## Which brand mode do I need?

This is a licence boundary, not a style preference.

| Your service is on | Typeface | Header / footer |
|---|---|---|
| `*.service.gov.uk` | **must** use GDS Transport | GOV.UK header and footer |
| anything else | **must not** use GDS Transport | `govukGenericHeader` + `defraFooter` |

GDS Transport is licensed for `www.gov.uk`, `*.service.gov.uk` and `*.blog.gov.uk`
only. Defra Frontend defaults to `$defra-brand-mode: "defra"` — system fonts, no
webfont download. Set it to `"govuk"` if your service is on `service.gov.uk`.

The published
[Defra branding guidance](https://digital.defra.gov.uk/design/branding) takes the
same position.

## Working on this repo

```bash
npm ci
npm run check        # boundary, drift and carbon — everything CI runs
npm run storybook    # build the stylesheet and open Storybook on :6006
```

| Script | What it does | What a failure means |
|---|---|---|
| `npm run drift` | Renders all 692 upstream fixtures and compares them to GOV.UK Frontend | A GOV.UK component's markup changed and the divergence is not declared |
| `npm run carbon` | Renders each page type and measures it against its budget | A page type went over budget, or a page type has no budget declared |
| `npm run boundary` | Checks companion packages have not become dependencies of the published package | Something that should be demonstration-only is about to ship |
| `npm run stories` | Regenerates Storybook stories from fixtures | A component is not registered in `deviations.json` |
| `npm run build` | Compiles the stylesheet | — |

Storybook stories are generated, not written. Change a component's
`fixtures.json` and run `npm run stories`.

### Layout

```
packages/defra-frontend    the published package — tokens, components, page types
packages/create-prototype  npx tool that creates a Defra prototype
apps/storybook             component library (published at the root URL)
apps/docs                  guidance site (published at /docs/)
deviations.json            every deviation and addition, with its reasoning
carbon-budgets.json        byte budgets, read by the check and by Storybook
carbon-baseline.json       committed measurements, so weight changes show as a diff
```

## Adding a component

Check [GOV.UK Frontend](https://design-system.service.gov.uk/) first — v6
absorbed several components departments used to retrofit. Then check whether MoJ,
HMRC or the GOV.UK publishing components have already solved it, and follow their
markup rather than re-deriving the accessibility.

If it genuinely has no equivalent, the full process is in
[CLAUDE.md](CLAUDE.md#adding-a-component-govuk-frontend-does-not-have). In short:
build it in the `defra` namespace with a `defra*` macro, make it work without
JavaScript, and register it in `deviations.json`. An unregistered component fails
`npm run stories`.

Never shadow a `govuk*` macro. `macro.njk` uses a relative include, so shadowing
fails silently rather than erroring.

## Carbon

Estimates use the Sustainable Web Design Model v4 via CO2.js, GB grid intensity,
green hosting assumed `false`.

These are **directional figures for comparing design decisions, not audited
emissions data.** SWDM v4 runs 40–67% below v3, so never compare a number here
against a pre-v4 baseline. There is deliberately no rating or score. The most
auditable carbon decision available is verified green hosting, and that sits with
Core Delivery Platform rather than with this repo.

The largest single saving is the typeface, and it follows from the licence rather
than being a design choice: outside the GOV.UK proposition a service must not use
GDS Transport, and a system font stack removes both webfonts — around 63 KB of
every uncached page load — rather than making them smaller.

Run `npm run carbon` for current figures, or see the
[carbon page](https://defra-design.github.io/defra-frontend/docs/carbon/).

## Status

Alpha. Nothing here is stable.

- No Defra design authority has approved this library.
- Colour and typeface values are placeholders derived from GOV.UK defaults, not
  from a brand audit of the Defra estate.
- The typeface deviates from the published Defra branding guidance. This is
  declared as DEF-002 in [`deviations.json`](deviations.json) and is waiting on a
  decision.

Open governance questions are in [`docs/spec.md`](docs/spec.md) and the open
decisions section of [CLAUDE.md](CLAUDE.md).

## Licence

Code is MIT. Documentation is © Crown copyright, available under the Open
Government Licence v3.
