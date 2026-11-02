# defra-mcp

Design system knowledge for an assistant working inside a Defra prototype.

Nothing is approved for live services. See
[Status](../../README.md#status).

## What it is for

An assistant editing a prototype's pages writes confident, plausible Nunjucks.
Without knowing this design system it will refer to macros that do not exist,
reach for `govukFooter` on a service that may not legally use it, or try to
change a GOV.UK component by shadowing its template — which fails with no error
at all, so the fix looks applied and the page is unchanged.

This server answers those questions from the design system itself, so the
answers move when the design system moves.

## What it is not

It does not edit files. An assistant in VS Code already does that, and doing it
twice in two places is how the two disagree.

## Using it

A prototype made with `defra-create-prototype` is already wired up — open the
folder in VS Code and the tools are there.

To add it to a prototype by hand, create `.vscode/mcp.json`:

```json
{
  "servers": {
    "defra": { "type": "stdio", "command": "npx", "args": ["defra-mcp"] }
  }
}
```

That is the VS Code workspace format. GitHub Copilot CLI uses a different file
with a `mcpServers` key and `"type": "local"`, and does not read this one.

Run the prototype the usual way to see your changes — `npm run dev` from the
prototype folder, which watches files and reloads. There is no tool here for
viewing a page, because a browser does that better.

## Tools

| Tool | Does |
|---|---|
| `list_components` | Says what exists, which Defra components replace GOV.UK ones, and which must not be used |
| `component_help` | Gives one component's macro name, import path, parameters and a working example |
| `list_page_types` | Explains the page types, how a file becomes a URL, and the layout every page extends |
| `create_page` | Writes a page from a template, at the right path, extending the right layout |
| `run_prototype` | Starts the prototype and returns its address |
| `audit` | Checks every page against WCAG 2.1 AA with axe-core |
| `snapshot` | Freezes the pages as they are now, so a round of research stays viewable |
| `publish` | Commits and pushes to GitHub — it does not host the prototype |
| `check_protection` | Asks a published prototype whether it wants a password |

The tools that act on a prototype refuse to run in a folder that is not one,
and `create_page` refuses to overwrite a page that already exists. Both guards
are there because an assistant retrying a call must not be able to destroy
work.

`publish` stops at GitHub. A prototype is a running Node server, so hosting it
means a platform that runs Node and an account to go with it — GitHub Pages
cannot. What `publish` does do is say, every time, that **`PASSWORD` without
`NODE_ENV=production` does nothing**: the prototype deploys, looks correct, and
is open to anyone who finds the address. Creating a repository is private
unless public is asked for, because a prototype may hold unreleased policy.

`audit` returns a list of things to fix and never a pass. An automated check
finds a minority of accessibility problems, and the commonest mistake in a
prototype — a placeholder standing in for a label — is one it cannot report at
all, because axe accepts the placeholder as the field's name.

## The catalogue is generated

`lib/catalogue.json` is built from `packages/defra-frontend` by
`npm run catalogue`, and `npm run catalogue:check` fails when the two have
drifted apart. It is precomputed rather than read at runtime because this
server runs inside a designer's prototype, where the design system's source
files are not present.

Do not edit it by hand.

## Licence

[Open Government Licence v3.0](../../LICENCE).
