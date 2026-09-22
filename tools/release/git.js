'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');

const { ReleaseError } = require('./errors');
const { SIGNING_FINGERPRINT } = require('./constants');
const {
    signedCommitArgs,
    signedAnnotatedTagArgs,
    verifyCommitArgs,
    verifyTagArgs,
    checkoutNewBranchArgs,
    addPathsArgs,
    pushBranchArgs,
    pushTagArgs,
    listSemverTagsArgs,
    tagExistsArgs
} = require('./git-commands');

const execFileAsync = promisify(execFile);

// A field separator and record separator that cannot appear inside a git
// subject or body, so the log output parses unambiguously.
const FIELD = '';
const RECORD = '';
const LOG_FORMAT = ['%H', '%P', '%s', '%b'].join(FIELD) + RECORD;

/**
 * Run git with an explicit argument vector. Arguments are always passed as an
 * array to `execFile`, never interpolated into a shell string, so ref names and
 * paths can never be interpreted as shell syntax.
 *
 * @param {string[]} args
 * @param {{ cwd: string }} options
 * @returns {Promise<string>} stdout
 */
async function executeGit(args, { cwd, env }) {
    try {
        return await execFileAsync('git', args, {
            cwd,
            // The token, when present, is only ever passed through the child
            // environment (for the GIT_ASKPASS helper), never on the command
            // line. `env` defaults to the parent process environment.
            env: env || process.env,
            maxBuffer: 64 * 1024 * 1024,
            windowsHide: true
        });

    } catch (error) {
        const detail = (error.stderr || error.message || '').toString().trim().split('\n')[0];

        throw new ReleaseError(`git ${args[0]} failed: ${detail}`, 'git-failed');
    }
}

async function runGit(args, options) {
    return (await executeGit(args, options)).stdout;
}

function assertValidSignatureStatus(status) {
    const validSignature = String(status)
        .split('\n')
        .find((line) => line.startsWith('[GNUPG:] VALIDSIG '));

    if (!validSignature || !validSignature.split(/\s+/).includes(SIGNING_FINGERPRINT)) {
        throw new ReleaseError('signature is not from the expected Balder signing key', 'wrong-signing-key');
    }
}

async function verifySignedObject(args, { cwd }) {
    const { stdout, stderr } = await executeGit(args, { cwd });

    assertValidSignatureStatus(`${stdout}\n${stderr}`);
}

/**
 * Build the git collaborator that `prepareRelease` depends on.
 *
 * @param {{ cwd?: string }} [options]
 * @returns {{ status: Function, verifyCommit: Function, listCommits: Function }}
 */
function createGit({ cwd = process.cwd() } = {}) {
    return {
        async status() {
            const stdout = await runGit(['status', '--porcelain'], { cwd });
            const entries = stdout.split('\n').filter((line) => line.length > 0);

            return { clean: entries.length === 0, entries };
        },

        async verifyCommit(ref) {
            if (typeof ref !== 'string' || ref.length === 0) {
                throw new ReleaseError('a git ref is required', 'invalid-ref');
            }

            // `--verify` fails on an unknown or ambiguous ref; `^{commit}`
            // ensures the ref names a commit, not a tree or blob.
            try {
                const stdout = await runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd });
                const hash = stdout.trim();

                if (hash.length === 0) {
                    throw new ReleaseError(`ref does not resolve to a commit: ${JSON.stringify(ref)}`, 'unknown-ref');
                }

                return hash;
            } catch (error) {
                if (error instanceof ReleaseError && error.code === 'git-failed') {
                    throw new ReleaseError(`could not resolve ref: ${JSON.stringify(ref)}`, 'unknown-ref');
                }

                throw error;
            }
        },

        async listCommits({ from, to }) {
            const range = from ? `${from}..${to}` : to;
            const stdout = await runGit(['log', `--format=${LOG_FORMAT}`, range], { cwd });

            return stdout
                .split(RECORD)
                .map((record) => record.replace(/^\n/, ''))
                .filter((record) => record.trim().length > 0)
                .map((record) => {
                    const [hash, parents, subject, body] = record.split(FIELD);

                    return {
                        hash,
                        parents: parents ? parents.split(' ').filter(Boolean) : [],
                        subject,
                        body: body || ''
                    };
                });
        },

        async commitDate(ref) {
            if (typeof ref !== 'string' || ref.length === 0) {
                throw new ReleaseError('a git ref is required', 'invalid-ref');
            }

            const date = (await runGit(['show', '--no-patch', '--format=%cs', ref], { cwd })).trim();

            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new ReleaseError(`git returned an invalid commit date for ${JSON.stringify(ref)}`, 'invalid-date');
            }

            return date;
        },

        async assertAncestor(ancestor, descendant) {
            if (typeof ancestor !== 'string' || ancestor.length === 0 ||
                typeof descendant !== 'string' || descendant.length === 0) {
                throw new ReleaseError('ancestor and descendant refs are required', 'invalid-ref');
            }

            try {
                await runGit(['merge-base', '--is-ancestor', ancestor, descendant], { cwd });
            } catch {
                throw new ReleaseError(
                    `release baseline ${JSON.stringify(ancestor)} is not an ancestor of ${JSON.stringify(descendant)}`,
                    'divergent-baseline'
                );
            }
        },

        async commitParents(ref) {
            const output = (await runGit(['show', '--no-patch', '--format=%P', ref], { cwd })).trim();

            return output.length === 0 ? [] : output.split(' ');
        },

        async changedPaths(from, to) {
            const output = await runGit(['diff', '--name-only', '-z', from, to, '--'], { cwd });

            return output.split('\0').filter(Boolean);
        },

        // --- lifecycle side effects -------------------------------------------
        // Every method below builds its argument vector with the pure builders
        // in git-commands.js and runs it through `runGit`; no value is ever
        // interpolated into a shell string.

        async listSemverTags() {
            const stdout = await runGit(listSemverTagsArgs(), { cwd });

            return stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
        },

        async verifyCommitSignature(ref) {
            await verifySignedObject(verifyCommitArgs(ref), { cwd });

            return true;
        },

        async verifyTag(tag) {
            await verifySignedObject(verifyTagArgs(tag), { cwd });

            return true;
        },

        async checkoutBranch(branch) {
            await runGit(checkoutNewBranchArgs(branch), { cwd });
        },

        async addPaths(paths) {
            await runGit(addPathsArgs(paths), { cwd });
        },

        async signedCommit({ message }) {
            await runGit(signedCommitArgs({ message }), { cwd });
        },

        async revParse(ref) {
            if (typeof ref !== 'string' || ref.length === 0) {
                throw new ReleaseError('a git ref is required', 'invalid-ref');
            }

            const stdout = await runGit(['rev-parse', '--verify', `${ref}^{commit}`], { cwd });

            return stdout.trim();
        },

        async tagCommit(tag) {
            try {
                const stdout = await runGit(tagExistsArgs(tag), { cwd });
                const hash = stdout.trim();

                return hash.length > 0 ? hash : null;
            } catch (error) {
                // `rev-parse --verify --quiet` exits non-zero for an unknown tag;
                // that is "no such tag", not a hard failure.
                if (error instanceof ReleaseError && error.code === 'git-failed') {
                    return null;
                }

                throw error;
            }
        },

        async tagObject(tag) {
            const stdout = await runGit(['rev-parse', '--verify', `refs/tags/${tag}`], { cwd });

            return stdout.trim();
        },

        async remoteTag({ remote, tag, env }) {
            const ref = `refs/tags/${tag}`;
            const stdout = await runGit(['ls-remote', '--tags', remote, `${ref}*`], { cwd, env });
            const refs = new Map(stdout
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [hash, remoteRef] = line.split('\t');

                    return [remoteRef, hash];
                }));
            const object = refs.get(ref);
            const commit = refs.get(`${ref}^{}`);

            if (!object && !commit) {
                return null;
            }

            if (!/^[0-9a-f]{40}$/.test(object || '') || !/^[0-9a-f]{40}$/.test(commit || '')) {
                throw new ReleaseError(`remote tag ${tag} is not an annotated tag`, 'remote-tag-conflict');
            }

            return { object, commit };
        },

        async signedAnnotatedTag({ tag, message, commit }) {
            await runGit(signedAnnotatedTagArgs({ tag, message, commit }), { cwd });
        },

        async pushBranch({ remote, branch, env }) {
            await runGit(pushBranchArgs({ remote, branch }), { cwd, env });
        },

        async pushTag({ remote, tag, env }) {
            await runGit(pushTagArgs({ remote, tag }), { cwd, env });
        }
    };
}

module.exports = { createGit, assertValidSignatureStatus };
