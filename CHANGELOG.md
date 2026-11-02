# Changelog

Both packages release together and share a version number, so a release may
contain nothing for one of them. Where that happens it is said explicitly.

Dates are the publish date. Nothing here is stable — see
[Status](README.md#status).

## 0.7.0 — 2 November 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

### defra-create-prototype

**Added `--snapshot`, which freezes the pages as they are now.**

```bash
npx defra-create-prototype --snapshot "round 1" --note "before the new task list"
```

The second half of versioning, and a different job from `--variants`. Variants
are two states you are both editing and both showing. A snapshot is a copy
nobody edits: a round of research is over, the pages are about to be rebuilt,
and round two always asks what the thing participants actually saw looked like.

What it replaces, on every machine we have looked at, is a folder called
`backup copy` — or `defra form tool working backup 4:2:25` — with nothing
recording when it was taken or what it was for, and no way to look at it without
stopping the prototype that is running.

So a snapshot lives inside the prototype and is served by it, at
`localhost:<port>/snapshots/round-1/`, with an index of all of them at
`/snapshots`. No second install, no second port, no second terminal, and it
travels with the prototype when a colleague clones it. The live pages are not
touched: unlike `--variants`, this only ever adds.

`snapshots.json` records the label, the date, your note, the page count and the
versions it was built against. `--dashboard` reads it and lists each snapshot
with **how many of its pages have changed since** — the number that says whether
what participants saw still resembles the current prototype.

Links inside a snapshot are repointed to stay inside it, reusing the rewriting
`--variants` already does, so the two compose: snapshotting a prototype that has
variants keeps both states, at `/snapshots/round-1/current/` and
`/snapshots/round-1/future/`.

**What is deliberately not frozen:** the layout, the stylesheets and
`app/routes.js`. A snapshot freezes the pages and the journey, not the design
system. Copying the layout would pin every old snapshot to an old header forever
and gain almost nothing, since the layout extends a plugin that resolves at its
installed version either way. The trade — old content in today's design, and a
journey that may break if you change a route it depends on — is stated in the
command's own output rather than left to be discovered.

Guards, each with a test: a folder that is not a prototype, a prototype with no
pages yet, a label that slugifies to nothing, the same name twice (a snapshot is
never overwritten), and an existing `app/views/snapshots` folder with no
manifest beside it — which is the designer's own, and taking it over would
silently exclude their pages from every snapshot from then on. Earlier snapshots
are excluded from the copy, without which each one would contain all of its
predecessors and the folder would roughly double every time.

### Tests

The behaviour suite is up from 32 assertions to 59, and the harness now reads
files defensively. Mutation testing found that making `--snapshot` move the live
pages rather than copy them failed the suite with a stack trace and **no failing
assertion** — ending the run, so every later block was skipped. A test that is
right in the least useful way is worth fixing: the same mutation now names the
behaviour it broke.

## 0.6.0 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

### defra-create-prototype

**Added `--check`, which asks a published prototype whether it is protected.**

```bash
npx defra-create-prototype --check https://my-service.up.railway.app
```

This exists because the password fails open, silently. The kit installs its
auth middleware only when `NODE_ENV` is `production` —
`lib/authentication.js` gates on `shouldUseAuth()`, which returns true only for
`config.isProduction`. Set `PASSWORD` on its own and the middleware is never
installed: the prototype publishes, looks entirely correct, and anyone with the
address can walk in. Nothing about the deploy says so, which is why this had to
be something you can run rather than something written in a guide.

A protected prototype redirects to `/manage-prototype/password`, so the answer
comes from the prototype itself rather than from configuration anyone believes
they set. When it is open, the message names `NODE_ENV` as the near-certain
cause.

**New prototypes get a `.env.example`** naming both variables with an
explanation. Railway scans a repository root for that file and offers its
variables during setup, which is the one documented hook for putting
`NODE_ENV` in front of someone at the moment they are setting a password. It is
not read locally — the kit does not use dotenv — so it changes nothing about
`npm run dev`.

## 0.5.0 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

### defra-create-prototype

**Each prototype gets its own port**, so two can run at once — which is what
makes a side-by-side comparison of two prototypes possible at all. Before this
they all used 3000 and only one could run.

The port is recorded as `port` in `app/config.json`, which the kit reads, so
`npm run dev` picks it up with nothing to remember and nothing to type. That
also works on Windows, where a `PORT=` prefix on the command would not.

Ports are spaced 100 apart, and that spacing is load-bearing: the kit binds a
second port at `port - 50` for live reload, so anything closer would put one
prototype's reload proxy on another prototype's main port — a collision that
presents as a mysterious failure to start rather than as a port clash.

`--update` assigns a port to a prototype that has none, so existing ones can
have one without being recreated. `--dashboard` shows each prototype's port,
links to it, and marks the ones still on the shared default.

## 0.4.0 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

### defra-create-prototype

**Added `--dashboard`.** Writes and opens a page listing every prototype in
`~/Defra prototypes`: service name, versions, the command to start it, and for
any with versions, **which pages differ between them**.

```bash
npx defra-create-prototype --dashboard
npx defra-create-prototype --dashboard --dir ~/Documents/GitHub
```

`--dir` reads prototypes kept somewhere else and still writes the page into
`~/Defra prototypes`, so scanning a folder does not leave a file in it.

Two things it does that are easy to get wrong. The difference check normalises
away the link prefixes `--variants` adds, because otherwise every copied page
differs textually and the column reports everything as changed — worse than no
answer, since it looks like one. And it lists only the pages that differ: one
real prototype used while building this has 3,190 pages, where a table of all
of them would be unreadable.

It reads the service name from `app/config.json`, which is usually the only
record of what a prototype was for — folder names like
`defra form tool working backup 4:2:25` are not.

## 0.3.0 — 30 October 2026

A `defra-create-prototype` release. **`defra-frontend` is unchanged**, bumped to
keep the two packages answerable from one version number.

### defra-create-prototype

**Added `--variants`, for showing a current and a future state in research.**
Run inside a prototype, it moves your pages into `app/views/current`, copies
them to `app/views/future`, and prefixes internal links so each version keeps to
its own journey. Both serve from one `npm run dev`:

```
localhost:3000/current/    how it works today
localhost:3000/future/     how it might work
localhost:3000             a page linking to both
```

One prototype rather than two, deliberately. Two folders would mean two servers,
two terminal windows and every shared change made twice, with the drift that
follows — where one prototype gives both versions the same layout, styles and
components, so a common fix lands in both.

It requires a clean git tree, because it moves pages and rewrites links inside
them, and an undo is what makes that safe: `git checkout .`. It refuses if the
prototype already has variants, and it leaves assets, plugin assets, the kit's
own pages and external links alone when prefixing.

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
