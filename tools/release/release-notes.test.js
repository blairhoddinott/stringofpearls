'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { groupCommits, renderCommitEntry, renderReleaseBody } = require('./release-notes');
const { parseCommit } = require('./conventional-commits');

const REPO_URL = 'https://github.com/blairhoddinott/stringofpearls';

function commit(subject, body) {
    return parseCommit({ hash: 'abcdef1234567890', subject, body });
}

test('renderCommitEntry renders scope, description, and a linked short hash', () => {
    const entry = renderCommitEntry(commit('feat(traffic): add mode selection'), { repoUrl: REPO_URL });

    assert.equal(
        entry,
        '- **traffic:** add mode selection ([`abcdef1`](https://github.com/blairhoddinott/stringofpearls/commit/abcdef1234567890))'
    );
});

test('renderCommitEntry omits the scope prefix when there is no scope', () => {
    const entry = renderCommitEntry(commit('fix: stop duplicate handoffs'), { repoUrl: REPO_URL });

    assert.equal(
        entry,
        '- stop duplicate handoffs ([`abcdef1`](https://github.com/blairhoddinott/stringofpearls/commit/abcdef1234567890))'
    );
});

test('renderCommitEntry appends the breaking-change note as a sub-bullet', () => {
    const entry = renderCommitEntry(
        commit('feat(api)!: drop legacy parser', 'BREAKING CHANGE: the old parser is gone.'),
        { repoUrl: REPO_URL }
    );

    assert.equal(
        entry,
        '- **api:** drop legacy parser ([`abcdef1`](https://github.com/blairhoddinott/stringofpearls/commit/abcdef1234567890))\n'
            + '  - BREAKING CHANGE: the old parser is gone.'
    );
});

test('renderCommitEntry omits the link when the commit has no hash', () => {
    const entry = renderCommitEntry(parseCommit({ hash: '', subject: 'fix: no hash here' }), { repoUrl: REPO_URL });

    assert.equal(entry, '- no hash here');
});

test('groupCommits keeps only non-empty groups in canonical order', () => {
    const commits = [
        commit('chore: tidy'),
        commit('feat(a): one'),
        commit('fix(b): two'),
        commit('feat(c): three'),
        commit('refactor!: four')
    ];

    const groups = groupCommits(commits);

    assert.deepEqual(groups.map((group) => group.key), ['breaking', 'features', 'fixes', 'maintenance']);
    assert.deepEqual(groups.find((group) => group.key === 'features').commits.map((entry) => entry.description), ['one', 'three']);
    assert.equal(groups.find((group) => group.key === 'breaking').commits.length, 1);
});

test('renderReleaseBody renders grouped sections with headings', () => {
    const body = renderReleaseBody(
        [commit('feat(traffic): add mode selection'), commit('fix(ci): isolate context')],
        { repoUrl: REPO_URL }
    );

    assert.equal(
        body,
        [
            '### Features',
            '',
            '- **traffic:** add mode selection ([`abcdef1`](https://github.com/blairhoddinott/stringofpearls/commit/abcdef1234567890))',
            '',
            '### Bug Fixes',
            '',
            '- **ci:** isolate context ([`abcdef1`](https://github.com/blairhoddinott/stringofpearls/commit/abcdef1234567890))'
        ].join('\n')
    );
});

test('renderReleaseBody falls back to a placeholder when there are no commits', () => {
    assert.equal(renderReleaseBody([], { repoUrl: REPO_URL }), '_No notable changes._');
});
