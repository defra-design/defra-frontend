#!/usr/bin/env node
/**
 * Create a Defra-themed GOV.UK Prototype Kit prototype.
 *
 *   npx @defra-design/create-prototype my-service   create a prototype
 *   npx @defra-design/create-prototype --update     update the one you are in
 *
 * --update brings an existing prototype up to the current release and reports
 * what changed. It also migrates prototypes made before this package was
 * published, which installed a vendored tarball under the old @defra scope.
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
 *   2. @defra-design/frontend, which is itself a kit plugin (the same pattern
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

import { readdirSync, rmSync } from 'node:fs'

const GOVUK_FRONTEND = 'govuk-frontend@^6.4.0'
const DEFRA_FRONTEND_NAME = '@defra-design/frontend'
// `@latest` rather than a caret range. On 0.x a caret is narrow — ^0.1.0 stops
// at 0.2.0 — so a range here would quietly refuse to bring --update forward
// across exactly the releases it exists to deliver. npm still records a caret
// range in package.json from whatever it installs.
const DEFRA_FRONTEND = `${DEFRA_FRONTEND_NAME}@latest`

// The name used before this package was published. Prototypes created then
// carry it as a `file:vendor/*.tgz` dependency, and their sass imports point
// into its node_modules path.
const LEGACY_NAME = '@defra/frontend'

const sassImports = (pkgName) => ({
  settings: `@import "node_modules/${pkgName}/src/settings";`,
  post: `@import "node_modules/${pkgName}/src/post";`
})

const args = process.argv.slice(2)
const isUpdate = args.includes('--update')
const name = args.find((a) => !a.startsWith('--'))

if (!isUpdate && !name) {
  console.error(`
Usage:
  npx @defra-design/create-prototype <directory>   create a new prototype
  npx @defra-design/create-prototype --update      update the prototype you are in
`)
  process.exit(1)
}

// Update runs against an existing prototype, which is normally the directory
// the person is standing in.
const dir = resolve(process.cwd(), name ?? '.')
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

// Where does @defra-design/frontend come from?
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

const onNpm = spawnSync('npm', ['view', DEFRA_FRONTEND_NAME, 'version'], {
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

  npx github:defra-design/defra-frontend ${name ?? '<directory>'}

or:

  git clone https://github.com/defra-design/defra-frontend.git
  node defra-frontend/packages/create-prototype/bin/create.mjs ${name ?? '<directory>'}
`)
  process.exit(1)
}

/** The installed version in a prototype, or null if it has none. */
function installedVersion (prototypeDir, pkgName = DEFRA_FRONTEND_NAME) {
  const p = join(prototypeDir, 'node_modules', ...pkgName.split('/'), 'package.json')
  try {
    return JSON.parse(readFileSync(p, 'utf8')).version
  } catch {
    return null
  }
}

/**
 * Install or re-install Defra Frontend into a prototype.
 *
 * From npm when it is published; otherwise packed from this checkout into the
 * prototype's own `vendor` folder. The tarball is deliberate: a `file:` path
 * records an absolute path from the machine that made it, so the prototype
 * would break the moment a colleague cloned it. A tarball travels with it.
 */
function installDefraFrontend (prototypeDir) {
  if (onNpm) {
    run('npm', ['install', GOVUK_FRONTEND, DEFRA_FRONTEND, '--save'], prototypeDir)
    return
  }

  const vendor = join(prototypeDir, 'vendor')
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

  // Clear out tarballs from previous versions. Left alone they accumulate in
  // the prototype's git history, and a stale one is easy to install by
  // mistake when the version number has not changed.
  for (const file of readdirSync(vendor)) {
    if (file.endsWith('.tgz') && file !== tarball) {
      rmSync(join(vendor, file))
    }
  }

  run('npm', ['install', GOVUK_FRONTEND, `./vendor/${tarball}`, '--save'], prototypeDir)
}

/**
 * Move a prototype off the old @defra scope.
 *
 * This has to happen, and happen before the new package is installed, because
 * the failure otherwise is silent rather than loud. The sass imports name a
 * node_modules path, so a prototype left half-migrated still has the old
 * package on disk, still compiles, and still looks right — while ignoring
 * every change the update just installed. A prototype that visibly broke
 * would be the better outcome; this is worse, so it is handled rather than
 * documented.
 *
 * Returns a list of what it did, for the report at the end.
 */
function migrateFromLegacyScope (prototypeDir, pkg) {
  const done = []
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  if (!deps[LEGACY_NAME]) return done

  // The two files the kit reserves for user settings and user application.
  // Only the exact import line this script wrote is replaced — anything else
  // in these files is the designer's own and is left alone.
  const legacy = sassImports(LEGACY_NAME)
  const current = sassImports(DEFRA_FRONTEND_NAME)
  const sassDir = join(prototypeDir, 'app', 'assets', 'sass')

  for (const [key, file] of [['settings', 'settings.scss'], ['post', 'application.scss']]) {
    const path = join(sassDir, file)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    if (!text.includes(legacy[key])) continue
    writeFileSync(path, text.split(legacy[key]).join(current[key]))
    done.push(`repointed the import in app/assets/sass/${file}`)
  }

  run('npm', ['uninstall', LEGACY_NAME], prototypeDir)
  done.push(`removed the old ${LEGACY_NAME} dependency`)

  // The vendored tarball existed only because there was nothing to install
  // from. Once there is, it is dead weight sitting in the prototype's git
  // history. Only when installing from npm, though: running from a clone,
  // installDefraFrontend repacks into this same folder immediately after, so
  // deleting it here would report a removal that did not survive the next step.
  if (onNpm) {
    const vendor = join(prototypeDir, 'vendor')
    if (existsSync(vendor)) {
      for (const file of readdirSync(vendor)) {
        if (file.endsWith('.tgz')) rmSync(join(vendor, file))
      }
      if (readdirSync(vendor).length === 0) {
        rmSync(vendor, { recursive: true })
        done.push('deleted the vendor folder, which is no longer needed')
      } else {
        done.push('deleted the vendored tarballs, which are no longer needed')
      }
    }
  }

  return done
}

// --- Update mode -----------------------------------------------------------
// A prototype vendors a copy of Defra Frontend, so fixes in this repository do
// not reach it by themselves. This is the path that brings one up to date.
if (isUpdate) {
  const pkgPath = join(dir, 'package.json')
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : null
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }

  if (!pkg || !deps['govuk-prototype-kit']) {
    console.error(`
This does not look like a prototype.

Run the command from inside your prototype folder — the one containing
package.json and an app folder:

  cd my-service
  npx @defra-design/create-prototype --update
`)
    process.exit(1)
  }

  const before = installedVersion(dir) ?? installedVersion(dir, LEGACY_NAME)
  console.log(`\nUpdating Defra Frontend in ${pkg.name || dir}\n`)
  const migrated = migrateFromLegacyScope(dir, pkg)
  installDefraFrontend(dir)
  const after = installedVersion(dir)

  // The workarounds people wrote while these were broken now do nothing, or
  // worse, duplicate what the package does. Point at them rather than editing
  // someone's prototype from under them.
  const layout = join(dir, 'app', 'views', 'layouts', 'main.html')
  const layoutText = existsSync(layout) ? readFileSync(layout, 'utf8') : ''
  const leftovers = []
  if (/initAll\s*\(/.test(layoutText)) {
    leftovers.push('a call to initAll() — the plugin now starts its own components')
  }
  if (/type="submit"[^>]*(hidden|visually-hidden)/.test(layoutText)) {
    leftovers.push('a hidden submit button — add-another now guards Enter itself')
  }

  console.log(`
────────────────────────────────────────────────────────────────────────

Updated${before && after ? ` from ${before} to ${after}` : ''}.
`)

  if (migrated.length) {
    console.log(`${onNpm
      ? `Defra Frontend is now published to npm, so this prototype no longer
carries its own copy. Moved it across:`
      : `Defra Frontend has moved to the ${DEFRA_FRONTEND_NAME} package name.
Moved this prototype across:`}

${migrated.map((m) => `  - ${m}`).join('\n')}

Commit those changes with the rest of your work.
`)
  }

  console.log(`Restart your prototype to pick it up:

  npm start
`)

  if (leftovers.length) {
    console.log(`You can now remove from app/views/layouts/main.html:
${leftovers.map((l) => `  - ${l}`).join('\n')}

Unless you have changed it for other reasons, that file can go back to one
line:

  {% extends "defra/prototype-kit/layouts/defra.html" %}
`)
  }

  console.log('────────────────────────────────────────────────────────────────────────\n')
  process.exit(0)
}

console.log('\nCreating the GOV.UK Prototype Kit\n')
run('npx', ['govuk-prototype-kit', 'create', dir], process.cwd())

console.log('\nAdding GOV.UK Frontend 6 and Defra Frontend\n')
if (!onNpm) {
  console.log('Using the local copy of Defra Frontend — it is not published yet.\n')
}
// Installed at the project root on purpose: the kit resolves plugin paths
// from there, so this is the copy the kit compiles.
installDefraFrontend(dir)

// --- Sass wiring -----------------------------------------------------------
// Paths are relative to the project root because the kit compiles sass with
// loadPaths: [projectDir].
const sassDir = join(dir, 'app', 'assets', 'sass')
mkdirSync(sassDir, { recursive: true })

const settingsPath = join(sassDir, 'settings.scss')
const settingsImport = sassImports(DEFRA_FRONTEND_NAME).settings
const settings = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : ''
if (!settings.includes(settingsImport)) {
  writeFileSync(settingsPath,
`// Defra tokens. This file is imported by the kit BEFORE govuk-frontend, which
// is the only point at which these settings can take effect.
${settingsImport}

${settings}`.trimEnd() + '\n')
}

const appPath = join(sassDir, 'application.scss')
const appImport = sassImports(DEFRA_FRONTEND_NAME).post
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
