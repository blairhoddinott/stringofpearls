'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const { prepareRelease, RELEASE_DOC_PATH } = require('./prepare');
const { ReleaseError } = require('./errors');

const REPO_URL = 'https://github.com/blairhoddinott/stringofpearls';

const INHERITED_CHANGELOG = [
    '# Changelog',
    '',
    'All notable changes to String of Pearls are documented here.',
    '',
    '# 6.29.0 (October 1, 2022)',
    '### New Features',
    '- inherited feature',
    ''
].join('\n');

function commit(subject, overrides = {}) {
    return {
        hash: overrides.hash || 'a1b2c3d4e5f6a7b8c9d0112233445566778899aa',
        subject,
        body: overrides.body || '',
        parents: overrides.parents || ['0000000000000000000000000000000000000000']
    };
}

const FEATURE_COMMITS = [
    commit('feat(traffic): add mode selection', { hash: '1111111111111111111111111111111111111111' }),
    commit('fix(strips): correct strip bay alignment', { hash: '2222222222222222222222222222222222222222' }),
    commit('Merge pull request #9 from feature/x', {
        hash: '3333333333333333333333333333333333333333',
        parents: ['1111111111111111111111111111111111111111', '2222222222222222222222222222222222222222']
    })
];

function makeGit(overrides = {}) {
    return {
        calls: overrides.calls || {},
        async status() {
            if (overrides.status) {
                return overrides.status;
            }

            return { clean: true, entries: [] };
        },
        async verifyCommit(ref) {
            if (overrides.verifyCommit) {
                return overrides.verifyCommit(ref);
            }

            return `resolved-${ref}`;
        },
        async listCommits(range) {
            if (overrides.listCommitsSpy) {
                overrides.listCommitsSpy(range);
            }

            return overrides.commits || FEATURE_COMMITS;
        },
        async assertAncestor(from, to) {
            if (overrides.assertAncestor) {
                return overrides.assertAncestor(from, to);
            }
        }
    };
}

async function makeRepo(t, { version = '6.29.0-BETA', changelog = INHERITED_CHANGELOG } = {}) {
    const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), 'sop-release-'));
    t.after(async () => fsp.rm(cwd, { recursive: true, force: true }));

    const manifest = {
        name: 'stringofpearls',
        version,
        repository: { type: 'git', url: `git+${REPO_URL}.git` }
    };
    const lock = {
        name: 'stringofpearls',
        version,
        lockfileVersion: 3,
        packages: {
            '': { name: 'stringofpearls', version },
            'node_modules/express': { version: '4.22.3' }
        }
    };

    await fsp.writeFile(path.join(cwd, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await fsp.writeFile(path.join(cwd, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    await fsp.writeFile(path.join(cwd, 'CHANGELOG.md'), changelog);
    await fsp.mkdir(path.join(cwd, 'documentation'), { recursive: true });

    return cwd;
}

async function readFile(cwd, relative) {
    return fsp.readFile(path.join(cwd, relative), 'utf8');
}

test('bootstrap check produces a plan without touching the working tree', async (t) => {
    const cwd = await makeRepo(t);
    const before = await readFile(cwd, 'package.json');

    const plan = await prepareRelease({
        git: makeGit(),
        cwd,
        env: { RELEASE_DATE: '2026-09-22' },
        bootstrap: true,
        mode: 'check'
    });

    assert.equal(plan.released, true);
    assert.equal(plan.bootstrap, true);
    assert.equal(plan.mode, 'check');
    assert.equal(plan.version, '1.0.0');
    assert.equal(plan.previousVersion, '6.29.0-BETA');
    assert.equal(plan.tag, 'v1.0.0');
    assert.equal(plan.branch, 'chore/release-v1.0.0');
    assert.equal(plan.commitMessage, 'chore(release): v1.0.0');
    assert.equal(plan.releaseDate.iso, '2026-09-22');
    assert.match(plan.releaseBody, /### Features/);
    assert.match(plan.releaseBody, /add mode selection/);

    const changed = plan.changes.map((change) => change.path).sort();
    assert.deepEqual(changed, [
        'CHANGELOG.md',
        RELEASE_DOC_PATH,
        'package-lock.json',
        'package.json'
    ].sort());

    // check mode is a pure dry run.
    assert.equal(await readFile(cwd, 'package.json'), before);
    assert.equal(fs.existsSync(path.join(cwd, RELEASE_DOC_PATH)), false);
});

test('bootstrap write atomically generates all four artifacts', async (t) => {
    const cwd = await makeRepo(t);

    const plan = await prepareRelease({
        git: makeGit(),
        cwd,
        env: { RELEASE_DATE: '2026-09-22' },
        bootstrap: true,
        mode: 'write'
    });

    assert.equal(plan.version, '1.0.0');

    const manifest = JSON.parse(await readFile(cwd, 'package.json'));
    assert.equal(manifest.version, '1.0.0');

    const lock = JSON.parse(await readFile(cwd, 'package-lock.json'));
    assert.equal(lock.version, '1.0.0');
    assert.equal(lock.packages[''].version, '1.0.0');
    assert.equal(lock.packages['node_modules/express'].version, '4.22.3');

    const changelog = await readFile(cwd, 'CHANGELOG.md');
    assert.match(changelog, /## \[1\.0\.0\] - 2026-09-22/);
    assert.match(changelog, /add mode selection/);
    // Inherited history is preserved.
    assert.match(changelog, /# 6\.29\.0 \(October 1, 2022\)/);
    assert.match(changelog, /inherited feature/);
    // The merge commit was excluded.
    assert.doesNotMatch(changelog, /Merge pull request/);
    assert.ok(changelog.startsWith('# Changelog'));

    const doc = await readFile(cwd, RELEASE_DOC_PATH);
    assert.match(doc, /Latest release — v1\.0\.0 \(September 22, 2026\)/);
    assert.match(doc, /add mode selection/);
});

test('a normal release bumps from the current version by commit type', async (t) => {
    const cwd = await makeRepo(t, { version: '1.0.0' });
    const listCommitsSpy = (range) => {
        assert.equal(range.from, 'resolved-v1.0.0');
        assert.equal(range.to, 'resolved-HEAD');
    };

    const plan = await prepareRelease({
        git: makeGit({ commits: FEATURE_COMMITS, listCommitsSpy }),
        cwd,
        env: { RELEASE_DATE: '2026-09-22' },
        baseline: 'v1.0.0',
        mode: 'check'
    });

    assert.equal(plan.released, true);
    assert.equal(plan.version, '1.1.0');
    assert.equal(plan.tag, 'v1.1.0');
    assert.equal(plan.branch, 'chore/release-v1.1.0');
});

test('a release with no bump-worthy commits reports nothing to release', async (t) => {
    const cwd = await makeRepo(t, { version: '1.0.0' });
    const before = await readFile(cwd, 'package.json');

    const plan = await prepareRelease({
        git: makeGit({ commits: [commit('docs(readme): tidy wording')] }),
        cwd,
        env: { RELEASE_DATE: '2026-09-22' },
        baseline: 'v1.0.0',
        mode: 'write'
    });

    assert.equal(plan.released, false);
    assert.match(plan.reason, /no releas/i);
    assert.deepEqual(plan.changes, []);
    assert.equal(await readFile(cwd, 'package.json'), before);
});

test('a dirty working tree fails closed', async (t) => {
    const cwd = await makeRepo(t);

    await assert.rejects(
        prepareRelease({
            git: makeGit({ status: { clean: false, entries: [' M src/app.js'] } }),
            cwd,
            env: { RELEASE_DATE: '2026-09-22' },
            bootstrap: true,
            mode: 'check'
        }),
        (error) => error instanceof ReleaseError && error.code === 'dirty-tree'
    );
});

test('a normal release without a baseline fails closed', async (t) => {
    const cwd = await makeRepo(t, { version: '1.0.0' });

    await assert.rejects(
        prepareRelease({
            git: makeGit(),
            cwd,
            env: { RELEASE_DATE: '2026-09-22' },
            mode: 'check'
        }),
        (error) => error instanceof ReleaseError && error.code === 'missing-baseline'
    );
});

test('an unresolvable baseline fails closed', async (t) => {
    const cwd = await makeRepo(t, { version: '1.0.0' });
    const verifyCommit = () => {
        throw new ReleaseError('ambiguous ref', 'ambiguous-ref');
    };

    await assert.rejects(
        prepareRelease({
            git: makeGit({ verifyCommit }),
            cwd,
            env: { RELEASE_DATE: '2026-09-22' },
            baseline: 'HEAD~oops',
            mode: 'check'
        }),
        (error) => error instanceof ReleaseError && error.code === 'ambiguous-ref'
    );
});

test('a malformed commit aborts the whole preparation (fail closed)', async (t) => {
    const cwd = await makeRepo(t);

    await assert.rejects(
        prepareRelease({
            git: makeGit({ commits: [commit('totally not conventional')] }),
            cwd,
            env: { RELEASE_DATE: '2026-09-22' },
            bootstrap: false,
            baseline: 'v6.29.0',
            mode: 'write'
        }),
        (error) => error instanceof ReleaseError && error.code === 'malformed-commit'
    );

    // Nothing was written before the failure.
    const manifest = JSON.parse(await readFile(cwd, 'package.json'));
    assert.equal(manifest.version, '6.29.0-BETA');
    assert.equal(fs.existsSync(path.join(cwd, RELEASE_DOC_PATH)), false);
});

test('a duplicate release version fails closed and writes nothing', async (t) => {
    const changelog = [
        '# Changelog',
        '',
        'intro',
        '',
        '## [1.0.0] - 2020-01-01',
        '',
        '### Features',
        '',
        '- already released',
        ''
    ].join('\n');
    const cwd = await makeRepo(t, { changelog });
    const before = await readFile(cwd, 'package.json');

    await assert.rejects(
        prepareRelease({
            git: makeGit(),
            cwd,
            env: { RELEASE_DATE: '2026-09-22' },
            bootstrap: true,
            mode: 'write'
        }),
        ReleaseError
    );

    assert.equal(await readFile(cwd, 'package.json'), before);
});

test('SOURCE_DATE_EPOCH is honored when RELEASE_DATE is absent', async (t) => {
    const cwd = await makeRepo(t);

    const plan = await prepareRelease({
        git: makeGit(),
        cwd,
        env: { SOURCE_DATE_EPOCH: '1758499200' }, // 2025-09-22
        bootstrap: true,
        mode: 'check'
    });

    assert.equal(plan.releaseDate.iso, '2025-09-22');
});

test('an unsafe generated doc path fails closed', async (t) => {
    const cwd = await makeRepo(t);

    await assert.rejects(
        prepareRelease({
            git: makeGit(),
            cwd,
            env: { RELEASE_DATE: '2026-09-22' },
            bootstrap: true,
            mode: 'write',
            docPath: '../../etc/evil.md'
        }),
        (error) => error instanceof ReleaseError && error.code === 'unsafe-path'
    );
});
