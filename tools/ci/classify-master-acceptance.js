'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

const { ReleaseError } = require('../release/errors');
const { createGit } = require('../release/git');
const {
    parseReleaseBranch,
    verifyReleaseArtifactsAgree
} = require('../release/lifecycle');
const {
    MANIFEST_PATH,
    LOCKFILE_PATH,
    CHANGELOG_PATH,
    RELEASE_DOC_PATH
} = require('../release/prepare');
const { resolveWithinRoot } = require('../release/paths');
const {
    REPO_OWNER,
    REPO_FULL_NAME,
    BASE_BRANCH
} = require('../release/constants');

const GENERATED_PATHS = [MANIFEST_PATH, LOCKFILE_PATH, CHANGELOG_PATH, RELEASE_DOC_PATH].sort();
const SHA_PATTERN = /^[0-9a-f]{40}$/;

const DEFAULT_IO = {
    readFile: (filename) => fsp.readFile(filename, 'utf8')
};

function assertTrustedReleaseMetadata(pull) {
    const base = pull && pull.base;
    const head = pull && pull.head;
    const pullOwner = pull && pull.user && pull.user.login;
    const baseRepository = base && base.repo && base.repo.full_name;
    const headRepository = head && head.repo && head.repo.full_name;
    const headOwner = head && head.user && head.user.login;

    if (pullOwner !== REPO_OWNER ||
        !base || base.ref !== BASE_BRANCH || baseRepository !== REPO_FULL_NAME ||
        !head || headRepository !== REPO_FULL_NAME || headOwner !== REPO_OWNER) {
        throw new ReleaseError('release pull request metadata is not trusted', 'untrusted-release-pr');
    }

    if (!SHA_PATTERN.test(base.sha || '') || !SHA_PATTERN.test(head.sha || '')) {
        throw new ReleaseError('release pull request is missing exact base or head SHAs', 'invalid-api-response');
    }
}

async function classifyMasterAcceptance({ event, git, io = DEFAULT_IO, cwd, expectedSha }) {
    const pull = event && event.pull_request;
    const headRef = pull && pull.head && pull.head.ref;
    const version = parseReleaseBranch(headRef);

    if (!version) {
        return { kind: 'full', reason: 'not a generated release branch' };
    }

    if (!event.repository || event.repository.full_name !== REPO_FULL_NAME) {
        throw new ReleaseError('workflow event repository is not trusted', 'untrusted-release-pr');
    }

    assertTrustedReleaseMetadata(pull);

    if (!SHA_PATTERN.test(expectedSha || '')) {
        throw new ReleaseError('GITHUB_SHA is missing or malformed', 'invalid-environment');
    }

    const localHead = await git.revParse('HEAD');

    if (!SHA_PATTERN.test(localHead) || localHead !== expectedSha) {
        throw new ReleaseError('checked-out test merge does not match the workflow SHA', 'wrong-checkout');
    }

    const parents = await git.commitParents(localHead);

    if (parents.length !== 2 || parents[0] !== pull.base.sha || parents[1] !== pull.head.sha) {
        throw new ReleaseError('checked-out test merge is not the exact release pull request merge', 'wrong-checkout');
    }

    await git.verifyCommitSignature(pull.head.sha);

    const changedPaths = (await git.changedPaths(parents[0], localHead)).sort();

    if (JSON.stringify(changedPaths) !== JSON.stringify(GENERATED_PATHS)) {
        throw new ReleaseError('release pull request changes files outside the generated artifact set', 'unexpected-release-diff');
    }

    const [manifestText, lockText, changelogText, latestReleaseDocText] = await Promise.all([
        io.readFile(resolveWithinRoot(cwd, MANIFEST_PATH)),
        io.readFile(resolveWithinRoot(cwd, LOCKFILE_PATH)),
        io.readFile(resolveWithinRoot(cwd, CHANGELOG_PATH)),
        io.readFile(resolveWithinRoot(cwd, RELEASE_DOC_PATH))
    ]);
    const agreed = verifyReleaseArtifactsAgree({ manifestText, lockText, changelogText, latestReleaseDocText });

    if (agreed.version !== version) {
        throw new ReleaseError(
            `release branch describes ${version} but generated artifacts describe ${agreed.version}`,
            'artifact-mismatch'
        );
    }

    return { kind: 'release', version };
}

function repositoryRootFromArgs(argv) {
    if (argv.length === 0) {
        return process.cwd();
    }

    if (argv.length === 2 && argv[0] === '--repository-root' && argv[1]) {
        return path.resolve(argv[1]);
    }

    throw new ReleaseError('usage: classify-master-acceptance.js [--repository-root <path>]', 'invalid-argument');
}

async function run({ argv = process.argv.slice(2), env = process.env, streams = process } = {}) {
    try {
        if (env.GITHUB_EVENT_NAME !== 'pull_request') {
            throw new ReleaseError('release PR classification requires a pull_request event', 'invalid-event');
        }

        if (!env.GITHUB_EVENT_PATH || !env.GITHUB_OUTPUT) {
            throw new ReleaseError('GITHUB_EVENT_PATH and GITHUB_OUTPUT are required', 'missing-environment');
        }

        const cwd = repositoryRootFromArgs(argv);
        const event = JSON.parse(await fsp.readFile(env.GITHUB_EVENT_PATH, 'utf8'));
        const result = await classifyMasterAcceptance({
            event,
            git: createGit({ cwd }),
            cwd,
            expectedSha: env.GITHUB_SHA
        });
        const output = [`kind=${result.kind}`];

        if (result.version) {
            output.push(`version=${result.version}`);
        }

        await fsp.appendFile(env.GITHUB_OUTPUT, `${output.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
        streams.stdout.write(`acceptance: ${result.kind}${result.version ? ` ${result.version}` : ''}\n`);
        return 0;
    } catch (error) {
        if (error instanceof ReleaseError || error instanceof SyntaxError) {
            const code = error.code || 'invalid-event';
            streams.stderr.write(`acceptance: ${error.message} [${code}]\n`);
        } else {
            streams.stderr.write(`acceptance: unexpected failure [${error.code || 'unknown'}]\n`);
        }

        return 1;
    }
}

if (require.main === module) {
    run().then((code) => {
        process.exitCode = code;
    });
}

module.exports = { classifyMasterAcceptance, run };
