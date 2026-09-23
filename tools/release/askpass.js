'use strict';

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ReleaseError } = require('./errors');
const { TOKEN_ENV_VAR } = require('./constants');

// The helper never contains the token. It reads it from the environment at the
// moment git invokes it, answering the username prompt with the conventional
// `x-access-token` and the password prompt with the token. Everything else is
// answered with an empty string so git can never fall through to an interactive
// prompt.
const HELPER_SCRIPT = [
    '#!/usr/bin/env bash',
    'set -eu',
    'case "$1" in',
    "    Username*) printf '%s\\n' 'x-access-token' ;;",
    `    Password*) printf '%s\\n' "\${${TOKEN_ENV_VAR}:-}" ;;`,
    "    *) printf '%s\\n' '' ;;",
    'esac',
    ''
].join('\n');

/**
 * Run `callback` with an environment wired for a credential-less HTTPS git push.
 *
 * A private, mode-0700 GIT_ASKPASS helper is provisioned in a fresh temporary
 * directory outside the repository, the token is exposed only through the
 * process environment passed to git (never argv, never the remote URL, never
 * git config, never a tracked file), and the whole temporary directory is
 * removed in a `finally` block regardless of success or failure.
 *
 * @template T
 * @param {{ token: string }} params
 * @param {(gitEnv: Record<string, string>) => Promise<T>} callback
 * @returns {Promise<T>}
 * @throws {ReleaseError} when no token is available
 */
async function withAskpass({ token }, callback) {
    if (typeof token !== 'string' || token.length === 0) {
        throw new ReleaseError('a release automation token is required to push', 'missing-token');
    }

    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sop-release-askpass-'));
    const helperPath = path.join(dir, 'askpass.sh');

    try {
        await fsp.writeFile(helperPath, HELPER_SCRIPT, { mode: 0o700 });
        // Re-assert the mode: the process umask can clear bits on write.
        await fsp.chmod(helperPath, 0o700);
        await fsp.chmod(dir, 0o700);

        const gitEnv = {
            ...process.env,
            [TOKEN_ENV_VAR]: token,
            GIT_ASKPASS: helperPath,
            GIT_TERMINAL_PROMPT: '0'
        };

        return await callback(gitEnv);
    } finally {
        await fsp.rm(dir, { recursive: true, force: true });
    }
}

module.exports = { withAskpass };
