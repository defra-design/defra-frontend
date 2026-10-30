# Changelog

Both packages release together and share a version number, so a release may
contain nothing for one of them. Where that happens it is said explicitly.

Dates are the publish date. Nothing here is stable — see
[Status](README.md#status).

## 0.1.1 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**: its only
difference from 0.1.0 is the `git+` prefix on `repository.url`, which npm
normalises anyway. It is bumped to keep the two packages answerable from one
number.

### defra-create-prototype

**Added `--local`.** Publishing 0.1.0 changed how this command finds Defra
Frontend: it prefers npm whenever `npm view` succeeds, which is now always, so
the local-checkout route became unreachable. A contributor building a prototype
to verify an unreleased fix would have installed the published package, seen the
old behaviour and concluded the fix did not work.

```bash
node packages/create-prototype/bin/create.mjs --local my-test
```

**Clearer failure messages.** The "cannot find Defra Frontend" error no longer
says the package is unpublished, and distinguishes being offline from running
`--local` outside a checkout. The offline fallback itself is unchanged.

**`bin` path written the way npm wants it**, `bin/create.mjs` rather than
`./bin/create.mjs`. npm's publish warning for 0.1.0 said the entry "was invalid
and removed", which was alarming and inaccurate — the registry copy of 0.1.0 has
a working `bin`, because npm normalised the path instead of dropping it.

### Both packages

`repository.url` carries the `git+` prefix npm normalises to, which also
satisfies the trusted publisher's repository check.

## 0.1.0 — 30 October 2026

First release of both packages, unscoped, under the Open Government Licence
v3.0.

Published unscoped rather than under `@defra`, which is a live npm organisation
belonging to Defra's delivery teams and would need membership plus a
departmental approval nothing here has. `govuk-frontend`, `govuk-prototype-kit`
and `hmrc-frontend` are all unscoped, and `hmrc-frontend` — a department
frontend layered over GOV.UK Frontend — is the direct analogue.

- **defra-frontend** — the settings layer, the `defra` namespace, eleven
  components GOV.UK Frontend has no equivalent for, three page types, and the
  GOV.UK Prototype Kit plugin. `govuk-frontend` 6 is a peer dependency and stays
  that way.
- **defra-create-prototype** — creates a Defra-themed Prototype Kit prototype,
  and updates an existing one with `--update`.

`--update` also migrates prototypes made before this release, which carried a
vendored copy under the old `@defra` scope. That migration is not optional
tidying: the sass imports name a `node_modules` path, so a prototype left on the
old dependency keeps compiling the old copy and looks correct while ignoring
every change.
