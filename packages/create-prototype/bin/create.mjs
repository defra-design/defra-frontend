#!/usr/bin/env node
/**
 * Create a Defra-themed GOV.UK Prototype Kit prototype.
 *
 *   npx @defra/create-prototype my-service
 *
 * Deliberately the same shape as `npx govuk-prototype-kit create`, because
 * designers already know that command and every Defra instruction can then be
 * "the same as the GDS one, with our package name".
 *
 * This does NOT reimplement the kit. It runs the real `govuk-prototype-kit
 * create`, then applies the three things a Defra prototype needs on top:
 *
 *   1. govuk-frontend 6 at the project root. The kit pins 5.x for itself, but
 *      resolves plugins from the PROJECT root, so a root v6 is what gets
 *      compiled. Defra Frontend is a v6 token layer and cannot work on v5 —
 *      the functional colour API it depends on does not exist there.
 *   2. @defra/frontend, which is itself a kit plugin (the same pattern
 *      govuk-frontend uses — it ships its own kit config).
 *   3. Two sass imports in the files the kit reserves for exactly this. The
 *      kit imports user settings BEFORE plugins and user application AFTER,
 *      which is the only ordering in which a token layer can work: settings
 *      must reach govuk-frontend before it compiles.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GOVUK_FRONTEND = 'govuk-frontend@^6.4.0'
const DEFRA_FRONTEND = '@defra/frontend@^0.1.0'

const name = process.argv[2]
if (!name) {
  console.error('\nUsage: npx @defra/create-prototype <directory>\n')
  process.exit(1)
}

const dir = resolve(process.cwd(), name)
const run = (cmd, args, cwd = dir) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')}\n`)
    process.exit(r.status ?? 1)
  }
}
// For steps that are a convenience rather than a requirement. A missing git,
// for example, should not fail the whole setup and leave a half-made
// prototype behind — the person can still work, they just cannot share yet.
const tryRun = (cmd, args, cwd = dir) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'ignore', shell: process.platform === 'win32' })
  return r.status === 0
}

// Node version check up front, in plain language. The kit needs 20+, and the
// failure without this is a stack trace rather than a sentence.
const major = Number(process.versions.node.split('.')[0])
if (major < 20) {
  console.error(`
You are running Node.js ${process.versions.node}, and the Prototype Kit needs
version 20 or later.

Install the latest "LTS" version from https://nodejs.org, close and reopen your
terminal, then run this command again.
`)
  process.exit(1)
}

// Where does @defra/frontend come from?
//
// Two sources, checked in order, so this works before the package is published
// and keeps working afterwards without anyone changing the instructions:
//
//   1. npm, once it is published.
//   2. the checkout this script is running from. Whether that is a git clone
//      or `npx github:defra-design/defra-frontend`, the package sits two
//      directories up from here, so it can be packed and installed directly.
//
// The local route installs a packed tarball rather than a `file:` path on
// purpose. A `file:` dependency records an absolute path from the machine that
// made it, so the prototype would break the moment a colleague cloned it. A
// tarball committed inside the prototype travels with it.
const selfRoot = fileURLToPath(new URL('../../../', import.meta.url))
const localPackage = join(selfRoot, 'packages', 'defra-frontend')

const onNpm = spawnSync('npm', ['view', '@defra/frontend', 'version'], {
  stdio: 'ignore',
  shell: process.platform === 'win32'
}).status === 0

const hasLocal = existsSync(join(localPackage, 'package.json'))

if (!onNpm && !hasLocal) {
  console.error(`
Cannot find Defra Frontend.

It is not published to npm yet, and this script is not running from a copy of
the defra-frontend repository, so there is nowhere to install it from.

Run it one of these two ways instead:

  npx github:defra-design/defra-frontend ${name}

or:

  git clone https://github.com/defra-design/defra-frontend.git
  node defra-frontend/packages/create-prototype/bin/create.mjs ${name}
`)
  process.exit(1)
}

console.log('\nCreating the GOV.UK Prototype Kit\n')
run('npx', ['govuk-prototype-kit', 'create', dir], process.cwd())

console.log('\nAdding GOV.UK Frontend 6 and Defra Frontend\n')
// Installed at the project root on purpose: the kit resolves plugin paths
// from there, so this is the copy the kit compiles.
if (onNpm) {
  run('npm', ['install', GOVUK_FRONTEND, DEFRA_FRONTEND, '--save'])
} else {
  console.log('Using the local copy of Defra Frontend — it is not published yet.\n')
  const vendor = join(dir, 'vendor')
  mkdirSync(vendor, { recursive: true })

  // The stylesheet is a build artefact and is not in the repository, so build
  // it before packing or the prototype installs a package with no CSS.
  run('npm', ['run', 'build'], localPackage)

  const packed = spawnSync('npm', ['pack', '--pack-destination', vendor], {
    cwd: localPackage,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  if (packed.status !== 0) {
    console.error('\nCould not package Defra Frontend from the local checkout.\n')
    process.exit(1)
  }
  const tarball = packed.stdout.trim().split('\n').pop()
  run('npm', ['install', GOVUK_FRONTEND, `./vendor/${tarball}`, '--save'])
}

// --- Sass wiring -----------------------------------------------------------
// Paths are relative to the project root because the kit compiles sass with
// loadPaths: [projectDir].
const sassDir = join(dir, 'app', 'assets', 'sass')
mkdirSync(sassDir, { recursive: true })

const settingsPath = join(sassDir, 'settings.scss')
const settingsImport = '@import "node_modules/@defra/frontend/src/settings";'
const settings = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : ''
if (!settings.includes(settingsImport)) {
  writeFileSync(settingsPath,
`// Defra tokens. This file is imported by the kit BEFORE govuk-frontend, which
// is the only point at which these settings can take effect.
${settingsImport}

${settings}`.trimEnd() + '\n')
}

const appPath = join(sassDir, 'application.scss')
const appImport = '@import "node_modules/@defra/frontend/src/post";'
const application = existsSync(appPath) ? readFileSync(appPath, 'utf8') : ''
if (!application.includes(appImport)) {
  writeFileSync(appPath,
`${application.trimEnd()}

// Defra components and overrides. Imported after govuk-frontend, which the kit
// compiles as a plugin.
${appImport}
`)
}

// --- Layout ----------------------------------------------------------------
// Point the prototype's own layout at the Defra one. This is the licence
// boundary, not decoration: the kit's default layout renders the GOV.UK
// header and a footer asserting the Royal Arms and the Open Government
// Licence, which a service outside the GOV.UK proposition may not use.
const layoutDir = join(dir, 'app', 'views', 'layouts')
mkdirSync(layoutDir, { recursive: true })
writeFileSync(join(layoutDir, 'main.html'),
`{#
  Extends the Defra layout, which replaces the GOV.UK header and footer with
  Defra chrome. Services on *.service.gov.uk should extend
  "govuk-prototype-kit/layouts/govuk-branded.njk" instead — the choice is a
  licence boundary, not a preference.
#}
{% extends "defra/prototype-kit/layouts/defra.html" %}
`)

// --- README ----------------------------------------------------------------
// Written into the prototype because the person who opens this folder in three
// months, or the colleague who inherits it, will not have this terminal output.
writeFileSync(join(dir, 'README.md'),
`# ${name}

A Defra prototype, built with the [GOV.UK Prototype Kit](https://prototype-kit.service.gov.uk/)
and [Defra Frontend](https://defra-design.github.io/defra-frontend/docs/).

## Running it

\`\`\`
npm start
\`\`\`

Then open http://localhost:3000

## Making pages

Create HTML files in \`app/views\`. A file at \`app/views/apply/name.html\`
is served at \`/apply/name\`.

Defra page templates are available under **Create a new page** at
http://localhost:3000/manage-prototype

## Important

This is a prototype. It is not a real service:

- do not put real personal data in it
- it is not accessible-tested or security-tested
- Defra Frontend is a work in progress and is not approved for live services

## Getting help

- [Prototype Kit documentation](https://prototype-kit.service.gov.uk/docs)
- [Defra Frontend documentation](https://defra-design.github.io/defra-frontend/docs/)
- [Defra Frontend components](https://defra-design.github.io/defra-frontend/)
`)

// --- Git -------------------------------------------------------------------
// Initialised here so the first thing a designer does is not "work out git".
// A prototype that is not in version control is one accidental delete from
// gone, and cannot be shared or handed over.
if (tryRun('git', ['--version'])) {
  if (!existsSync(join(dir, '.git'))) {
    tryRun('git', ['init', '-b', 'main'])
    tryRun('git', ['add', '-A'])
    tryRun('git', ['commit', '-m', 'Create prototype'])
  }
} else {
  console.log('\nGit is not installed, so this prototype has not been put into version control.')
  console.log('That is fine for now — see the docs when you want to share it.\n')
}

console.log(`
────────────────────────────────────────────────────────────────────────

Your prototype is ready.

To start it, copy and run these two lines:

  cd ${name}
  npm start

Then open http://localhost:3000 in your browser.

To stop it, come back to this terminal and press Ctrl and C together.

WHAT TO DO NEXT

  Make a page      Create an HTML file in app/views. A file at
                   app/views/apply/name.html appears at /apply/name

  Use a template   Go to http://localhost:3000/manage-prototype and choose
                   "Create a new page" — Defra start, question and check
                   answers pages are in the list

  Share it         See "Putting your prototype on GitHub" at
                   https://defra-design.github.io/defra-frontend/docs/prototyping/

A README.md has been added to the folder with all of this in it, so you do not
need to keep this terminal open.

REMEMBER

This is a prototype, not a real service. Do not put real personal data in it.
Defra Frontend is a work in progress and is not approved for live services.

────────────────────────────────────────────────────────────────────────
`)
