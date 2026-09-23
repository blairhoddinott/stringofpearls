'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveLifecycleEnv, run } = require('./lifecycle-cli');
const { ReleaseError } = require('./errors');
const { TOKEN_ENV_VAR } = require('./constants');

const VALID_ENV = {
    GITHUB_SHA: 'a3be41feaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    GITHUB_REPOSITORY: 'blairhoddinott/stringofpearls',
    [TOKEN_ENV_VAR]: 'tok'
};

function makeStreams() {
    const out = [];
    const err = [];
    return { out, err, stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => err.push(t) } };
}

test('resolveLifecycleEnv returns the sha, token and fixed owner/repo', () => {
    const resolved = resolveLifecycleEnv(VALID_ENV);

    assert.equal(resolved.sha, VALID_ENV.GITHUB_SHA);
    assert.equal(resolved.token, 'tok');
    assert.equal(resolved.owner, 'blairhoddinott');
    assert.equal(resolved.repo, 'stringofpearls');
});

test('resolveLifecycleEnv fails closed on a foreign repository', () => {
    assert.throws(() => resolveLifecycleEnv({ ...VALID_ENV, GITHUB_REPOSITORY: 'attacker/evil' }), (error) => {
        assert.ok(error instanceof ReleaseError);
        assert.equal(error.code, 'invalid-repository');
        return true;
    });
});

test('resolveLifecycleEnv fails closed on a missing token and never echoes it', () => {
    assert.throws(() => resolveLifecycleEnv({ ...VALID_ENV, [TOKEN_ENV_VAR]: '' }), (error) => {
        assert.equal(error.code, 'missing-token');
        return true;
    });
});

test('resolveLifecycleEnv rejects a malformed commit sha', () => {
    assert.throws(() => resolveLifecycleEnv({ ...VALID_ENV, GITHUB_SHA: 'not-a-sha' }), ReleaseError);
});

test('run invokes the orchestrator and reports the action, never printing the token', async () => {
    const streams = makeStreams();
    let received;

    const code = await run({
        env: VALID_ENV,
        streams,
        cwd: '/repo',
        makeGit: () => ({ kind: 'git' }),
        makeApi: (config) => ({ kind: 'api', config }),
        orchestrate: async (options) => { received = options; return { action: 'opened-release-pr', tag: 'v1.0.0' }; }
    });

    assert.equal(code, 0);
    assert.equal(received.sha, VALID_ENV.GITHUB_SHA);
    assert.equal(received.token, 'tok');
    const printed = streams.out.join('') + streams.err.join('');
    assert.ok(!printed.includes('tok'));
    assert.match(streams.out.join(''), /opened-release-pr/);
});

test('run fails closed with a redacted single-line diagnostic on a ReleaseError', async () => {
    const streams = makeStreams();

    const code = await run({
        env: VALID_ENV,
        streams,
        cwd: '/repo',
        makeGit: () => ({}),
        makeApi: () => ({}),
        orchestrate: async () => { throw new ReleaseError('release conflict', 'release-conflict'); }
    });

    assert.equal(code, 1);
    assert.match(streams.err.join(''), /release-conflict/);
    assert.ok(!streams.err.join('').includes('tok'));
});
