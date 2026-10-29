# Defra Frontend

A theme layer over [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend)
for Defra services. Not a fork and not a replacement — `govuk-frontend` is a
peer dependency and stays that way.

> **Work in progress.** No Defra design authority has approved this library. It
> is not for use in live services. Colour and typeface tokens are placeholders
> derived from GOV.UK defaults, not from Defra brand research.

- [Documentation](https://defra-design.github.io/defra-frontend/docs/)
- [Components](https://defra-design.github.io/defra-frontend/)
- [Source](https://github.com/defra-design/defra-frontend)

## Install

```bash
npm install @defra-design/frontend govuk-frontend
```

Requires GOV.UK Frontend 6. The functional colour API this layer depends on
does not exist in 5.x, so it cannot work there.

## Styles

```scss
@import "@defra-design/frontend/src/defra-frontend";
```

That brings GOV.UK Frontend with it. Override tokens *before* the import —
`$defra-brand-mode`, `$defra-font-stack` and the weight scale all use
`!default`.

If your build imports GOV.UK Frontend itself, use the two halves instead:
`src/settings` before it and `src/post` after. Settings must reach GOV.UK
Frontend before it compiles, which is the only ordering in which a token layer
can work.

No prebuilt stylesheet is shipped, deliberately. Compiled CSS would bake in
token choices and defeat the override mechanism above.

## Templates

Add the package to your Nunjucks search path, then import macros as you would
GOV.UK ones:

```njk
{% from "defra/components/timeline/macro.njk" import defraTimeline %}
{{ defraTimeline({ items: [ ... ] }) }}
```

Deviations live in the `defra` namespace with `defra*` macro names. Never
shadow a `govuk*` macro — every GOV.UK `macro.njk` uses a relative include, so
shadowing its template fails silently and renders upstream anyway.

## JavaScript

```js
import { initAll } from '@defra-design/frontend/javascript'
initAll()
```

Components progressively enhance markup that already works without it, with one
exception: `timeout-dialog` does nothing without JavaScript, so never rely on
it as your only session protection.

## Brand mode is a licence boundary

GDS Transport is licensed for `www.gov.uk`, `*.service.gov.uk` and
`*.blog.gov.uk` only.

| Your service is on | Typeface | Header and footer |
|---|---|---|
| `*.service.gov.uk` | **must** use GDS Transport | GOV.UK header and footer |
| anything else | **must not** use GDS Transport | `govukGenericHeader` + `defraFooter` |

The default is `$defra-brand-mode: "defra"`. Setting a system font stack drops
both `@font-face` blocks automatically.

## Prototype Kit

This package is also a GOV.UK Prototype Kit plugin. To start a Defra prototype:

```bash
npx @defra-design/create-prototype my-service
```

## Licence

[Open Government Licence v3.0](LICENCE). GOV.UK Frontend is published
separately by the Government Digital Service under the MIT Licence.
