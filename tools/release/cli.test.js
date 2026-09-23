'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { run, parseCliArguments } = require('./cli');
const { ReleaseError } = require('./errors');

function makePlan(overrides = {}) {
    return {
        released: true,
        bootstrap: true,
        mode: 'check',
        version: '1.0.0',
        previousVersion: '6.29.0-BETA',
        tag: 'v1.0.0',
        branch: 'chore/release-v1.0.0',
        commitMessage: 'chore(release): v1.0.0',
        releaseDate: { iso: '2026-09-22', long: 'September 22, 2026' },
        commitCount: 2,
        changes: [{ path: 'package.json', contents: '{}' }],
        ...overrides
    };
}

function makeStreams() {
    const out = [];
    const err = [];

    return {
        out,
        err,
        stdout: { write: (text) => out.push(text) },
        stderr: { write: (text) => err.push(text) }
    };
}

test('parseCliArguments reads mode and baseline flags', () => {
    assert.deepEqual(parseCliArguments(['--check']), { mode: 'check', bootstrap: false, baseline: null });
    assert.deepEqual(parseCliArguments(['--prepare', '--bootstrap']), { mode: 'write', bootstrap: true, baseline: null });
    assert.deepEqual(parseCliArguments(['--check', '--baseline', 'v1.0.0']), { mode: 'check', bootstrap: false, baseline: 'v1.0.0' });
});

test('parseCliArguments rejects unknown flags', () => {
    assert.throws(() => parseCliArguments(['--nope']), ReleaseError);
});

test('run prints the plan and exits zero in check mode', async () => {
    const streams = makeStreams();
    let received;

    const code = await run(['--check', '--bootstrap'], {
        streams,
        prepare: async (options) => {
            received = options;
            return makePlan();
        }
    });

    assert.equal(code, 0);
    assert.equal(received.mode, 'check');
    assert.equal(received.bootstrap, true);
    assert.match(streams.out.join(''), /1\.0\.0/);
    assert.match(streams.out.join(''), /chore\/release-v1\.0\.0/);
    assert.equal(streams.err.join(''), '');
});

test('run reports a nothing-to-release plan and exits zero', async () => {
    const streams = makeStreams();

    const code = await run(['--check'], {
        streams,
        prepare: async () => ({ released: false, reason: 'no releasable commits', changes: [] })
    });

    assert.equal(code, 0);
    assert.match(streams.out.join(''), /no releasable commits/i);
});

test('run fails closed on a ReleaseError with a single-line diagnostic', async () => {
    const streams = makeStreams();

    const code = await run(['--check'], {
        streams,
        prepare: async () => {
            throw new ReleaseError('working tree is dirty', 'dirty-tree');
        }
    });

    assert.equal(code, 1);
    assert.match(streams.err.join(''), /working tree is dirty/);
    assert.doesNotMatch(streams.err.join(''), /\n.*\n.*\n/); // not a multi-line stack trace
});
