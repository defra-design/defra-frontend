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

console.log('\nCreating the GOV.UK Prototype Kit\n')
run('npx', ['govuk-prototype-kit', 'create', dir], process.cwd())

console.log('\nAdding GOV.UK Frontend 6 and Defra Frontend\n')
// Installed at the project root on purpose: the kit resolves plugin paths
// from there, so this is the copy the kit compiles.
run('npm', ['install', GOVUK_FRONTEND, DEFRA_FRONTEND, '--save'])

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

console.log(`
Done.

  cd ${name}
  npm start

Then open http://localhost:3000

Defra page templates are available under "Create a new page" in the kit's
manage-prototype screens.

This library is a work in progress and is not approved for use in a live
service. Colour and typeface values are placeholders.
`)
