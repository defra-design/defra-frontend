import { spawnSync } from 'node:child_process'
import { assertPrototype } from '../prototype.mjs'

/**
 * Commits the prototype and pushes it to GitHub. It stops there, deliberately.
 *
 * Hosting is not a tool call. A prototype is a Node server — GitHub Pages and
 * Netlify cannot run one, so publishing means a PaaS account, a card, and a
 * deploy hook, which is account and billing work this cannot and should not do
 * on someone's behalf. What it can do is get the code somewhere a deploy hook
 * can reach, and then say the one thing that is most often got wrong.
 *
 * THE PASSWORD FAILS OPEN. lib/authentication.js installs its middleware only
 * when config.isProduction, so PASSWORD without NODE_ENV=production is ignored
 * entirely: the prototype deploys, looks completely correct, and anyone with
 * the address walks in. The safe direction fails loudly — NODE_ENV=production
 * with no password serves an error page. So the dangerous mistake is exactly
 * the one someone setting "the password" would naturally make, which is why
 * this says it every time and tells them to check in a private window rather
 * than trust that it worked.
 */
const git = (args, cwd) =>
  spawnSync('git', args, { cwd, encoding: 'utf8' })

const gh = (args, cwd) =>
  spawnSync('gh', args, { cwd, encoding: 'utf8' })

const PROTECTION = [
  'BEFORE SHARING THE ADDRESS WITH ANYONE',
  '',
  'Wherever this is hosted, set BOTH of these environment variables:',
  '',
  '  PASSWORD=something-you-choose',
  '  NODE_ENV=production',
  '',
  'PASSWORD on its own does nothing. The prototype deploys, looks completely',
  'correct, and has no password at all — the kit only installs the password',
  'when NODE_ENV is production. A prototype that is open looks exactly like',
  'one that is protected.',
  '',
  'So check it: open the address in a private window and confirm it asks for',
  'the password. Do not take the hosting dashboard\'s word for it.',
  '',
  'Once it is live, the check_protection tool asks the published prototype',
  'directly whether it wants a password.'
].join('\n')

export const publish = {
  name: 'publish',
  description:
    'Commit the prototype and push it to GitHub, so it is backed up and a ' +
    'deploy can pick it up. This does not host it and does not make it ' +
    'reachable on the web. Always relay the password warning it returns — a ' +
    'prototype published without it is open to anyone who finds the address.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'What changed, in a few words. Defaults to "Update prototype".'
      },
      create_repository: {
        type: 'boolean',
        description:
          'Create a GitHub repository when the prototype has no remote yet. ' +
          'Needs the gh command, signed in. Private unless public is asked for.'
      },
      visibility: {
        type: 'string',
        enum: ['private', 'public'],
        description:
          'Only when creating a repository. Defaults to private. A prototype ' +
          'may contain unreleased policy, so public must be asked for.'
      }
    },
    additionalProperties: false
  },
  handler ({ message, create_repository: createRepository = false, visibility = 'private' } = {}) {
    const { dir, pkg } = assertPrototype()

    if (git(['rev-parse', '--git-dir'], dir).status !== 0) {
      throw new Error(
        'This prototype is not a git repository yet, so there is nothing to ' +
        'push from. Run `git init` in a terminal from the prototype folder.'
      )
    }

    const steps = []

    // --- a remote to push to ------------------------------------------------
    let remote = git(['remote', 'get-url', 'origin'], dir).stdout?.trim()

    if (!remote) {
      if (!createRepository) {
        throw new Error(
          'This prototype has no GitHub repository yet. Ask again with ' +
          'create_repository set to true and I will make a private one — or ' +
          'create it on github.com and run `git remote add origin <url>`.\n\n' +
          'Nothing has been committed or pushed.'
        )
      }
      if (gh(['--version'], dir).status !== 0) {
        throw new Error(
          'Creating a repository needs the GitHub CLI (`gh`), which is not ' +
          'installed. Install it from https://cli.github.com, or create the ' +
          'repository on github.com and run `git remote add origin <url>`.'
        )
      }
      if (gh(['auth', 'status'], dir).status !== 0) {
        throw new Error(
          'The GitHub CLI is installed but not signed in. Run `gh auth login` ' +
          'in a terminal, then ask again.'
        )
      }

      const name = pkg.name || 'prototype'
      const made = gh(['repo', 'create', name, `--${visibility}`, '--source', '.', '--remote', 'origin'], dir)
      if (made.status !== 0) {
        throw new Error(
          `Could not create the repository.\n\n${(made.stderr || made.stdout || '').trim()}`
        )
      }
      remote = git(['remote', 'get-url', 'origin'], dir).stdout?.trim()
      steps.push(`Created a ${visibility} repository: ${remote}`)
    }

    // --- commit -------------------------------------------------------------
    const dirty = git(['status', '--porcelain'], dir).stdout?.trim()
    if (dirty) {
      git(['add', '-A'], dir)
      const committed = git(['commit', '-m', String(message || 'Update prototype')], dir)
      if (committed.status !== 0) {
        throw new Error(
          `Could not commit.\n\n${(committed.stderr || committed.stdout || '').trim()}`
        )
      }
      steps.push(`Committed ${dirty.split('\n').length} changed file(s).`)
    } else {
      steps.push('Nothing to commit — everything was already saved.')
    }

    // --- push ---------------------------------------------------------------
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], dir).stdout?.trim() || 'main'
    const pushed = git(['push', '-u', 'origin', branch], dir)
    if (pushed.status !== 0) {
      throw new Error(
        `Committed, but the push failed.\n\n${(pushed.stderr || pushed.stdout || '').trim()}`
      )
    }
    steps.push(`Pushed ${branch} to ${remote}`)

    return [
      ...steps,
      '',
      'This is on GitHub. It is NOT on the web yet — a prototype is a running',
      'server, so it needs somewhere that runs Node. GitHub Pages cannot host',
      'one. Railway and Render redeploy on push; Heroku does too and charges.',
      '',
      PROTECTION
    ].join('\n')
  }
}
