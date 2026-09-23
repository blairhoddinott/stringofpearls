'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runReleaseLifecycle } = require('./orchestrate');
const { ReleaseError } = require('./errors');
const { BOOTSTRAP_BASELINE, TOKEN_ENV_VAR, REPO_FULL_NAME } = require('./constants');
const { renderReleaseDoc } = require('./release-doc');
const { prepareRelease } = require('./prepare');

const MERGE_SHA = 'mergesha0000000000000000000000000000abcd';

function featurePull(number = 7) {
    return {
        number,
        merged_at: '2026-09-22T00:00:00Z',
        merge_commit_sha: MERGE_SHA,
        head: { ref: 'feat/traffic' },
        base: { ref: 'master', repo: { full_name: REPO_FULL_NAME } }
    };
}

function releasePull(version, number = 42) {
    return {
        number,
        merged_at: '2026-09-22T00:00:00Z',
        merge_commit_sha: MERGE_SHA,
        head: {
            ref: `chore/release-v${version}`,
            sha: 'b'.repeat(40),
            repo: { full_name: REPO_FULL_NAME },
            user: { login: 'blairhoddinott' }
        },
        base: { ref: 'master', repo: { full_name: REPO_FULL_NAME } }
    };
}

function makeFakeGit(overrides = {}) {
    const calls = [];
    let remoteTagPublished = false;
    const record = (name) => (...args) => {
        calls.push({ name, args });
        return undefined;
    };

    const git = {
        calls,
        status: async () => ({ clean: true, entries: [] }),
        listSemverTags: async () => [],
        verifyTag: async (...a) => { calls.push({ name: 'verifyTag', args: a }); },
        verifyCommit: async (...a) => { calls.push({ name: 'verifyCommit', args: a }); return 'HEADSHA'; },
        commitDate: async (...a) => { calls.push({ name: 'commitDate', args: a }); return '2026-09-22'; },
        verifyCommitSignature: async (...a) => { calls.push({ name: 'verifyCommitSignature', args: a }); },
        commitParents: async (...a) => { calls.push({ name: 'commitParents', args: a }); return ['a'.repeat(40), 'b'.repeat(40)]; },
        changedPaths: async (...a) => {
            calls.push({ name: 'changedPaths', args: a });
            return ['package.json', 'package-lock.json', 'CHANGELOG.md', 'documentation/latest-release.md'];
        },
        checkoutBranch: async (...a) => { calls.push({ name: 'checkoutBranch', args: a }); },
        addPaths: async (...a) => { calls.push({ name: 'addPaths', args: a }); },
        signedCommit: async (...a) => { calls.push({ name: 'signedCommit', args: a }); },
        revParse: async () => MERGE_SHA,
        pushBranch: async (...a) => { calls.push({ name: 'pushBranch', args: a }); },
        tagCommit: async () => null,
        tagObject: async () => 'd'.repeat(40),
        remoteTag: async (...a) => {
            calls.push({ name: 'remoteTag', args: a });
            return remoteTagPublished ? { object: 'd'.repeat(40), commit: MERGE_SHA } : null;
        },
        signedAnnotatedTag: async (...a) => { calls.push({ name: 'signedAnnotatedTag', args: a }); },
        pushTag: async (...a) => { calls.push({ name: 'pushTag', args: a }); remoteTagPublished = true; },
        ...overrides
    };

    void record;
    return git;
}

function makeFakeApi(overrides = {}) {
    const calls = [];

    return {
        calls,
        getBranchHead: async () => MERGE_SHA,
        listCommitPulls: async (sha) => { calls.push({ name: 'listCommitPulls', args: [sha] }); return [featurePull()]; },
        listOpenPulls: async () => { calls.push({ name: 'listOpenPulls', args: [] }); return []; },
        createPull: async (payload) => { calls.push({ name: 'createPull', args: [payload] }); return { number: 100, ...payload }; },
        getReleaseByTag: async (tag) => { calls.push({ name: 'getReleaseByTag', args: [tag] }); return null; },
        createRelease: async (payload) => { calls.push({ name: 'createRelease', args: [payload] }); return { id: 1, ...payload }; },
        ...overrides
    };
}

// A fake askpass that mirrors withAskpass: it hands the callback an environment
// carrying the token and GIT_ASKPASS, and records that pushes ran inside it.
function makeFakeAskpass() {
    const seen = [];
    const askpass = async ({ token }, callback) => {
        seen.push(token);
        return callback({ [TOKEN_ENV_VAR]: token, GIT_ASKPASS: '/tmp/fake-askpass', GIT_TERMINAL_PROMPT: '0' });
    };
    askpass.seen = seen;
    return askpass;
}

function preparePlan(overrides = {}) {
    return async () => ({
        released: true,
        bootstrap: overrides.bootstrap || false,
        mode: 'write',
        version: overrides.version || '1.0.0',
        previousVersion: overrides.previousVersion || '6.29.0-BETA',
        tag: `v${overrides.version || '1.0.0'}`,
        branch: `chore/release-v${overrides.version || '1.0.0'}`,
        commitMessage: `chore(release): v${overrides.version || '1.0.0'}`,
        releaseDate: { iso: '2026-09-22', long: 'September 22, 2026' },
        releaseBody: '### Features\n\n- **traffic:** add mode',
        commitCount: 3,
        changes: [
            { path: 'package.json', contents: '{}' },
            { path: 'package-lock.json', contents: '{}' },
            { path: 'CHANGELOG.md', contents: '# c' },
            { path: 'documentation/latest-release.md', contents: '# d' }
        ],
        ...overrides
    });
}

function baseOptions(overrides = {}) {
    return {
        sha: MERGE_SHA,
        cwd: '/repo',
        env: { [TOKEN_ENV_VAR]: 'the-token' },
        token: 'the-token',
        git: makeFakeGit(),
        api: makeFakeApi(),
        askpass: makeFakeAskpass(),
        prepare: preparePlan(),
        io: { readFile: async () => '{}' },
        ...overrides
    };
}

test('a push with no associated merged PR is a clean no-op', async () => {
    const api = makeFakeApi({ listCommitPulls: async () => [] });
    const result = await runReleaseLifecycle(baseOptions({ api }));

    assert.equal(result.action, 'noop');
    assert.ok(api.calls.every((call) => call.name !== 'createPull'));
});

test('a stale master push event fails before classification or side effects', async () => {
    const api = makeFakeApi({ getBranchHead: async () => 'f'.repeat(40) });

    await assert.rejects(
        () => runReleaseLifecycle(baseOptions({ api })),
        (error) => error instanceof ReleaseError && error.code === 'stale-event'
    );
    assert.equal(api.calls.length, 0);
});

test('a wrong or dirty local checkout fails before classification', async () => {
    await assert.rejects(
        () => runReleaseLifecycle(baseOptions({ git: makeFakeGit({ revParse: async () => 'f'.repeat(40) }) })),
        (error) => error.code === 'wrong-checkout'
    );
    await assert.rejects(
        () => runReleaseLifecycle(baseOptions({ git: makeFakeGit({ status: async () => ({ clean: false }) }) })),
        (error) => error.code === 'dirty-tree'
    );
});

test('a feature merge with no releasable commits exits cleanly without a branch or PR', async () => {
    const git = makeFakeGit();
    const result = await runReleaseLifecycle(baseOptions({
        git,
        prepare: async () => ({ released: false, reason: 'no releasable commits in the given range', changes: [] })
    }));

    assert.equal(result.action, 'noop');
    assert.ok(git.calls.every((call) => call.name !== 'signedCommit'));
    assert.ok(git.calls.every((call) => call.name !== 'pushBranch'));
});

test('the first feature merge bootstraps from the tracked baseline, signs, pushes, and opens a PR', async () => {
    const git = makeFakeGit({ listSemverTags: async () => [] });
    const api = makeFakeApi();
    const askpass = makeFakeAskpass();
    let prepareArgs;

    const result = await runReleaseLifecycle(baseOptions({
        git,
        api,
        askpass,
        prepare: async (options) => { prepareArgs = options; return preparePlan()(); }
    }));

    assert.equal(result.action, 'opened-release-pr');
    assert.equal(result.version, '1.0.0');
    assert.equal(prepareArgs.bootstrap, true);
    assert.equal(prepareArgs.baseline, BOOTSTRAP_BASELINE);
    assert.equal(prepareArgs.mode, 'write');
    assert.equal(prepareArgs.env.RELEASE_DATE, '2026-09-22');

    const names = git.calls.map((call) => call.name);
    assert.deepEqual(
        names.filter((n) => ['checkoutBranch', 'addPaths', 'signedCommit', 'verifyCommitSignature', 'pushBranch'].includes(n)),
        ['checkoutBranch', 'addPaths', 'signedCommit', 'verifyCommitSignature', 'pushBranch']
    );

    // The push ran inside the askpass scope with the token in the environment.
    assert.deepEqual(askpass.seen, ['the-token']);
    const push = git.calls.find((call) => call.name === 'pushBranch');
    assert.equal(push.args[0].env[TOKEN_ENV_VAR], 'the-token');

    const createPull = api.calls.find((call) => call.name === 'createPull');
    assert.equal(createPull.args[0].head, 'chore/release-v1.0.0');
    assert.equal(createPull.args[0].base, 'master');
});

test('default orchestration I/O writes all generated bootstrap artifacts', async () => {
    const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), 'sop-orchestrate-io-'));

    try {
        await fsp.mkdir(path.join(cwd, 'documentation'));
        await fsp.writeFile(path.join(cwd, 'package.json'), JSON.stringify({
            name: 'stringofpearls',
            version: '6.29.0-BETA',
            repository: 'https://github.com/blairhoddinott/stringofpearls'
        }));
        await fsp.writeFile(path.join(cwd, 'package-lock.json'), JSON.stringify({
            name: 'stringofpearls',
            version: '6.29.0-BETA',
            lockfileVersion: 3,
            packages: { '': { name: 'stringofpearls', version: '6.29.0-BETA' } }
        }));
        await fsp.writeFile(path.join(cwd, 'CHANGELOG.md'), '# Changelog\n\n# 6.28.0 (June 1, 2023)\n\nInherited history.\n');

        const git = makeFakeGit({
            listSemverTags: async () => [],
            verifyCommit: async (ref) => ref,
            assertAncestor: async () => {},
            listCommits: async () => [{
                hash: 'a'.repeat(40),
                parents: ['b'.repeat(40)],
                subject: 'feat(release): automate publishing',
                body: ''
            }]
        });
        const options = baseOptions({ cwd, git, prepare: prepareRelease });
        delete options.io;

        const result = await runReleaseLifecycle(options);

        assert.equal(result.action, 'opened-release-pr');
        assert.equal(JSON.parse(await fsp.readFile(path.join(cwd, 'package.json'), 'utf8')).version, '1.0.0');
        assert.match(await fsp.readFile(path.join(cwd, 'documentation/latest-release.md'), 'utf8'), /v1\.0\.0/);
    } finally {
        await fsp.rm(cwd, { recursive: true, force: true });
    }
});

test('a later feature merge uses the highest signed tag as baseline and verifies it', async () => {
    const git = makeFakeGit({ listSemverTags: async () => ['v1.0.0', 'v1.1.0'] });
    let prepareArgs;

    await runReleaseLifecycle(baseOptions({
        git,
        prepare: async (options) => { prepareArgs = options; return preparePlan({ version: '1.2.0', previousVersion: '1.1.0' })(); }
    }));

    assert.equal(prepareArgs.bootstrap, false);
    assert.equal(prepareArgs.baseline, 'v1.1.0');
    const verifyTag = git.calls.find((call) => call.name === 'verifyTag');
    assert.deepEqual(verifyTag.args, ['v1.1.0']);
});

test('an already-open release PR for the same version blocks preparation', async () => {
    const api = makeFakeApi({ listOpenPulls: async () => [releasePull('1.0.0', 55)] });

    await assert.rejects(
        () => runReleaseLifecycle(baseOptions({ api })),
        (error) => error instanceof ReleaseError && error.code === 'release-in-progress'
    );
    assert.ok(api.calls.every((call) => call.name !== 'createPull'));
});

test('a conflicting open release PR for a different version fails closed', async () => {
    const api = makeFakeApi({ listOpenPulls: async () => [releasePull('9.9.9', 55)] });

    await assert.rejects(() => runReleaseLifecycle(baseOptions({ api })), (error) => {
        assert.ok(error instanceof ReleaseError);
        assert.equal(error.code, 'release-in-progress');
        return true;
    });
});

test('merging the generated release PR signs and pushes a tag and publishes the release', async () => {
    const git = makeFakeGit();
    const api = makeFakeApi({ listCommitPulls: async () => [releasePull('1.0.0')] });
    const askpass = makeFakeAskpass();
    const io = {
        readFile: async (file) => {
            if (file.endsWith('package.json')) return JSON.stringify({ version: '1.0.0' });
            if (file.endsWith('package-lock.json')) return JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } });
            if (file.endsWith('CHANGELOG.md')) return '# Changelog\n\n## [1.0.0] - 2026-09-22\n\n### Features\n\n- x\n';
            return renderReleaseDoc({
                longDate: 'September 22, 2026',
                releaseBody: '### Features\n\n- x',
                repoUrl: 'https://github.com/blairhoddinott/stringofpearls',
                tag: 'v1.0.0'
            });
        }
    };

    const result = await runReleaseLifecycle(baseOptions({ git, api, askpass, io }));

    assert.equal(result.action, 'published');
    assert.equal(result.tag, 'v1.0.0');

    const tagCall = git.calls.find((call) => call.name === 'signedAnnotatedTag');
    assert.equal(tagCall.args[0].tag, 'v1.0.0');
    assert.equal(tagCall.args[0].commit, MERGE_SHA);
    assert.ok(git.calls.some((call) => call.name === 'verifyTag'));

    const push = git.calls.find((call) => call.name === 'pushTag');
    assert.equal(push.args[0].env[TOKEN_ENV_VAR], 'the-token');

    const created = api.calls.find((call) => call.name === 'createRelease');
    assert.equal(created.args[0].body, '### Features\n\n- x');
    assert.equal(created.args[0].draft, false);
});

test('release publication rejects an unsigned lineage or extra changed file before tagging', async () => {
    const api = makeFakeApi({ listCommitPulls: async () => [releasePull('1.0.0')] });
    const wrongParentGit = makeFakeGit({ commitParents: async () => ['a'.repeat(40), 'c'.repeat(40)] });

    await assert.rejects(
        () => runReleaseLifecycle(baseOptions({ git: wrongParentGit, api })),
        (error) => error.code === 'untrusted-release-merge'
    );

    const extraFileGit = makeFakeGit({
        changedPaths: async () => [
            'package.json',
            'package-lock.json',
            'CHANGELOG.md',
            'documentation/latest-release.md',
            'src/backdoor.js'
        ]
    });

    await assert.rejects(
        () => runReleaseLifecycle(baseOptions({ git: extraFileGit, api })),
        (error) => error.code === 'unexpected-release-diff'
    );
    assert.ok(extraFileGit.calls.every((call) => call.name !== 'signedAnnotatedTag'));
});

test('re-running a completed release accepts the exact existing tag and release', async () => {
    const git = makeFakeGit({
        tagCommit: async () => MERGE_SHA,
        remoteTag: async () => ({ object: 'd'.repeat(40), commit: MERGE_SHA })
    });
    const existingRelease = { tag_name: 'v1.0.0', name: 'v1.0.0', body: '### Features\n\n- x', draft: false, prerelease: false };
    const api = makeFakeApi({
        listCommitPulls: async () => [releasePull('1.0.0')],
        getReleaseByTag: async () => existingRelease
    });
    const io = {
        readFile: async (file) => {
            if (file.endsWith('package.json')) return JSON.stringify({ version: '1.0.0' });
            if (file.endsWith('package-lock.json')) return JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } });
            if (file.endsWith('CHANGELOG.md')) return '# Changelog\n\n## [1.0.0] - 2026-09-22\n\n### Features\n\n- x\n';
            return renderReleaseDoc({
                longDate: 'September 22, 2026',
                releaseBody: '### Features\n\n- x',
                repoUrl: 'https://github.com/blairhoddinott/stringofpearls',
                tag: 'v1.0.0'
            });
        }
    };

    const result = await runReleaseLifecycle(baseOptions({ git, api, io }));

    assert.equal(result.action, 'published');
    assert.ok(git.calls.every((call) => call.name !== 'signedAnnotatedTag'));
    assert.ok(git.calls.every((call) => call.name !== 'pushTag'));
    assert.ok(api.calls.every((call) => call.name !== 'createRelease'));
});

test('a rerun with a tag pointing at a different commit fails closed', async () => {
    const git = makeFakeGit({ tagCommit: async () => 'a-different-sha' });
    const api = makeFakeApi({ listCommitPulls: async () => [releasePull('1.0.0')] });
    const io = {
        readFile: async (file) => {
            if (file.endsWith('package.json')) return JSON.stringify({ version: '1.0.0' });
            if (file.endsWith('package-lock.json')) return JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } });
            if (file.endsWith('CHANGELOG.md')) return '# Changelog\n\n## [1.0.0] - 2026-09-22\n\n### Features\n\n- x\n';
            return renderReleaseDoc({
                longDate: 'September 22, 2026',
                releaseBody: '### Features\n\n- x',
                repoUrl: 'https://github.com/blairhoddinott/stringofpearls',
                tag: 'v1.0.0'
            });
        }
    };

    await assert.rejects(() => runReleaseLifecycle(baseOptions({ git, api, io })), (error) => {
        assert.equal(error.code, 'tag-conflict');
        return true;
    });
});

test('a release PR whose artifacts disagree never creates a tag', async () => {
    const git = makeFakeGit();
    const api = makeFakeApi({ listCommitPulls: async () => [releasePull('1.0.0')] });
    const io = {
        readFile: async (file) => {
            if (file.endsWith('package.json')) return JSON.stringify({ version: '1.0.0' });
            if (file.endsWith('package-lock.json')) return JSON.stringify({ version: '9.9.9', packages: { '': { version: '9.9.9' } } });
            if (file.endsWith('CHANGELOG.md')) return '# Changelog\n\n## [1.0.0] - 2026-09-22\n\n- x\n';
            return '## Latest release — v1.0.0 (x)\n';
        }
    };

    await assert.rejects(() => runReleaseLifecycle(baseOptions({ git, api, io })), (error) => {
        assert.equal(error.code, 'artifact-mismatch');
        return true;
    });
    assert.ok(git.calls.every((call) => call.name !== 'signedAnnotatedTag'));
});
