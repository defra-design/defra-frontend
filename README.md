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
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Working on this repo: the decisions, the traps, and the rules for adding a component. |

## Packages

| Package | What it is |
|---|---|
| [`@defra-design/frontend`](https://www.npmjs.com/package/@defra-design/frontend) | The library: sass, Nunjucks macros, JavaScript, and the Prototype Kit plugin. |
| [`@defra-design/create-prototype`](https://www.npmjs.com/package/@defra-design/create-prototype) | The command that creates and updates a Defra prototype. |

Both are [Open Government Licence v3.0](LICENCE) and require GOV.UK Frontend 6
as a peer dependency.

### Why `@defra-design` and not `@defra`

`@defra` is a live npm organisation belonging to Defra's delivery teams —
`@defra/forms-model`, `@defra/hapi-tracing`, `@defra/interactive-map` and around
twenty more, maintained by Defra digital staff accounts. Publishing into it would
need membership of that organisation, and would assert a departmental ownership
that nothing here has been granted: no Defra design authority has approved this
library. See [Status](#status).

`@defra-design` matches this GitHub organisation, which is where the work
actually lives. If it becomes a production dependency, moving scope is one of the
[open decisions](CONTRIBUTING.md). npm has no rename, so that move means
publishing under the new name and deprecating the old one with a pointer — which
gets more expensive with every prototype created, not less.

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
npx @defra-design/create-prototype my-service
cd my-service
npm start
```

This runs the real GOV.UK Prototype Kit, then adds Defra styling, Defra page
templates and the Defra layout. The
[step-by-step guide](https://defra-design.github.io/defra-frontend/docs/prototyping/)
covers installing Node, using a terminal, and putting your prototype on GitHub.

### Updating a prototype

A prototype pins the version it was created with, so changes here do not reach
it on their own. From inside the prototype:

```bash
npx @defra-design/create-prototype --update
```

It reports the version before and after, and flags any workarounds in the
prototype that the package now handles itself.

Prototypes made before this was published to npm carried a vendored copy of the
package under the old `@defra` scope. Update moves those across — repointing the
sass imports, removing the old dependency and deleting the `vendor` folder —
because a half-migrated prototype would keep compiling the old copy and look
correct while ignoring every change.

## Using it in a service

Defra services run Node.js with Hapi and GOV.UK Frontend Nunjucks templates.

```bash
npm install @defra-design/frontend govuk-frontend
```

**Styles.** Import the whole layer, which brings GOV.UK Frontend with it:

```scss
@import "@defra-design/frontend/src/defra-frontend";
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
import { initAll } from '@defra-design/frontend/javascript'
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

### Releasing

```bash
npm ci                 # the lockfile must be in sync, or CI fails where you passed
npm run check
npm publish -w @defra-design/frontend
npm publish -w @defra-design/create-prototype
```

Bump both versions together. `create-prototype` installs
`@defra-design/frontend@latest` so it needs no version range, but a prototype
records what it installed, and two packages drifting apart makes "which version
am I on" unanswerable from one number.

Four things about the published tarball are deliberate:

- **`files` carries a negation**, `"!src/stories"`, which keeps 53 generated
  Storybook files out of the package — half the download and 69% of the unpacked
  size. Storybook reads them from the workspace, not the package. Run
  `npm pack --dry-run` after touching `files`; a published tarball cannot be
  taken back.
- **No prebuilt stylesheet ships.** Compiled CSS would bake in token values and
  defeat the settings layer, which works only by reaching GOV.UK Frontend before
  it compiles. `dist/` is a local artefact for the carbon check and Storybook.
- **`publishConfig.access` is `public`** on both, without which npm treats a
  scoped package as private and refuses to publish it on a free organisation.
- **`create-prototype` finds its own source.** It runs `npm view` and falls back
  to packing from a local checkout, so the same command works from a clone
  before a release and from npm after. Don't replace that with a hardcoded
  source.

A fuller account, including why a scope rename needs a migration rather than a
note in the changelog, is in
[CONTRIBUTING.md](CONTRIBUTING.md#releasing-to-npm).

## Adding a component

Check [GOV.UK Frontend](https://design-system.service.gov.uk/) first — v6
absorbed several components departments used to retrofit. Then check whether MoJ,
HMRC or the GOV.UK publishing components have already solved it, and follow their
markup rather than re-deriving the accessibility.

If it genuinely has no equivalent, the full process is in
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-component-govuk-frontend-does-not-have). In short:
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
decisions section of [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[Open Government Licence v3.0](LICENCE), which is the licence Defra's other
published packages use.

GOV.UK Frontend is not redistributed here. It is a peer dependency, installed
separately, and published by the Government Digital Service under the MIT
Licence.

