'use strict';

const path = require('path');

const { ReleaseError } = require('./errors');
const { createGit } = require('./git');
const { createGitHubApi } = require('./github');
const { runReleaseLifecycle } = require('./orchestrate');
const { REPO_OWNER, REPO_NAME, REPO_FULL_NAME, TOKEN_ENV_VAR } = require('./constants');

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * Validate and extract the security-critical inputs from the workflow
 * environment. The repository is pinned to the one repository the automation
 * serves, the token must be present, and the pushed commit must look like a git
 * object id. Nothing here is ever logged.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {{ sha: string, token: string, owner: string, repo: string }}
 * @throws {ReleaseError} on any missing or invalid input
 */
function resolveLifecycleEnv(env) {
    const repository = env.GITHUB_REPOSITORY;

    if (repository !== REPO_FULL_NAME) {
        throw new ReleaseError(`refusing to operate on repository ${JSON.stringify(repository)}`, 'invalid-repository');
    }

    const token = env[TOKEN_ENV_VAR];

    if (typeof token !== 'string' || token.length === 0) {
        throw new ReleaseError(`${TOKEN_ENV_VAR} is required`, 'missing-token');
    }

    const sha = env.GITHUB_SHA;

    if (typeof sha !== 'string' || !SHA_PATTERN.test(sha)) {
        throw new ReleaseError('GITHUB_SHA is missing or malformed', 'invalid-argument');
    }

    return { sha, token, owner: REPO_OWNER, repo: REPO_NAME };
}

/**
 * Run the release lifecycle from the workflow environment. Collaborators are
 * injectable so the wiring is testable without a real token, key, or network.
 *
 * @param {object} [deps]
 * @returns {Promise<number>} the process exit code
 */
async function run(deps = {}) {
    const env = deps.env || process.env;
    const streams = deps.streams || { stdout: process.stdout, stderr: process.stderr };
    const cwd = deps.cwd || path.resolve(__dirname, '..', '..');
    const makeGit = deps.makeGit || ((options) => createGit(options));
    const makeApi = deps.makeApi || ((config) => createGitHubApi(config));
    const orchestrate = deps.orchestrate || runReleaseLifecycle;

    try {
        const { sha, token, owner, repo } = resolveLifecycleEnv(env);
        const git = makeGit({ cwd });
        const api = makeApi({ token, owner, repo });

        const result = await orchestrate({
            sha,
            token,
            git,
            api,
            env,
            cwd,
            logger: (message) => streams.stdout.write(`release: ${message}\n`)
        });

        streams.stdout.write(`release: ${result.action}${result.tag ? ` ${result.tag}` : ''}\n`);

        return 0;
    } catch (error) {
        if (error instanceof ReleaseError) {
            streams.stderr.write(`release: ${error.message} [${error.code}]\n`);

            return 1;
        }

        // Never surface a raw stack trace, which could echo an environment value.
        streams.stderr.write(`release: unexpected failure [${error.code || 'unknown'}]\n`);

        return 1;
    }
}

if (require.main === module) {
    run().then((code) => {
        process.exitCode = code;
    });
}

module.exports = { resolveLifecycleEnv, run };
