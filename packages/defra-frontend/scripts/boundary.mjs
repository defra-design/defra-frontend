import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Companion packages may be demonstrated in Storybook without becoming
// dependencies of the published package. This asserts that boundary, because
// the interesting failure is silent: @defra/interactive-map depends on
// govuk-frontend ^5 DIRECTLY rather than as a peer, so adding it to the
// package would put v5 and v6 in one tree — the exact failure the peer
// dependency architecture exists to prevent — while the drift check kept
// reading the root v6 and passing.
//
// A check that stays green while the thing it guards against is happening is
// worse than no check, so the boundary is asserted here rather than trusted.

const require = createRequire(import.meta.url)
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

// Packages that may only ever be devDependencies of apps/*, never dependencies
// of the published package. Add to this list, never remove from it silently.
const APP_ONLY = ['@defra/interactive-map', 'maplibre-gl', 'preact']

const pkg = read('package.json')
const problems = []

const declared = {
  ...pkg.dependencies,
  ...pkg.peerDependencies,
  ...pkg.optionalDependencies
}

for (const name of APP_ONLY) {
  if (declared[name]) {
    problems.push(
      `${pkg.name} declares ${name}. It is demonstration-only and must stay a\n` +
      `    devDependency of an app. See the maps section of CLAUDE.md.`
    )
  }
}

// The package must resolve govuk-frontend 6. If a companion ever hoisted its
// v5 over ours, everything would still build and every rendered page would be
// subtly wrong.
const govukVersion = read(require.resolve('govuk-frontend/package.json')).version
const major = Number(govukVersion.split('.')[0])
if (major !== 6) {
  problems.push(
    `${pkg.name} resolves govuk-frontend ${govukVersion}, expected 6.x.\n` +
    `    Something has hoisted a different major over the peer dependency.`
  )
}

console.log('\npackage boundary')
console.log('─'.repeat(66))
console.log(`govuk-frontend resolved by ${pkg.name}   ${govukVersion}`)

// Nested copies are expected and harmless in the tree — they are contained by
// npm — but they are worth naming, because they are NOT harmless in a browser
// if a service bundles both. Reported, not failed.
let nested = []
try {
  const map = read('../../node_modules/@defra/interactive-map/node_modules/govuk-frontend/package.json')
  nested.push(`@defra/interactive-map bundles govuk-frontend ${map.version}`)
} catch {
  // not installed, which is fine
}
for (const line of nested) console.log(`note: ${line}`)
if (nested.length) {
  console.log('      contained by npm, but a service bundling both ships two copies')
}

console.log('─'.repeat(66))
if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`)
  console.log('\nFAIL — package boundary violated\n')
  process.exit(1)
}
console.log('PASS — companion packages stay outside the published package\n')
