#!/usr/bin/env node
/**
 * Create a Defra-themed GOV.UK Prototype Kit prototype.
 *
 *   npx defra-create-prototype my-service   create a prototype
 *   npx defra-create-prototype --update     update the one you are in
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
 *   2. defra-frontend, which is itself a kit plugin (the same pattern
 *      govuk-frontend uses — it ships its own kit config).
 *   3. Two sass imports in the files the kit reserves for exactly this. The
 *      kit imports user settings BEFORE plugins and user application AFTER,
 *      which is the only ordering in which a token layer can work: settings
 *      must reach govuk-frontend before it compiles.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, cpSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { homedir } from 'node:os'

import { readdirSync, rmSync } from 'node:fs'

// Where prototypes go unless told otherwise.
//
// Previously they landed in whatever directory the terminal happened to be in,
// which for someone who does not think in working directories means they end up
// scattered and hard to find again. One place also makes --update findable:
// "the folder in here" is an instruction that works, where "the folder you were
// in when you ran it last month" is not.
const PROTOTYPES_DIR = join(homedir(), 'Defra prototypes')

// Each prototype gets its own port, so two can run at once — which is the
// point of having a current and a future version to compare.
//
// Spacing is not arbitrary. The kit binds a second port at `port - 50` for its
// live reload proxy (see listen-on-port.js), so anything closer than that would
// put one prototype's proxy on another's main port, and the collision would
// look like a mysterious failure to start rather than a port clash.
//
// 3000 is left alone: it is the kit's default, and every prototype made before
// this still uses it.
const PORT_BASE = 4000
const PORT_STEP = 100

/** The port recorded in a prototype's config, or null. */
const portOf = (prototypeDir) => {
  try {
    const config = JSON.parse(readFileSync(join(prototypeDir, 'app', 'config.json'), 'utf8'))
    return typeof config.port === 'number' ? config.port : null
  } catch {
    return null
  }
}

/** The lowest port in the series that no prototype in the shared folder uses. */
const freePort = () => {
  const taken = new Set()
  try {
    for (const entry of readdirSync(PROTOTYPES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const port = portOf(join(PROTOTYPES_DIR, entry.name))
      if (port) taken.add(port)
    }
  } catch { /* no shared folder yet, so nothing is taken */ }

  for (let port = PORT_BASE; port < PORT_BASE + PORT_STEP * 60; port += PORT_STEP) {
    if (!taken.has(port)) return port
  }
  // Sixty prototypes in one folder is a different problem. Fall back to the
  // kit's default rather than inventing a port that might collide.
  return 3000
}

const GOVUK_FRONTEND = 'govuk-frontend@^6.4.0'
const DEFRA_FRONTEND_NAME = 'defra-frontend'
// `@latest` rather than a caret range. On 0.x a caret is narrow — ^0.1.0 stops
// at 0.2.0 — so a range here would quietly refuse to bring --update forward
// across exactly the releases it exists to deliver. npm still records a caret
// range in package.json from whatever it installs.
const DEFRA_FRONTEND = `${DEFRA_FRONTEND_NAME}@latest`

// The name used before this package was published. Prototypes created then
// carry it as a `file:vendor/*.tgz` dependency, and their sass imports point
// into its node_modules path.
// Names this package has had before. `@defra/frontend` was the vendored tarball
// used before anything was published; `@defra-design/frontend` existed only
// between preparing a scoped release and finding that the scope could not be
// created, so few prototypes will carry it — but checking costs nothing and the
// failure it prevents is silent. Newest first.
const LEGACY_NAMES = ['@defra-design/frontend', '@defra/frontend']

const sassImports = (pkgName) => ({
  settings: `@import "node_modules/${pkgName}/src/settings";`,
  post: `@import "node_modules/${pkgName}/src/post";`
})

const args = process.argv.slice(2)
const isUpdate = args.includes('--update')
// Forces the local checkout over the published package. Needed since the
// release: npm is preferred whenever `npm view` succeeds, which it now always
// does, so a contributor testing an unreleased change in a real kit would get
// the published version and conclude their fix did not work. Exactly the kind
// of silent wrong answer that makes a kit bug expensive to find.
const isLocal = args.includes('--local')
// Put the prototype in the current directory rather than the shared folder.
const isHere = args.includes('--here')
// Split the prototype you are in into two variants that run side by side.
const isVariants = args.includes('--variants')
// List every prototype in the shared folder, with what differs between versions.
const isDashboard = args.includes('--dashboard')
// Ask a published prototype whether it is actually password protected.
const isCheck = args.includes('--check')
const flagValue = (flag) => {
  const prefix = `--${flag}=`
  const inline = args.find((a) => a.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const i = args.indexOf(`--${flag}`)
  return i !== -1 ? args[i + 1] : undefined
}
// The positional name, ignoring anything that is really a flag's value —
// otherwise `--dir ~/somewhere` would be read as the prototype's name.
const flagValues = ['service-name', 'dir', 'check'].map(flagValue).filter(Boolean)
const argName = args.find((a) => !a.startsWith('--') && !flagValues.includes(a))

// Flags so the questions below can be skipped. The prompts are for designers;
// these are for anyone scripting it, and for the live instruction check, which
// has no terminal to answer with.
const flags = {
  serviceName: flagValue('service-name'),
  govuk: args.includes('--govuk'),
  defra: args.includes('--defra')
}

// Prompting is only safe when someone is there to answer. Without a terminal —
// in CI, or piped — a prompt would hang forever with no indication why, so the
// usage message stays the behaviour there.
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

// --- Check a published prototype -------------------------------------------
// The one thing documentation cannot do: confirm the password is actually on.
//
// PASSWORD without NODE_ENV=production is ignored, so a prototype can publish,
// look entirely correct, and be open to anyone with the address. Nothing about
// the deploy says so. A protected prototype redirects to
// /manage-prototype/password, so asking from outside gives a real answer rather
// than a reassuring one.
if (isCheck) {
  const target = flagValue('check') ?? argName
  if (!target) {
    console.error(`
Give the address of your published prototype:

  npx defra-create-prototype --check https://my-service.up.railway.app
`)
    process.exit(1)
  }

  const url = /^https?:\/\//.test(target) ? target : `https://${target}`
  console.log(`\nChecking ${url}\n`)

  // Redirects are followed by hand rather than by fetch, because the two that
  // matter have to be told apart.
  //
  // A protected prototype redirects to /manage-prototype/password. But in
  // production mode the kit also redirects http to https (server.js,
  // forceHttps), and letting fetch follow that blindly against a local
  // prototype produces "fetch failed" — which reads as "your prototype is
  // down" when it is in fact protected and working. Walking the chain lets the
  // password redirect be recognised before anything is followed, and lets an
  // unreachable https upgrade be reported as what it is.
  let current = url
  let response
  let upgradedToHttps = false

  for (let hop = 0; hop < 5; hop++) {
    try {
      response = await fetch(current, { redirect: 'manual' })
    } catch (error) {
      console.error(upgradedToHttps
        ? `It redirected to ${current} and that address could not be reached.

Redirecting to https is what the kit does when NODE_ENV is production, so this
is a good sign — but check the https address rather than the http one:

  npx defra-create-prototype --check ${current}
`
        : `Could not reach it: ${error.message}

Check the address, and that the prototype is actually running.
`)
      process.exit(1)
    }

    const location = response.status >= 300 && response.status < 400 &&
      response.headers.get('location')
    if (!location) break

    const next = new URL(location, current)
    if (next.pathname.startsWith('/manage-prototype/password')) {
      response = { ok: true, askedForPassword: true }
      break
    }
    if (next.protocol === 'https:' && new URL(current).protocol === 'http:') {
      upgradedToHttps = true
    }
    current = next.href
  }

  const askedForPassword = response.askedForPassword === true

  if (askedForPassword) {
    console.log(`PROTECTED — it asks for a password.

Share the address and the password with participants. Nothing else to do.
`)
    process.exit(0)
  }

  if (!response.ok) {
    console.log(`The server answered ${response.status}, so this could not be checked.

That usually means the prototype is not running, rather than that it is
unprotected. Fix the deploy, then check again.
`)
    process.exit(1)
  }

  console.error(`NOT PROTECTED — it served the prototype without asking for anything.

Anyone with this address can see it, and it looks like a real Defra service to
whoever finds it.

Almost always this is NODE_ENV. A password on its own does nothing. In your
hosting service's variables, set BOTH:

  NODE_ENV = production
  PASSWORD = whatever you are giving participants

Then deploy again and run this check once more.
`)
  process.exit(1)
}

// --- Dashboard -------------------------------------------------------------
// Separate from everything else: it reads, writes one file, and touches no
// prototype. Kept in its own module because it is a different job from making
// and updating prototypes, and this file is long enough.
if (isDashboard) {
  const { buildDashboard } = await import('./dashboard.mjs')
  // --dir reads somewhere else. Prototypes made before the shared folder
  // existed are scattered, often in a folder of git repositories, and the
  // dashboard is most useful when it can see those too.
  const scanDir = flagValue('dir')
    ? resolve(process.cwd(), flagValue('dir'))
    : PROTOTYPES_DIR
  const { path, found } = buildDashboard(scanDir, PROTOTYPES_DIR)

  const withVariants = found.filter((p) => p.hasVariants)
  console.log(`
${found.length} prototype${found.length === 1 ? '' : 's'} in ${scanDir}${
  withVariants.length ? `, ${withVariants.length} with versions` : ''}

  ${path}
`)
  if (found.length === 0) {
    console.log(`Nothing there yet. Make one with:

  npx defra-create-prototype

Or point it at prototypes you already have:

  npx defra-create-prototype --dashboard --dir ~/Documents/GitHub
`)
  }
  // Opening it is a convenience, not the point — the path above is the output,
  // so a machine with no handler for html files still gets a usable answer.
  // Called directly rather than through tryRun, which is defined further down:
  // this block runs before it exists, and a const is not hoisted.
  const opener = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawnSync(opener, [path], { stdio: 'ignore', shell: process.platform === 'win32' })
  process.exit(0)
}

if (!isUpdate && !isVariants && !argName && !interactive) {
  console.error(`
Usage:
  npx defra-create-prototype <name>        create a new prototype
  npx defra-create-prototype --update      update the prototype you are in
  npx defra-create-prototype --variants    split it into current and future

Run it without a name in a terminal and it will ask.

  --here                  create it here instead of in ${PROTOTYPES_DIR}
  --service-name "<text>" the name shown in the header
  --govuk | --defra       which header and footer, if not asking
  --local                 use this checkout instead of the published package,
                          for testing a change before it is released
`)
  process.exit(1)
}

// Update runs against an existing prototype, which is normally the directory
// the person is standing in. Create reassigns this once the name is known,
// which may be after asking — `run` reads it at call time, so both work.
let name = argName
let dir = resolve(process.cwd(), argName ?? '.')
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

// Where does defra-frontend come from?
//
// Two sources, checked in order, so the same command works for a designer and
// for someone testing an unreleased change:
//
//   1. npm, which is normally what you want.
//   2. the checkout this script is running from — a git clone, or
//      `npx github:defra-design/defra-frontend`. The package sits two
//      directories up from here, so it can be packed and installed directly.
//      Reached by --local, or when npm cannot be read at all (offline).
//
// The local route installs a packed tarball rather than a `file:` path on
// purpose. A `file:` dependency records an absolute path from the machine that
// made it, so the prototype would break the moment a colleague cloned it. A
// tarball committed inside the prototype travels with it.
const selfRoot = fileURLToPath(new URL('../../../', import.meta.url))
const localPackage = join(selfRoot, 'packages', 'defra-frontend')

// Asked once, and only when something is actually going to be installed.
//
// This used to run at module load, so every invocation paid for a network
// round trip to the registry — including --check, --dashboard and --variants,
// none of which install anything. Besides being slow for no reason, it made
// those commands fail or hang on a machine with no network, which is a strange
// way for "is my published prototype protected?" to behave.
let npmAnswer
const onNpm = () => {
  if (npmAnswer === undefined) {
    npmAnswer = !isLocal && spawnSync('npm', ['view', DEFRA_FRONTEND_NAME, 'version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32'
    }).status === 0
  }
  return npmAnswer
}

const hasLocal = existsSync(join(localPackage, 'package.json'))

/**
 * Called only by the paths that install something. It asks npm, so it belongs
 * where an install is about to happen rather than at module load.
 */
const requireASource = () => {
  if (onNpm() || hasLocal) return
  console.error(isLocal
    ? `
Cannot find a local copy of Defra Frontend.

--local installs from the checkout this script is running from, but it is not
running from one. Clone the repository and run the script from inside it:

  git clone https://github.com/defra-design/defra-frontend.git
  node defra-frontend/packages/create-prototype/bin/create.mjs --local ${name ?? '<directory>'}

Or drop --local to install the published package.
`
    : `
Cannot reach npm, and this script is not running from a copy of the
defra-frontend repository, so there is nowhere to install from.

Check your connection and try again. If you are working offline, run it from a
clone instead:

  git clone https://github.com/defra-design/defra-frontend.git
  node defra-frontend/packages/create-prototype/bin/create.mjs --local ${name ?? '<directory>'}
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
  requireASource()
  if (onNpm()) {
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
  const stale = LEGACY_NAMES.filter((n) => deps[n])
  if (stale.length === 0) return done

  const current = sassImports(DEFRA_FRONTEND_NAME)
  const sassDir = join(prototypeDir, 'app', 'assets', 'sass')

  // The two files the kit reserves for user settings and user application.
  // Only the exact import line this script wrote is replaced — anything else
  // in these files is the designer's own and is left alone.
  for (const [key, file] of [['settings', 'settings.scss'], ['post', 'application.scss']]) {
    const path = join(sassDir, file)
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    let text = before
    for (const name of stale) {
      text = text.split(sassImports(name)[key]).join(current[key])
    }
    if (text === before) continue
    writeFileSync(path, text)
    done.push(`repointed the import in app/assets/sass/${file}`)
  }

  for (const name of stale) {
    run('npm', ['uninstall', name], prototypeDir)
    done.push(`removed the old ${name} dependency`)
  }

  // The vendored tarball existed only because there was nothing to install
  // from. Once there is, it is dead weight sitting in the prototype's git
  // history. Only when installing from npm, though: running from a clone,
  // installDefraFrontend repacks into this same folder immediately after, so
  // deleting it here would report a removal that did not survive the next step.
  if (onNpm()) {
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
  npx defra-create-prototype --update
`)
    process.exit(1)
  }

  // Update means update, not convert.
  //
  // Without this, --update in a prototype that never used Defra Frontend would
  // install it and raise govuk-frontend to 6 — from 4.x or 5.x in most existing
  // prototypes. That is up to three majors of breaking changes applied to
  // someone's working research prototype by a command whose name promises the
  // opposite, and `npm install` would report success while the pages broke.
  //
  // Found by looking at real prototypes on a designer's machine: eighteen of
  // them, every one on kit 13 with govuk-frontend 4.x or 5.x, and not one with
  // Defra Frontend installed. The guard is not hypothetical.
  const installed = [DEFRA_FRONTEND_NAME, ...LEGACY_NAMES].filter((n) => deps[n])
  if (installed.length === 0) {
    console.error(`
This prototype does not use Defra Frontend, so there is nothing to update.

  ${pkg.name || dir}
  govuk-prototype-kit ${deps['govuk-prototype-kit']}
  govuk-frontend ${deps['govuk-frontend'] ?? '(not declared)'}

Adding Defra Frontend here is not a small change. It needs GOV.UK Frontend 6,
which is ahead of the version above. That upgrade would change markup and
styling across every page you have built, and --update will not do that to
your work behind your back.

If you want a Defra-themed prototype, make a new one and move your pages into
its app/views folder:

  npx defra-create-prototype my-service
`)
    process.exit(1)
  }

  // Prototypes made before ports were assigned all sit on 3000, so only one
  // can run at a time — which defeats comparing two side by side. Update is
  // the natural place to give one its own port, and it only ever adds a value
  // that was not there.
  let assignedPort = null
  if (dir.startsWith(PROTOTYPES_DIR) && portOf(dir) === null) {
    const configPath = join(dir, 'app', 'config.json')
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'))
        assignedPort = freePort()
        if (assignedPort !== 3000) {
          config.port = assignedPort
          writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
        } else {
          assignedPort = null
        }
      } catch {
        assignedPort = null
      }
    }
  }

  const before = installedVersion(dir) ??
    LEGACY_NAMES.map((n) => installedVersion(dir, n)).find(Boolean) ?? null
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
    console.log(`${onNpm()
      ? `Defra Frontend is now published to npm, so this prototype no longer
carries its own copy. Moved it across:`
      : `Defra Frontend has moved to the ${DEFRA_FRONTEND_NAME} package name.
Moved this prototype across:`}

${migrated.map((m) => `  - ${m}`).join('\n')}

Commit those changes with the rest of your work.
`)
  }

  if (assignedPort) {
    console.log(`This prototype now runs on its own port, ${assignedPort}, so it can be open at
the same time as another one.

  http://localhost:${assignedPort}
`)
  }

  console.log(`Restart your prototype to pick it up:

  npm run dev
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

// --- Variants --------------------------------------------------------------
// Two states of the same service, running side by side, for showing a
// participant how something works now and how it might work.
//
// One prototype with two route trees, not two prototypes. Two folders would
// mean two servers on two ports, two terminal windows, and every shared fix —
// a typo in the header, a change to the styles — done twice, with the drift
// that follows. One prototype gives both states the same layout and components,
// so a fix lands in both, and both are reachable from one `npm run dev`:
//
//   localhost:3000/current/...    localhost:3000/future/...
//
// The cost is that existing page URLs change, which is why this asks for a
// clean git tree first: it is a restructure of someone's work and they need to
// be able to undo it.
if (isVariants) {
  const VARIANTS = ['current', 'future']

  // Paths that must not be prefixed when links are rewritten. These are served
  // by the kit or by plugins, not by the prototype's own pages, so prefixing
  // them breaks images, stylesheets and the kit's own management pages.
  const NOT_PAGES = ['public', 'assets', 'plugin-assets', 'extension-assets', 'manage-prototype']

  const pkgPath = join(dir, 'package.json')
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : null
  if (!pkg || !{ ...pkg.dependencies, ...pkg.devDependencies }['govuk-prototype-kit']) {
    console.error(`
This does not look like a prototype.

Run the command from inside your prototype folder:

  cd "${PROTOTYPES_DIR}/my-service"
  npx defra-create-prototype --variants
`)
    process.exit(1)
  }

  const viewsDir = join(dir, 'app', 'views')
  if (!existsSync(viewsDir)) {
    console.error('\nThis prototype has no app/views folder, so there are no pages to split.\n')
    process.exit(1)
  }

  if (VARIANTS.some((v) => existsSync(join(viewsDir, v)))) {
    console.error(`
This prototype already has variants.

  app/views/current   and   app/views/future

Add pages to whichever you are changing. There is nothing more to set up.
`)
    process.exit(1)
  }

  // Moving someone's pages around is not something to do without an undo.
  const inGit = tryRun('git', ['rev-parse', '--git-dir'])
  const clean = inGit && spawnSync('git', ['status', '--porcelain'], {
    cwd: dir, encoding: 'utf8', shell: process.platform === 'win32'
  }).stdout.trim() === ''
  if (!inGit || !clean) {
    console.error(`
${inGit
  ? 'You have changes that are not saved to git yet.'
  : 'This prototype is not in version control.'}

This moves your pages into a new folder and rewrites links inside them. If it
gets something wrong you will want to undo it, and that needs a clean starting
point.

${inGit
  ? 'Save your work first:\n\n  git add -A\n  git commit -m "Before adding variants"'
  : 'Put it in version control first:\n\n  git init -b main\n  git add -A\n  git commit -m "Before adding variants"'}
`)
    process.exit(1)
  }

  /**
   * Prefix the prototype's own links so they stay inside their variant.
   *
   * Kit pages link with absolute paths — href="/task-list" — so a page moved
   * into current/ would otherwise link straight out of its own variant and into
   * the other one's territory. Only href and action are touched, only when the
   * path is the prototype's own, and never for assets or the kit's own pages.
   */
  const prefixLinks = (html, variant) =>
    html.replace(/\b(href|action)="\/([^"]*)"/g, (whole, attr, path) => {
      const first = path.split(/[/?#]/)[0]
      if (NOT_PAGES.includes(first)) return whole
      return `${attr}="/${variant}/${path}"`
    })

  /** Every .html and .njk file under a directory. */
  const pagesIn = (root) => {
    const found = []
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (/\.(html|njk)$/.test(entry.name)) found.push(p)
      }
    }
    walk(root)
    return found
  }

  const [current, future] = VARIANTS.map((v) => join(viewsDir, v))

  // Everything except layouts, which both variants share — that sharing is the
  // reason for doing this in one prototype rather than two.
  const toMove = readdirSync(viewsDir, { withFileTypes: true })
    .filter((e) => e.name !== 'layouts')
    .map((e) => e.name)

  mkdirSync(current, { recursive: true })
  for (const entry of toMove) {
    renameSync(join(viewsDir, entry), join(current, entry))
  }
  cpSync(current, future, { recursive: true })

  let rewritten = 0
  for (const variant of VARIANTS) {
    for (const page of pagesIn(join(viewsDir, variant))) {
      const before = readFileSync(page, 'utf8')
      const after = prefixLinks(before, variant)
      if (after !== before) {
        writeFileSync(page, after)
        rewritten++
      }
    }
  }

  // A landing page, so / still works and a research session has one link to
  // open rather than two to remember.
  writeFileSync(join(viewsDir, 'index.html'),
`{% extends "layouts/main.html" %}

{% set pageName = "Choose a version" %}

{% block content %}
<div class="govuk-grid-row">
  <div class="govuk-grid-column-two-thirds">
    <h1 class="govuk-heading-l">{{ serviceName }}</h1>
    <p class="govuk-body">Two versions of this service, for comparing in research.</p>
    <ul class="govuk-list">
      <li><a class="govuk-link" href="/current/">Current state</a> — how it works today</li>
      <li><a class="govuk-link" href="/future/">Future state</a> — how it might work</li>
    </ul>
    <p class="govuk-body-s">
      This page is for you, not for participants. Send them straight to one of
      the links above.
    </p>
  </div>
</div>
{% endblock %}
`)

  // Prototypes made before ports were assigned still use the kit's default.
  const variantPort = portOf(dir) ?? 3000

  console.log(`
────────────────────────────────────────────────────────────────────────

Your prototype now has two versions.

  app/views/current    how it works today
  app/views/future     how it might work, starting as a copy of current

Both run from the one prototype, so they share the layout, the styles and the
components — fix something once and it changes in both.

  npm run dev

  localhost:${variantPort}/current/    localhost:${variantPort}/future/
  localhost:${variantPort}            a page linking to both

Your pages moved into current, and ${rewritten} of them had links updated to stay
inside their own version. Check a couple of journeys before you rely on it, and
if anything looks wrong:

  git checkout .

Then tell us what it got wrong, because it will be wrong the same way for
everyone else.

────────────────────────────────────────────────────────────────────────
`)
  process.exit(0)
}

// --- Questions -------------------------------------------------------------
// Asked rather than configured. The brand mode especially: it is a licence
// boundary, and leaving it as a Sass variable meant the default silently
// decided it for everyone. A question gets it right at the point someone knows
// the answer.

/** A folder name that will survive git, Windows and a URL. */
const toFolderName = (input) => input
  .trim()
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)

let serviceName = flags.serviceName
// --govuk and --defra are the non-interactive answers; neither means "ask".
let brandMode = flags.govuk ? 'govuk' : flags.defra ? 'defra' : undefined

if (interactive && (!name || !serviceName || !brandMode)) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  // Ctrl+D at a prompt makes readline throw AbortError. Unhandled that is a
  // Node stack trace, which is the worst possible thing to show someone who
  // has just decided to back out — and backing out of a prompt is a normal
  // thing to do, not an error.
  const cancelled = () => {
    rl.close()
    console.log('\n\nCancelled. Nothing has been created.\n')
    process.exit(1)
  }
  try {
    if (!name) {
      while (true) {
        const answer = await rl.question('\nWhat are you prototyping? For example, Register a water abstraction\n> ')
        if (!answer.trim()) {
          console.log('A name is needed to make the folder.')
          continue
        }
        serviceName = serviceName ?? answer.trim()
        name = toFolderName(answer)
        if (!name) {
          console.log('That name has no letters or numbers in it, so it cannot be a folder name.')
          continue
        }
        break
      }
    }

    if (!serviceName) {
      const answer = await rl.question(`\nName to show in the header? Press Enter for "${name}"\n> `)
      serviceName = answer.trim() || name
    }

    if (!brandMode) {
      // Worded around the address, not the brand, because the address is the
      // thing a designer knows and the licence follows from it rather than
      // from a preference. GDS Transport is licensed for service.gov.uk only.
      const answer = await rl.question('\nWill this service be on a service.gov.uk address? (y/N)\n> ')
      brandMode = /^y(es)?$/i.test(answer.trim()) ? 'govuk' : 'defra'
    }
  } catch (error) {
    if (error?.code === 'ABORT_ERR') cancelled()
    throw error
  } finally {
    rl.close()
  }
}

serviceName = serviceName ?? name
brandMode = brandMode ?? 'defra'

// Where it goes. A bare name goes in the shared folder; anything that looks
// like a path is taken literally, because someone who typed a path meant it.
const looksLikePath = name.includes('/') || name.includes(sep) ||
  name.startsWith('.') || name.startsWith('~')
if (looksLikePath) {
  // An explicit path is used exactly as written. Someone who typed one meant
  // it, and silently rewriting part of it would be worse than a space in a
  // folder name.
  dir = resolve(process.cwd(), name)
  name = dir.split(sep).pop()
} else {
  // A bare name is tidied whether it lands here or in the shared folder.
  // --here used to skip this, which produced folder names with spaces in them
  // — the thing that makes every later path need quoting.
  const folder = toFolderName(name)
  if (folder !== name) {
    console.log(`\nUsing the folder name "${folder}".`)
  }
  name = folder
  if (isHere) {
    dir = resolve(process.cwd(), name)
  } else {
    mkdirSync(PROTOTYPES_DIR, { recursive: true })
    dir = join(PROTOTYPES_DIR, name)
  }
}

// Refusing beats merging into whatever is already there. Someone re-running
// this because the first attempt looked wrong should not have the kit
// half-overwrite a prototype they have since put work into.
if (existsSync(dir) && readdirSync(dir).length > 0) {
  console.error(`
There is already something here:

  ${dir}

Pick a different name, or delete that folder if you do not need it.
`)
  process.exit(1)
}

console.log(`\nCreating your prototype in\n  ${dir}\n`)
run('npx', ['govuk-prototype-kit', 'create', dir], process.cwd())

console.log('\nAdding GOV.UK Frontend 6 and Defra Frontend\n')
if (!onNpm()) {
  console.log(isLocal
    ? 'Using this checkout of Defra Frontend, not the published package.\n'
    : 'Cannot reach npm — using the local copy of Defra Frontend.\n')
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
// The brand mode has to be set BEFORE the settings import, because the import
// is where it is read. Written out even for the default, so the file states
// which answer was given rather than leaving it implicit.
const brandModeLine = brandMode === 'govuk'
  ? `// On service.gov.uk: GOV.UK header and footer, and GDS Transport, which is
// licensed for this address only.
$defra-brand-mode: "govuk";`
  : `// Not on service.gov.uk: Defra header and footer, and a system font stack.
// GDS Transport must not be used outside *.service.gov.uk.
$defra-brand-mode: "defra";`
if (!settings.includes(settingsImport)) {
  writeFileSync(settingsPath,
`// Defra tokens. This file is imported by the kit BEFORE govuk-frontend, which
// is the only point at which these settings can take effect.
${brandModeLine}

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

// --- Service name ----------------------------------------------------------
// The kit ships a "Service name goes here" placeholder. Filling it means the
// prototype reads as the thing being tested from the first page load, rather
// than after someone finds the file.
const configPath = join(dir, 'app', 'config.json')
// Its own port goes here too. The kit reads `port` from this file
// (lib/config.js), so `npm run dev` picks it up with no env var and nothing
// for anyone to remember — which matters on Windows, where a PORT= prefix on
// the command would not work anyway.
let port = isHere ? 3000 : freePort()
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    config.serviceName = serviceName
    if (port !== 3000) config.port = port
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  } catch {
    // A kit that has changed this file's shape is not worth failing a whole
    // setup over — the prototype works, it just says "Service name goes here".
    console.log('Could not set the service name automatically; change it in app/config.json.')
    port = 3000
  }
} else {
  port = 3000
}

// --- Publishing settings ---------------------------------------------------
// Not read by anything locally — the kit does not use dotenv, so this file has
// no effect on `npm run dev`. It is here because Railway scans a repository
// root for .env.example and offers those variables during setup, which is the
// one documented hook for getting NODE_ENV in front of someone at the moment
// they are setting a password.
//
// That pairing is the whole point. PASSWORD on its own is silently ignored,
// and the prototype publishes unprotected (lib/authentication.js only installs
// the middleware when NODE_ENV is production). An empty PASSWORD alongside it
// fails safe: the kit serves an error page rather than the prototype.
writeFileSync(join(dir, '.env.example'),
`# Settings for publishing this prototype online. Your hosting service may call
# these "variables" or "config vars". They do nothing on your own machine.
#
# SET BOTH. A password on its own is ignored completely — the Prototype Kit
# only asks for one when NODE_ENV is production, so without this line your
# published prototype has no protection at all.
NODE_ENV=production

# The password you give to research participants. Not a secret worth
# protecting, but do not commit a real one here.
PASSWORD=
`)

// --- Layout ----------------------------------------------------------------
// Which header and footer, decided by the answer about the address. This is a
// licence boundary, not decoration: the GOV.UK layout renders the Royal Arms
// and asserts the Open Government Licence, which a service outside the GOV.UK
// proposition may not use — and the Defra layout drops GDS Transport, which is
// licensed for *.service.gov.uk only.
const layoutDir = join(dir, 'app', 'views', 'layouts')
mkdirSync(layoutDir, { recursive: true })
writeFileSync(join(layoutDir, 'main.html'), brandMode === 'govuk'
  ? `{#
  This service is on a service.gov.uk address, so it uses the GOV.UK header and
  footer and GDS Transport. Both are licensed for that address and must not be
  used off it — if the address changes, extend
  "defra/prototype-kit/layouts/defra.html" instead and set
  $defra-brand-mode to "defra" in app/assets/sass/settings.scss.
#}
{% extends "govuk-prototype-kit/layouts/govuk-branded.njk" %}
`
  : `{#
  This service is not on a service.gov.uk address, so it uses the Defra header
  and footer and a system font stack. The GOV.UK header, Royal Arms footer and
  GDS Transport are licensed for service.gov.uk and must not be used here — if
  the address changes, extend
  "govuk-prototype-kit/layouts/govuk-branded.njk" instead and set
  $defra-brand-mode to "govuk" in app/assets/sass/settings.scss.
#}
{% extends "defra/prototype-kit/layouts/defra.html" %}
`)

// --- README ----------------------------------------------------------------
// Written into the prototype because the person who opens this folder in three
// months, or the colleague who inherits it, will not have this terminal output.
writeFileSync(join(dir, 'README.md'),
`# ${serviceName}

A Defra prototype, built with the [GOV.UK Prototype Kit](https://prototype-kit.service.gov.uk/)
and [Defra Frontend](https://defra-design.github.io/defra-frontend/docs/).

${brandMode === 'govuk'
  ? 'Branded as GOV.UK, for a service on a `service.gov.uk` address.'
  : 'Branded as Defra, for a service that is not on a `service.gov.uk` address.'}
Changing that is a licence decision — see the comment in
\`app/views/layouts/main.html\`.

## Running it

\`\`\`
npm run dev
\`\`\`

Then open http://localhost:${port}

Use \`npm run dev\` and not \`npm start\`. Both exist in \`package.json\`, but
\`start\` is the command hosting services use — run locally it does not watch
your files, so your changes will not appear.

## Making pages

Create HTML files in \`app/views\`. A file at \`app/views/apply/name.html\`
is served at \`/apply/name\`.

Defra page templates are available under **Create a new page** at
http://localhost:${port}/manage-prototype

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

It is in ${dir}

To start it, copy and run these two lines:

  cd "${dir}"
  npm run dev

Then open http://localhost:${port} in your browser.

To stop it, come back to this terminal and press Ctrl and C together.

WHAT TO DO NEXT

  Make a page      Create an HTML file in app/views. A file at
                   app/views/apply/name.html appears at /apply/name

  Use a template   Go to http://localhost:${port}/manage-prototype and choose
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
