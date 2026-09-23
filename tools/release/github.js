'use strict';

const { ReleaseError } = require('./errors');

const API_ROOT = 'https://api.github.com';
const ACCEPT = 'application/vnd.github+json';
const API_VERSION = '2022-11-28';
const USER_AGENT = 'stringofpearls-release-automation';

/**
 * A minimal GitHub REST client for the release automation.
 *
 * The token is supplied once and only ever travels in the `Authorization`
 * request header — never in a URL, a log line, or an error message. Diagnostics
 * are redacted: a failed call reports the method, path, and status, and at most a
 * short slice of the response body, but never the request headers. `fetch` is
 * injectable so the whole client is exercised with a fake in tests, with no real
 * token or network.
 *
 * @param {{ token: string, owner: string, repo: string, fetch?: Function }} config
 */
function createGitHubApi({ token, owner, repo, fetch = globalThis.fetch }) {
    if (typeof token !== 'string' || token.length === 0) {
        throw new ReleaseError('a release automation token is required', 'missing-token');
    }

    if (typeof fetch !== 'function') {
        throw new ReleaseError('a fetch implementation is required', 'invalid-fetch');
    }

    const base = `${API_ROOT}/repos/${owner}/${repo}`;

    function headers() {
        return {
            Authorization: `Bearer ${token}`,
            Accept: ACCEPT,
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': USER_AGENT
        };
    }

    async function request(method, url, { body, allow404 = false } = {}) {
        const options = { method, headers: headers() };

        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        let response;

        try {
            response = await fetch(url, options);
        } catch {
            // Never surface the error verbatim; a transport error could in
            // principle echo the request. Report only the redacted route.
            throw new ReleaseError(`github request failed: ${method} ${redactPath(url)}`, 'github-api');
        }

        if (allow404 && response.status === 404) {
            return null;
        }

        if (!response.ok) {
            const detail = await safeSnippet(response, token);
            throw new ReleaseError(
                `github ${method} ${redactPath(url)} -> ${response.status}${detail ? `: ${detail}` : ''}`,
                'github-api'
            );
        }

        return response.json();
    }

    async function requestAllPages(url, label) {
        const items = [];

        for (let page = 1; page <= 100; page += 1) {
            const separator = url.includes('?') ? '&' : '?';
            const batch = await request('GET', `${url}${separator}per_page=100&page=${page}`);

            if (!Array.isArray(batch)) {
                throw new ReleaseError(`github ${label} response must be an array`, 'invalid-api-response');
            }

            items.push(...batch);

            if (batch.length < 100) {
                return items;
            }
        }

        throw new ReleaseError(`github ${label} pagination exceeded 100 pages`, 'invalid-api-response');
    }

    return {
        /**
         * List the pull requests associated with a commit (the merged PR for a
         * push to master). This is the authoritative classification signal.
         */
        listCommitPulls(sha) {
            return requestAllPages(`${base}/commits/${encodeURIComponent(sha)}/pulls`, 'commit-pulls');
        },

        /** List every open pull request, used to serialize release PRs. */
        listOpenPulls() {
            return requestAllPages(`${base}/pulls?state=open`, 'open-pulls');
        },

        async getBranchHead(branch) {
            const ref = await request('GET', `${base}/git/ref/heads/${encodeURIComponent(branch)}`);
            const sha = ref && ref.object && ref.object.type === 'commit' && ref.object.sha;

            if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
                throw new ReleaseError('github branch response did not contain a commit SHA', 'invalid-api-response');
            }

            return sha;
        },

        createPull({ title, head, base: baseRef, body }) {
            return request('POST', `${base}/pulls`, { body: { title, head, base: baseRef, body } });
        },

        getReleaseByTag(tag) {
            return request('GET', `${base}/releases/tags/${encodeURIComponent(tag)}`, { allow404: true });
        },

        createRelease(payload) {
            return request('POST', `${base}/releases`, { body: payload });
        }
    };
}

// A token never appears in a GitHub API path, but the redaction is defensive:
// query strings are dropped entirely from diagnostics.
function redactPath(url) {
    const queryIndex = url.indexOf('?');

    return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?<redacted>`;
}

async function safeSnippet(response, token) {
    try {
        const text = await response.text();

        return text.replaceAll(token, '[REDACTED]').replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
        return '';
    }
}

module.exports = { createGitHubApi };
