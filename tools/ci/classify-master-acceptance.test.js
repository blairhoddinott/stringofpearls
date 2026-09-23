'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ReleaseError } = require('../release/errors');
const { renderReleaseDoc } = require('../release/release-doc');
const { classifyMasterAcceptance } = require('./classify-master-acceptance');

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const GENERATED_PATHS = [
    'CHANGELOG.md',
    'documentation/latest-release.md',
    'package-lock.json',
    'package.json'
];

function pullEvent(overrides = {}) {
    const pull = {
        user: { login: 'blairhoddinott' },
        base: {
            ref: 'master',
            sha: BASE_SHA,
            repo: { full_name: 'blairhoddinott/stringofpearls' }
        },
        head: {
            ref: 'chore/release-v1.0.0',
            sha: HEAD_SHA,
            user: { login: 'blairhoddinott' },
            repo: { full_name: 'blairhoddinott/stringofpearls' }
        },
        ...overrides
    };

    return { pull_request: pull, repository: { full_name: 'blairhoddinott/stringofpearls' } };
}

function fakeGit(overrides = {}) {
    const calls = [];

    return {
        calls,
        revParse: async () => MERGE_SHA,
        commitParents: async () => [BASE_SHA, HEAD_SHA],
        verifyCommitSignature: async (sha) => { calls.push(['verifyCommitSignature', sha]); },
        changedPaths: async (from, to) => {
            calls.push(['changedPaths', from, to]);
            return [...GENERATED_PATHS];
        },
        ...overrides
    };
}

function artifactIo(overrides = {}) {
    const body = '### Features\n\n- **release:** automate publishing';
    const files = {
        'package.json': JSON.stringify({ version: '1.0.0' }),
        'package-lock.json': JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }),
        'CHANGELOG.md': `# Changelog\n\n## [1.0.0] - 2026-09-23\n\n${body}\n\n# 6.28.0 (June 1, 2023)\n`,
        'documentation/latest-release.md': renderReleaseDoc({
            longDate: 'September 23, 2026',
            releaseBody: body,
            repoUrl: 'https://github.com/blairhoddinott/stringofpearls',
            tag: 'v1.0.0'
        }),
        ...overrides
    };

    return {
        readFile: async (filename) => {
            const key = Object.keys(files).find((candidate) => filename.endsWith(candidate));
            if (!key) throw new Error(`unexpected read: ${filename}`);
            return files[key];
        }
    };
}

test('ordinary pull requests retain full master acceptance', async () => {
    const git = fakeGit();
    const event = pullEvent({ head: { ...pullEvent().pull_request.head, ref: 'fix/something' } });

    const result = await classifyMasterAcceptance({ event, git, io: artifactIo(), cwd: '/repo', expectedSha: MERGE_SHA });

    assert.deepEqual(result, { kind: 'full', reason: 'not a generated release branch' });
    assert.deepEqual(git.calls, []);
});

test('trusted generated release pull requests receive targeted acceptance', async () => {
    const git = fakeGit();

    const result = await classifyMasterAcceptance({
        event: pullEvent(), git, io: artifactIo(), cwd: '/repo', expectedSha: MERGE_SHA
    });

    assert.deepEqual(result, { kind: 'release', version: '1.0.0' });
    assert.deepEqual(git.calls, [
        ['verifyCommitSignature', HEAD_SHA],
        ['changedPaths', BASE_SHA, MERGE_SHA]
    ]);
});

test('release-shaped pull requests fail closed on foreign metadata', async () => {
    for (const override of [
        { user: { login: 'mallory' } },
        { base: { ...pullEvent().pull_request.base, ref: 'other' } },
        { head: { ...pullEvent().pull_request.head, repo: { full_name: 'mallory/fork' } } },
        { head: { ...pullEvent().pull_request.head, user: { login: 'mallory' } } }
    ]) {
        await assert.rejects(
            () => classifyMasterAcceptance({
                event: pullEvent(override), git: fakeGit(), io: artifactIo(), cwd: '/repo', expectedSha: MERGE_SHA
            }),
            (error) => error instanceof ReleaseError && error.code === 'untrusted-release-pr'
        );
    }
});

test('release acceptance binds the checked-out merge to exact base and head SHAs', async () => {
    await assert.rejects(
        () => classifyMasterAcceptance({
            event: pullEvent(),
            git: fakeGit({ commitParents: async () => [BASE_SHA, 'd'.repeat(40)] }),
            io: artifactIo(),
            cwd: '/repo',
            expectedSha: MERGE_SHA
        }),
        (error) => error.code === 'wrong-checkout'
    );
});

test('release acceptance requires the exact generated-only diff and signer', async () => {
    await assert.rejects(
        () => classifyMasterAcceptance({
            event: pullEvent(),
            git: fakeGit({ verifyCommitSignature: async () => { throw new ReleaseError('wrong signer', 'wrong-signing-key'); } }),
            io: artifactIo(),
            cwd: '/repo',
            expectedSha: MERGE_SHA
        }),
        (error) => error.code === 'wrong-signing-key'
    );
    await assert.rejects(
        () => classifyMasterAcceptance({
            event: pullEvent(),
            git: fakeGit({ changedPaths: async () => [...GENERATED_PATHS, 'src/backdoor.js'] }),
            io: artifactIo(),
            cwd: '/repo',
            expectedSha: MERGE_SHA
        }),
        (error) => error.code === 'unexpected-release-diff'
    );
});

test('release acceptance rejects artifact and branch-version disagreement', async () => {
    await assert.rejects(
        () => classifyMasterAcceptance({
            event: pullEvent(),
            git: fakeGit(),
            io: artifactIo({ 'package.json': JSON.stringify({ version: '9.9.9' }) }),
            cwd: '/repo',
            expectedSha: MERGE_SHA
        }),
        (error) => error.code === 'artifact-mismatch'
    );
});

test('release acceptance requires an exact workflow SHA', async () => {
    await assert.rejects(
        () => classifyMasterAcceptance({
            event: pullEvent(), git: fakeGit(), io: artifactIo(), cwd: '/repo', expectedSha: ''
        }),
        (error) => error.code === 'invalid-environment'
    );
});
