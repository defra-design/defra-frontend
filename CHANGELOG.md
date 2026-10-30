# Changelog

Both packages release together and share a version number, so a release may
contain nothing for one of them. Where that happens it is said explicitly.

Dates are the publish date. Nothing here is stable — see
[Status](README.md#status).

## 0.2.0 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

Minor rather than patch: where prototypes are created has moved, and running the
command with no arguments now asks questions instead of printing usage.

### defra-create-prototype

**It asks instead of requiring arguments.** Run with no name and it asks what
you are prototyping and whether the service will be on a `service.gov.uk`
address. Previously a missing argument printed usage and exited, which is a dead
end for the person least able to recover from it. Flags
(`--service-name`, `--govuk`, `--defra`) skip the questions for scripts and CI,
and nothing is asked when there is no terminal to answer with — a prompt in CI
would hang with no indication why.

**The address question replaces a Sass variable nobody found.** It decides the
header, footer and typeface, which is a licence boundary rather than a style
choice: GDS Transport and the Royal Arms footer are licensed for
`service.gov.uk` only. Leaving it as `$defra-brand-mode` meant the default
silently decided it for every prototype. The answer now writes the variable, the
layout and a comment in both explaining what changing it would mean.

**Prototypes go in `~/Defra prototypes`.** They used to land in whatever
directory the terminal happened to be in, which for someone who does not think
in working directories means they scatter. One place also makes `--update`
findable. `--here` uses the current directory; anything that looks like a path
is still taken literally.

**Also:** the service name is written into `app/config.json` rather than left as
"Service name goes here"; the folder name is derived from the answer, so a
designer can type a sentence; creating over a non-empty folder is refused rather
than merged into; and Ctrl+D at a prompt exits with "Cancelled" instead of a
Node stack trace, which is the worst thing to show someone who has just decided
to back out.

## 0.1.2 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

### defra-create-prototype

**Fixed: `--update` could break a prototype it had nothing to do with.** It
checked only that the folder was a Prototype Kit prototype, not that Defra
Frontend was already installed. Run in any other prototype it would install
Defra Frontend and raise `govuk-frontend` to 6 — from 4.x or 5.x in most
existing ones. That is up to three majors of breaking changes applied to
someone's working research prototype by a command whose name promises the
opposite, with `npm install` reporting success while the pages broke.

It now refuses, prints the versions it found, and says to make a new prototype
and move pages into it instead.

Found by looking at real prototypes on a designer's machine: eighteen of them,
every one on kit 13 with `govuk-frontend` 4.x or 5.x, and not one with Defra
Frontend installed. Anyone running the published `--update` in the obvious place
would have hit this.

## 0.1.1 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**: its only
difference from 0.1.0 is the `git+` prefix on `repository.url`, which npm
normalises anyway. It is bumped to keep the two packages answerable from one
number.

### defra-create-prototype

**Fixed: it told you to run the wrong command.** Every instruction this tool
emitted — the terminal output after creating a prototype, the README it writes
into your folder, and the guidance on the docs site — said `npm start`. The
Prototype Kit maps `start` to its hosting server, which does not watch your
files, so changes do not appear. The kit's own source calls this out: it has a
`warnIfNpmStart` function whose comment describes `npm start` as "the wrong
command" locally, and the kit's own post-create message says `npm run dev`.
This tool was overwriting that with the opposite advice.

Now `npm run dev` throughout, and the generated README and docs both say why,
since `start` is still visible in `package.json` and is an easy guess.

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
