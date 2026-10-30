# Contributing to defra-frontend

Context for working on this repository. Read before changing anything.

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
DEF-104 filter, DEF-105 sortable-table, DEF-106 timeout-dialog,
DEF-107 sub-navigation, DEF-108 side-navigation, DEF-109 search,
DEF-110 identity-bar, DEF-111 grid-reference-input.

Checked and deliberately NOT built, so they are not proposed again:
multi-file upload (v6 `file-upload` already takes `multiple` and ships a
JS-enhanced drop zone), unit inputs (`input` has `prefix`/`suffix`; a unit
selector is input + select composed, a pattern not a component), date picker
(GDS research favours a text date input for dates people know — build only on
evidence of the choosing-a-future-date case), and autocomplete
(`alphagov/accessible-autocomplete` exists and should be a companion package,
like the map, not a rebuild).

**`govukTabs` is not navigation.** It links to same-page anchors and toggles
panels, so using it to move between pages breaks the URL, the back button and
bookmarking, and announces panels rather than links. DEF-107 sub-navigation
exists largely so teams have the correct thing to reach for. Primary navigation
is already covered upstream by `service-navigation` — do not build one.

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

**Where the headline number comes from.** The first measurement, taken against
`govuk-frontend@6.4.0` on a first uncached question page, gzipped:

| Brand mode | CSS | Fonts | Total | gCO2e |
|---|---:|---:|---:|---:|
| GOV.UK (GDS Transport) | 15,669 | 64,862 | 89,531 | 0.0098 |
| Defra (system stack) | 15,548 | 0 | 24,548 | 0.0027 |

A 72.6% reduction from one variable, and the footer fork saves a further 3,039
bytes of HTML per page (3,411 → 372).

Two things to keep straight when quoting it. The **CSS figures are stale** —
current weights live in `carbon-baseline.json` and the check reports them — but
the shape of the finding is not, because the whole saving is the fonts column
and that column is still zero. And the saving **follows from the licence, not
from a design choice**: outside the GOV.UK proposition a service must not use
GDS Transport, so this is a constraint that happens to pay, not an optimisation
anyone chose.

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
5. ~~Prototype kit plugin~~ done — `npx defra-create-prototype`, verified in a real kit
6. ~~Docs site~~ done — Eleventy at `/docs/`, generated from the same fixtures. NOT `govuk-eleventy-plugin`: it depends on govuk-frontend ^4 with no v5 or v6 line, so it would render the docs three majors behind the library they document.
7. ~~Published to npm~~ done — `defra-frontend` and
   `defra-create-prototype`, OGL-UK-3.0. See Releasing.

## Maps — demonstrated, not depended on

https://github.com/DEFRA/interactive-map — MIT, public, accessibility-first,
Nunjucks + SCSS, provider-based so the map engine is a separate entry point.
It is the right map component for Defra and this repo should never build one.

**But it must not become a dependency of `defra-frontend`, today.** It declares
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

**How it is included today.** It is a devDependency of `apps/storybook` only,
with a hand-written story under `apps/storybook/stories/`. That placement is the
boundary: nothing a service installs from `defra-frontend` pulls it in, and
`npm run boundary` fails the build if it ever appears in the package's
dependencies (verified by temporarily adding it — the check exits 1). npm nests
the v5 copy under the map package, so `defra-frontend` still resolves 6.4.0;
the boundary check prints both so the situation stays visible rather than
becoming folklore.

Two integration notes, both found by running it:
- `maplibre-gl` must be pinned to the major the map package expects (`^5`).
  Installing the current major gave two copies and a silent failure.
- The provider throws `p is not a constructor` unless Vite dedupes and
  pre-bundles `maplibre-gl`. Fixed in `main.js` via `resolve.dedupe` and
  `optimizeDeps.include`. Symptom: map chrome renders, no `<canvas>`.

Services that need a map install it themselves alongside this package. The
unblocking action for real adoption is upstream — ask them to move
`govuk-frontend` to a peerDependency supporting v6, which fixes it for every
consumer, not just this one.

## Prototyping

Spin-up deliberately mirrors the GDS command, so every Defra instruction can be
"the same as the GOV.UK one, with our package name":

```bash
npx defra-create-prototype my-service
```

`packages/create-prototype` does not reimplement the kit. It runs the real
`govuk-prototype-kit create`, then applies the four things a Defra prototype
needs. Each one is load-bearing:

1. **`govuk-frontend@6` at the project root.** The kit pins 5.x for itself but
   resolves plugins from the *project* root (`getPathFromProjectRoot`), so the
   root copy is what gets compiled. This layer is v6-only —
   `govuk-functional-colour` and `govuk-colour($variant:)` do not exist in v5,
   so on the kit's own v5 nothing here compiles at all. Verified working: the
   kit builds against v6 and emits only v6 deprecation warnings.
2. **`defra-frontend`, which is itself the kit plugin.** No separate plugin
   package — `govuk-frontend` ships its own `govuk-prototype-kit.config.json`
   and this follows that precedent. One install, one version, no skew.
   The config file must stay in the package's `files` array or the plugin
   silently does nothing once published.
3. **Two sass imports, in the two files the kit reserves for this.** The kit
   imports user *settings* before plugins and user *application* after, which
   is the only ordering in which a token layer can work: settings have to reach
   govuk-frontend before it compiles. Hence the `_settings.scss` / `_post.scss`
   split — the standalone stylesheet composes the same two halves.
4. **The Defra layout.** The kit's default layout renders the GOV.UK header and
   a footer asserting the Royal Arms and the OGL, which a service outside the
   GOV.UK proposition may not use. Swapping it is the licence boundary, not
   decoration. Services on `*.service.gov.uk` should extend the kit's
   `govuk-branded` layout instead.

Verified end to end in a real kit prototype: GDS Transport absent, system stack
and Defra greens applied, `.defra-*` components compiled, and no Crown or OGL
in the rendered page.

## Prototype Kit layout — which blocks to override

GOV.UK Frontend v6's template puts the landmarks in the OUTER blocks and the
components in inner ones:

```
{% block header %}        <header class="govuk-template__header">
  {% block govukHeader %}   <- the component
{% block footer %}        <footer class="govuk-template__footer">
  {% block govukFooter %}   <- the component
```

**Override the inner blocks.** Overriding `header` or `footer` replaces the
landmark itself. Both mistakes were shipped and found in real use: the header
landmark disappeared (axe: content outside landmarks) and `defraFooter`, which
then still emitted its own `<footer>`, produced a footer inside a footer.

`defraFooter` renders a `<div>`, exactly as v6's `govukFooter` does, because the
landmark belongs to the page template. If you use it outside a template, supply
the `<footer>` yourself.

Two more things that layout gets wrong by default and this one fixes: the kit's
page title ends in "GOV.UK", which a service outside the proposition must not
claim; and placeholder footer links pointing at `#` are worse than no links,
so there are none.

**The kit does not call a plugin's JavaScript.** It loads `scripts` as files
and nothing more. The plugin therefore points at
`src/defra/prototype-kit/init.mjs`, whose only job is to call `initAll()` —
the same split govuk-frontend uses. Pointing the kit at the library entry
loaded every component and started none of them, which looks exactly like the
components being broken.

## Releasing to npm

Two packages publish, both unscoped — **not** under `@defra`. That scope is a
live npm organisation owned by Defra's delivery teams (`@defra/forms-model`,
`@defra/hapi-tracing`, `@defra/interactive-map`, ~20 more) with Defra digital
staff as maintainers. Publishing into it would both fail without membership and
claim a departmental ownership that no design authority has granted. See the Org
entry under open decisions.

Unscoped matches `govuk-frontend`, `govuk-prototype-kit` and `hmrc-frontend`.
MoJ and HMCTS scope theirs, so both conventions are in use; `hmrc-frontend` is
the closest analogue to what this is and settles it.

A scope was tried first and abandoned: `@defra-design` could not be created on
npm — the name is unavailable, while `defra-design` is free as a *package* name,
so it is either held as a username or blocked by npm's similarity guard against
the existing `@defra`. Don't spend another afternoon on it.

### Cutting a release

`.github/workflows/release.yml` publishes both packages. There is no npm token
in the repository: it uses **trusted publishing**, where npm verifies the OIDC
claims GitHub issues — organisation, repository, workflow filename — against a
publisher configured on each package. Nothing to rotate, and no credential that
can leak.

Versions are committed, not computed:

```bash
npm version 0.1.1 --no-git-tag-version -w defra-frontend -w defra-create-prototype
git commit -am "release 0.1.1"
git tag v0.1.1
git push && git push --tags
```

The workflow then checks the tag against both `package.json` files, runs
`npm run check`, and publishes anything not already on the registry. That last
part makes a re-run safe: a release that failed after one package went out
finishes the other instead of failing on the one that succeeded.

**Bump both versions together.** `create-prototype` installs
`defra-frontend@latest`, so it does not depend on a version range — but a
prototype records what it installed, and two packages drifting apart makes
"which version am I on" unanswerable from one number. The tag guard enforces
this rather than trusting anyone to remember.

Three things about the workflow are load-bearing:

- **`permissions: id-token: write`.** Without it there is no OIDC token and npm
  cannot authenticate. The error looks like a misconfigured publisher.
- **npm is upgraded explicitly.** Trusted publishing needs npm 11.5.1+, and the
  npm bundled with a Node release is not guaranteed to be that new — Node 22
  ships npm 10.x. npm's own documented example quietly relies on Node 24 for
  this; the workflow installs `npm@latest` and asserts the version instead, so it
  does not break the day `.nvmrc` changes.
- **No dependency cache.** A release should resolve from the lockfile and the
  registry, not from what a previous run left behind.

### Configuring the trusted publisher

Per package, on npmjs.com under **Settings → Trusted publishing**. Both packages
need their own, pointing at the same workflow:

| Field | Value |
|---|---|
| Organization or user | `defra-design` |
| Repository | `defra-frontend` |
| Workflow filename | `release.yml` — basename only, not a path |
| Environment | leave empty |
| Allowed actions | must include **`npm publish`** |

All fields are case-sensitive and npm does not validate them on save, so a typo
surfaces only at publish time.

**The allowed-actions row is the trap.** Configurations created after 3 September
2026 default to permitting only `npm stage publish`. The workflow runs
`npm publish`, so that has to be ticked explicitly or the release fails
authentication having looked correctly configured.

**A new publisher must complete its first successful publish within two days**
or it expires and cannot be used or edited. Configure it when you are ready to
cut a release, not in advance.

`repository.url` in each `package.json` must match the GitHub repository exactly,
including the `git+` prefix. npm checks it.

No `publishConfig` on either package: unscoped packages are public by default,
and config that does nothing invites a wrong reading of why it is there. A move
to a scope would need `access: "public"` added back.

**Provenance comes for free and should stay that way.** npm attaches a
provenance attestation automatically under trusted publishing, with no
`--provenance` flag, because this repository is public and both packages are.
Each release is then publicly linked to the commit and workflow run that built
it — which is most of the reason trusted publishing is worth the setup for a
library other departments might depend on.

It is conditional on public visibility, not on anything in the workflow. Making
the repository private or internal again would silently stop attestations
without failing a release, so that is not a change to make casually.

**`files` carries a negation and it matters.** `"!src/stories"` keeps 53
generated Storybook files out of the tarball — half the download and 69% of the
unpacked size. Storybook reads them from the workspace path, not the package, so
nothing breaks. Check `npm pack --dry-run` after touching `files`; a published
tarball cannot be taken back.

**No prebuilt stylesheet ships, deliberately.** Compiled CSS would bake in token
values and defeat the settings layer, which only works by reaching
govuk-frontend before it compiles. `dist/` is a local artefact for the carbon
check and Storybook.

**`create-prototype` prefers npm, so test unreleased changes with `--local`.**
It runs `npm view` and uses the published package whenever that succeeds, which
since the first release is always. Without `--local` a prototype you make to
verify a fix installs the *published* version, builds fine, and shows you the
old behaviour — so you conclude the fix does not work. The kit plugin bugs in
this repo were all found by building a real prototype, which makes this the
likeliest way to waste an afternoon:

```bash
node packages/create-prototype/bin/create.mjs --local my-test
```

The local route packs a tarball rather than writing a `file:` path, because a
`file:` dependency records an absolute path from the machine that made it and
breaks the moment a colleague clones the prototype.

**Scope renames are a silent-failure risk, which is why `--update` migrates.**
The sass imports name a `node_modules` path. A prototype left on the old
`@defra/frontend` dependency still has that package on disk, still compiles and
still looks right, while ignoring everything the update installed. The migration
repoints the imports, removes the old dependency and deletes `vendor/`. Keep
`LEGACY_NAME` in `create.mjs` for as long as prototypes from before the first
release are plausibly still in use.

## Open decisions — ask, don't guess

- **`@use` migration.** Sass emits ~172 `@import` deprecation warnings. v6 ships
  both modern and `.import.scss` files. Cheap now, breaking for every consumer
  later. Not yet decided.
- **Org and npm scope.** Currently `defra-design` on both GitHub and npm
  (prototype org). If this becomes a production dependency it arguably belongs
  in `DEFRA` alongside `design-standards`, published as `@defra/frontend`.
  GitHub preserves redirects on transfer; **npm does not rename**. Moving scope
  means publishing under the new name, deprecating the old one with a pointer,
  and a `--update` migration like the one already written for the first move.
  Cheap now, less so with every prototype created.
- **Governance.** No Defra design authority has approved this yet. README says so.
  Don't remove that line until it's untrue. Note this is narrower than it was:
  published Defra branding guidance now exists (see Brand cues), so the question
  is approval of *this library*, not the absence of any standard.

  The question underneath it, still unanswered: **is this Defra-sanctioned or a
  designer-led pilot?** It is not a presentational detail. A sanctioned library
  owes consumers a support commitment, a deprecation policy and a route for
  other teams to propose components; a pilot owes them honesty that it might be
  abandoned. Everything in the README's Status section is currently written for
  the second reading. If the answer becomes the first, that section is the thing
  to rewrite, not the code.
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

  And the harder version of that question, which an audit would answer but this
  repo cannot: **are the brand cues across the estates consistent enough to
  tokenise at all, or is the real first step a brand consolidation job?** If the
  estates have genuinely diverged, a token layer cannot reconcile them — it can
  only pick one and make the others wrong. That would make this library a
  downstream consequence of a decision nobody has taken, rather than the thing
  that settles it. Worth saying out loud before anyone treats the token values
  here as the answer.

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
