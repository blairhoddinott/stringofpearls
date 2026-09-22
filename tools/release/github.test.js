'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createGitHubApi } = require('./github');
const { ReleaseError } = require('./errors');

const TOKEN = 'super-secret-token-value';

function fakeFetch(handler) {
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url, options });
        return handler(url, options, calls.length - 1);
    };
    return { fetch, calls };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return body;
        },
        async text() {
            return JSON.stringify(body);
        }
    };
}

function makeApi(fetch) {
    return createGitHubApi({ token: TOKEN, owner: 'blairhoddinott', repo: 'stringofpearls', fetch });
}

test('listCommitPulls calls the commit-associated-PR endpoint with a bearer token', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(200, [{ number: 1 }]));
    const api = makeApi(fetch);

    const pulls = await api.listCommitPulls('deadbeef');

    assert.deepEqual(pulls, [{ number: 1 }]);
    assert.equal(calls[0].url, 'https://api.github.com/repos/blairhoddinott/stringofpearls/commits/deadbeef/pulls?per_page=100&page=1');
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.match(calls[0].options.headers.Accept, /vnd\.github/);
});

test('listCommitPulls paginates before lifecycle classification', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }));
    const { fetch, calls } = fakeFetch((_url, _options, index) => jsonResponse(200, index === 0 ? first : [{ number: 101 }]));
    const api = makeApi(fetch);

    const pulls = await api.listCommitPulls('deadbeef');

    assert.equal(pulls.length, 101);
    assert.match(calls[1].url, /page=2$/);
});

test('the token never appears in the request URL', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(200, []));
    const api = makeApi(fetch);

    await api.listOpenPulls();

    assert.ok(!calls[0].url.includes(TOKEN));
    assert.equal(calls[0].url, 'https://api.github.com/repos/blairhoddinott/stringofpearls/pulls?state=open&per_page=100&page=1');
});

test('listOpenPulls paginates until GitHub returns a short page', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }));
    const { fetch, calls } = fakeFetch((_url, _options, index) => jsonResponse(200, index === 0 ? first : [{ number: 101 }]));
    const api = makeApi(fetch);

    const pulls = await api.listOpenPulls();

    assert.equal(pulls.length, 101);
    assert.match(calls[1].url, /page=2$/);
});

test('getBranchHead returns the current branch object SHA', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(200, { object: { type: 'commit', sha: 'a'.repeat(40) } }));
    const api = makeApi(fetch);

    assert.equal(await api.getBranchHead('master'), 'a'.repeat(40));
});

test('createPull posts the payload and returns the parsed pull request', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(201, { number: 99, html_url: 'x' }));
    const api = makeApi(fetch);

    const pull = await api.createPull({ title: 't', head: 'chore/release-v1.0.0', base: 'master', body: 'b' });

    assert.equal(pull.number, 99);
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { title: 't', head: 'chore/release-v1.0.0', base: 'master', body: 'b' });
});

test('getReleaseByTag returns null on a 404 rather than throwing', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(404, { message: 'Not Found' }));
    const api = makeApi(fetch);

    assert.equal(await api.getReleaseByTag('v1.2.3'), null);
});

test('createRelease posts the release payload', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(201, { id: 5, tag_name: 'v1.2.3' }));
    const api = makeApi(fetch);

    const release = await api.createRelease({ tag_name: 'v1.2.3', name: 'v1.2.3', body: 'notes', draft: false, prerelease: false });

    assert.equal(release.id, 5);
    assert.equal(calls[0].url, 'https://api.github.com/repos/blairhoddinott/stringofpearls/releases');
    assert.equal(JSON.parse(calls[0].options.body).tag_name, 'v1.2.3');
});

test('a non-ok response fails closed as a ReleaseError without leaking the token', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(500, { message: `echoed ${TOKEN}` }));
    const api = makeApi(fetch);

    await assert.rejects(() => api.listOpenPulls(), (error) => {
        assert.ok(error instanceof ReleaseError);
        assert.ok(!error.message.includes(TOKEN));
        assert.equal(error.code, 'github-api');
        return true;
    });
});

test('createGitHubApi rejects a missing token so the token is never optional', () => {
    assert.throws(() => createGitHubApi({ token: '', owner: 'x', repo: 'y', fetch: async () => {} }), ReleaseError);
});
