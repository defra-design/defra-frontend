#!/usr/bin/env node
/**
 * Checks the instructions this repo gives people.
 *
 * `drift` guards the markup and `carbon` guards the bytes. Nothing guarded the
 * words, and the words are the product for this audience: the docs assume no
 * terminal experience, so a wrong command is not a typo, it is a dead end.
 *
 * This exists because of a real failure. Every instruction here said
 * `npm start`, which the Prototype Kit maps to its hosting server — it does not
 * watch files, so a designer's changes never appeared. The kit's own CLI
 * contains a `warnIfNpmStart` function describing `npm start` as "the wrong
 * command" locally, and prints `npm run dev` itself after creating a prototype.
 * This repo was overwriting correct advice with the advice the kit warns
 * against, and it shipped to npm.
 *
 * Note what would NOT have caught it: asserting that the command exists in the
 * prototype's package.json. `start` does exist. The invariant worth checking is
 * not "does this command exist" but "does what we tell people match what the
 * kit itself tells people".
 *
 * Two layers, because they fail for different reasons and cost different
 * amounts to run:
 *
 *   static (default)  Every instruction source agrees with the canonical
 *                     commands below, and none recommends a forbidden one.
 *                     Catches one source drifting from the others, which is how
 *                     this breaks most often. Fast, no network — runs in
 *                     `npm run check`.
 *
 *   --live            Creates a real prototype and proves the canonical
 *                     commands are still what the kit actually does and
 *                     recommends. Catches a kit upgrade changing the truth
 *                     underneath us, which no amount of internal consistency
 *                     would reveal. Slow, needs the network — its own CI job.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cli = join(root, 'packages', 'create-prototype', 'bin', 'create.mjs')

/**
 * The command we tell people to run a prototype with. Declared once here so the
 * static layer has something to compare every source against, and the live
 * layer has something to test against the kit.
 */
const RUN = 'npm run dev'

/**
 * Commands that must never appear as a recommendation. A source may still
 * mention one while telling people not to use it — that is the point of the
 * note in the generated README — so a line is allowed when it reads as
 * explanatory rather than instructional.
 */
const FORBIDDEN = [
  {
    command: 'npm start',
    why: 'the kit maps `start` to its hosting server, which does not watch files. Its own CLI calls this "the wrong command" locally and recommends `npm run dev`.'
  }
]

/** Files that tell someone how to work with a prototype. */
const SOURCES = [
  'packages/create-prototype/bin/create.mjs',
  'packages/create-prototype/README.md',
  'README.md',
  'apps/docs/src/prototyping.njk'
]

const problems = []
const notes = []

// --- static -----------------------------------------------------------------

function checkStatic () {
  for (const rel of SOURCES) {
    const path = join(root, rel)
    if (!existsSync(path)) {
      problems.push(`${rel} is listed as an instruction source but does not exist.\n` +
        '    Either it moved, in which case update SOURCES, or it was deleted and\n' +
        '    the instructions it held went with it.')
      continue
    }
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n')

    if (!text.includes(RUN)) {
      problems.push(`${rel} never mentions \`${RUN}\`.\n` +
        '    Every instruction source should tell people the same way to run a\n' +
        '    prototype. One that does not is either out of date or now says\n' +
        '    something different from the rest.')
    }

    for (const { command, why } of FORBIDDEN) {
      lines.forEach((line, i) => {
        if (!line.includes(command)) return
        // Explanatory mentions are fine; instructions are not. A mention is
        // read as explanatory when "not" or "instead" appears near it.
        //
        // Deliberately a window rather than the matched line. Prose in these
        // files is hard-wrapped, so a sentence saying "use dev, not start"
        // puts the signal and the command on different lines — checking the
        // line alone reported the middle of an explanation as a
        // recommendation, which is how this check first failed on itself.
        const context = lines.slice(Math.max(0, i - 2), i + 3).join(' ')
        if (/\bnot\b|instead/i.test(context)) return
        problems.push(`${rel}:${i + 1} recommends \`${command}\`.\n` +
          `    ${why}\n` +
          `    Use \`${RUN}\`. If this is explaining what not to do, word it so\n` +
          '    "not" or "instead" appears within two lines, and this will accept it.')
      })
    }
  }
  notes.push(`${SOURCES.length} instruction sources agree on \`${RUN}\``)
}

// --- live -------------------------------------------------------------------

function checkLive () {
  const dir = mkdtempSync(join(tmpdir(), 'defra-instructions-'))
  try {
    const result = spawnSync('node', [cli, '--local', 'check-prototype'], {
      cwd: dir,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    })
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    if (result.status !== 0) {
      problems.push('Creating a prototype failed, so the instructions could not be\n' +
        `    checked against a real one. Exit code ${result.status}.\n` +
        `    Last output:\n${output.trim().split('\n').slice(-6).map(l => `      ${l}`).join('\n')}`)
      return
    }

    const prototype = join(dir, 'check-prototype')
    const pkgPath = join(prototype, 'package.json')
    if (!existsSync(pkgPath)) {
      problems.push('A prototype was created but has no package.json, so nothing could be checked.')
      return
    }
    const scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}

    // The assertion that matters. The kit prints its own recommendation while
    // creating a prototype; ours must not disagree with it.
    const kitSays = output.match(/To run your prototype:\s*\n\s*(npm [^\n]+)/)
    if (!kitSays) {
      notes.push('could not find the kit\'s own run recommendation in its output —\n' +
        '        it may have reworded it, so the agreement below is unverified')
    } else {
      const kitCommand = kitSays[1].trim()
      if (kitCommand !== RUN) {
        problems.push(`The kit recommends \`${kitCommand}\`, we tell people \`${RUN}\`.\n` +
          '    The kit changed, or we were always wrong. Do not just change RUN —\n' +
          '    work out which command actually watches files in this kit version,\n' +
          '    then update RUN and every source together.')
      } else {
        notes.push(`the kit recommends \`${kitCommand}\`, which is what we tell people`)
      }
    }

    // Every npm script we name must exist, in the tool's own output and in the
    // README it writes into someone's folder.
    const readmePath = join(prototype, 'README.md')
    const emitted = [
      ['the terminal output after creating a prototype', output],
      ['the README written into the prototype', existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '']
    ]

    for (const [where, text] of emitted) {
      for (const match of text.matchAll(/npm run ([a-z][\w:-]*)/g)) {
        const script = match[1]
        if (!scripts[script]) {
          problems.push(`${where} says \`npm run ${script}\`, but a created prototype has no\n` +
            `    "${script}" script. It has: ${Object.keys(scripts).join(', ') || '(none)'}.`)
        }
      }
    }

    notes.push(`a created prototype has scripts: ${Object.keys(scripts).join(', ')}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --- report -----------------------------------------------------------------

const live = process.argv.includes('--live')

console.log('\ninstruction check' + (live ? ' (live)' : ''))
console.log('─'.repeat(66))

checkStatic()
if (live) checkLive()

for (const note of notes) console.log(`  ${note}`)
console.log('─'.repeat(66))

if (problems.length) {
  for (const problem of problems) console.log(`  FAIL  ${problem}`)
  console.log(`\nFAIL — ${problems.length} problem${problems.length === 1 ? '' : 's'} with the instructions this repo gives people\n`)
  process.exit(1)
}

console.log(live
  ? 'PASS — the instructions match what the kit actually does\n'
  : 'PASS — every instruction source agrees\n')
