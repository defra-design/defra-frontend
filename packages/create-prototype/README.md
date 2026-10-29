# Create a Defra prototype

Creates a [GOV.UK Prototype Kit](https://prototype-kit.service.gov.uk/)
prototype themed with [Defra Frontend](https://www.npmjs.com/package/defra-frontend).

```bash
npx defra-create-prototype my-service
```

Then:

```bash
cd my-service
npm start
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
3. **Two sass imports**, in the files the kit reserves for exactly this. The
   kit imports user settings before plugins and user application after — the
   only ordering in which a token layer works.

It also points the prototype's layout at the Defra header and footer, writes a
README into the folder, and puts the prototype into git.

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
