# Create a Defra prototype

Creates a [GOV.UK Prototype Kit](https://prototype-kit.service.gov.uk/)
prototype themed with [Defra Frontend](https://www.npmjs.com/package/defra-frontend).

```bash
npx defra-create-prototype
```

It asks what you are prototyping and whether the service will be on a
`service.gov.uk` address, then tells you where it put the folder and what to
run — `npm run dev`.

Prototypes go in `~/Defra prototypes`, so they are in one place and `--update`
can find them later. Pass `--here` to use the current directory instead, or a
name to skip the first question:

```bash
npx defra-create-prototype my-service
```

- [Step-by-step guide for designers](https://defra-design.github.io/defra-frontend/docs/prototyping/)
- [Components](https://defra-design.github.io/defra-frontend/)

> **Work in progress.** Defra Frontend has not been approved by any Defra
> design authority and is not for use in live services.

## What it does

It does not reimplement the kit. It runs the real `govuk-prototype-kit create`,
then adds the three things a Defra prototype needs:

1. **GOV.UK Frontend 6 at the project root.** The kit pins 5.x for itself but
   resolves plugins from the project root, so the root version is the one that
   gets compiled. Defra Frontend is a v6 token layer and cannot work on v5.
2. **Defra Frontend**, which is itself a kit plugin.
   It also sets the service name in `app/config.json`, and picks the header,
   footer and typeface from your answer about the address — a licence boundary
   rather than a style choice, since GDS Transport and the Royal Arms footer are
   licensed for `service.gov.uk` only.
3. **Two sass imports**, in the files the kit reserves for exactly this. The
   kit imports user settings before plugins and user application after — the
   only ordering in which a token layer works.

It also points the prototype's layout at the Defra header and footer, writes a
README into the folder, and puts the prototype into git.

## Finding your prototypes

```bash
npx defra-create-prototype --dashboard
```

Writes and opens a page listing every prototype in `~/Defra prototypes` — its
service name, its versions, the command to start it, and, where a prototype has
versions, **which pages differ between them**. Useful before a comparison
session: knowing that three of fifteen pages changed tells you where to spend
the time.

Prototypes made before the shared folder existed are usually somewhere else:

```bash
npx defra-create-prototype --dashboard --dir ~/Documents/GitHub
```

That reads the folder you name and writes the page into `~/Defra prototypes`,
so scanning somewhere does not leave a file in it.

The difference check ignores the link prefixes `--variants` adds, so "differs"
means a real content change. Without that every copied page would be reported as
changed, which looks like an answer and is not one.

## Comparing two versions in research

To show a participant how something works today and how it might work, from
inside your prototype:

```bash
npx defra-create-prototype --variants
```

Your pages move into `app/views/current`, a copy becomes `app/views/future`, and
links inside them are prefixed so each version stays in its own journey.

```
localhost:3000/current/    how it works today
localhost:3000/future/     how it might work
localhost:3000             a page linking to both
```

One prototype rather than two, deliberately: both versions share the layout, the
styles and the components, so fixing a typo in the header fixes it in both, and
one `npm run dev` serves both. Two folders would mean two servers, two terminal
windows and every shared change made twice.

Each prototype also gets its own port, recorded in `app/config.json`, so two
different prototypes can run at the same time without clashing. Nothing to
remember — `npm run dev` reads it. Prototypes made before this still use the
kit's default of 3000; `--update` gives them one.

It needs a clean git tree, because it moves your pages and rewrites links inside
them — if it gets something wrong, `git checkout .` puts it back.

## Updating a prototype

From inside the prototype:

```bash
npx defra-create-prototype --update
```

This reports the version before and after, and names any workarounds in the
prototype that the package now handles itself. Prototypes created before this
package was published carried a vendored copy under the old `@defra` scope;
update moves those across and removes it.

## Licence

[Open Government Licence v3.0](LICENCE).
