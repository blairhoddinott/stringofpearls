'use strict';

const path = require('path');

const { ReleaseError } = require('./errors');
const { prepareRelease } = require('./prepare');
const { createGit } = require('./git');

const USAGE = [
    'Usage: node tools/release/cli.js [--check | --prepare] [--bootstrap] [--baseline <ref>]',
    '',
    '  --check           dry run: compute and print the release plan, write nothing (default)',
    '  --prepare         write the generated package.json, package-lock.json, CHANGELOG.md, and docs page',
    '  --bootstrap       force the first 1.0.0 release from the whole history',
    '  --baseline <ref>  exclusive lower bound ref for a normal release'
].join('\n');

/**
 * Parse the CLI argument vector into a normalized options object. Fails closed
 * on any unknown flag or a `--baseline` without a value.
 *
 * @param {string[]} argv
 * @returns {{ mode: 'check'|'write', bootstrap: boolean, baseline: string|null }}
 * @throws {ReleaseError} on an unknown or malformed argument
 */
function parseCliArguments(argv) {
    const options = { mode: 'check', bootstrap: false, baseline: null };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        switch (argument) {
            case '--check':
                options.mode = 'check';
                break;
            case '--prepare':
                options.mode = 'write';
                break;
            case '--bootstrap':
                options.bootstrap = true;
                break;
            case '--baseline': {
                const value = argv[index + 1];

                if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
                    throw new ReleaseError('--baseline requires a ref value', 'invalid-argument');
                }

                options.baseline = value;
                index += 1;
                break;
            }
            default:
                throw new ReleaseError(`unknown argument: ${JSON.stringify(argument)}`, 'invalid-argument');
        }
    }

    return options;
}

function describePlan(plan) {
    if (!plan.released) {
        return `Nothing to release: ${plan.reason}`;
    }

    const files = plan.changes.map((change) => `  - ${change.path}`).join('\n');

    return [
        `Release ${plan.version}${plan.bootstrap ? ' (bootstrap)' : ''} [${plan.mode}]`,
        `  version:  ${plan.previousVersion} -> ${plan.version}`,
        `  tag:      ${plan.tag}`,
        `  branch:   ${plan.branch}`,
        `  commit:   ${plan.commitMessage}`,
        `  date:     ${plan.releaseDate.iso}`,
        `  commits:  ${plan.commitCount}`,
        `  files ${plan.mode === 'write' ? 'written' : 'to change'}:`,
        files
    ].join('\n');
}

/**
 * Run the release CLI. The git collaborator, filesystem, environment, streams,
 * and even the preparation function are injectable so the command can be
 * exercised deterministically in tests without spawning git.
 *
 * @param {string[]} argv
 * @param {object} [deps]
 * @returns {Promise<number>} the process exit code
 */
async function run(argv, deps = {}) {
    const streams = deps.streams || { stdout: process.stdout, stderr: process.stderr };
    const prepare = deps.prepare || prepareRelease;
    const cwd = deps.cwd || path.resolve(__dirname, '..', '..');
    const env = deps.env || process.env;

    try {
        const options = parseCliArguments(argv);
        const git = deps.git || createGit({ cwd });
        const plan = await prepare({
            git,
            cwd,
            env,
            bootstrap: options.bootstrap,
            baseline: options.baseline,
            mode: options.mode
        });

        streams.stdout.write(`${describePlan(plan)}\n`);

        return 0;
    } catch (error) {
        if (error instanceof ReleaseError) {
            streams.stderr.write(`release: ${error.message} [${error.code}]\n`);

            return 1;
        }

        streams.stderr.write(`release: unexpected error: ${error.message}\n`);

        return 1;
    }
}

if (require.main === module) {
    if (process.argv.slice(2).includes('--help')) {
        process.stdout.write(`${USAGE}\n`);
        process.exit(0);
    }

    run(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}

module.exports = { run, parseCliArguments, USAGE };
