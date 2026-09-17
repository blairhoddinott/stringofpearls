'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRYPOINT = path.join(ROOT, 'public/assets/scripts/server/index.js');
const REQUEST_TIMEOUT_MS = 3000;
const PROCESS_TIMEOUT_MS = 5000;

function request(port, requestPath) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: '127.0.0.1',
            path: requestPath,
            port
        }, (response) => {
            const chunks = [];

            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve({
                body: Buffer.concat(chunks).toString('utf8'),
                statusCode: response.statusCode
            }));
        });

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error(`request timed out: ${requestPath}`));
        });
        req.once('error', reject);
    });
}

function waitForExit(child) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
    });
}

function waitForBoundPort(child, exitPromise) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        const timeout = setTimeout(() => {
            reject(new Error('server did not report its bound port within 5 seconds'));
        }, PROCESS_TIMEOUT_MS);

        const finish = (callback, value) => {
            clearTimeout(timeout);
            child.stdout.removeListener('data', onData);
            callback(value);
        };
        const onData = (chunk) => {
            stdout += chunk;
            const match = stdout.match(/Listening on PORT (\d+)/);
            const port = match ? Number(match[1]) : 0;

            if (port > 0) {
                finish(resolve, port);
            }
        };

        child.stdout.on('data', onData);
        exitPromise.then((exit) => {
            finish(reject, new Error(`server exited before reporting its bound port: ${JSON.stringify(exit)}`));
        }, (error) => finish(reject, error));
    });
}

function waitWithTimeout(promise, onTimeout) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            try {
                resolve(onTimeout());
            } catch (error) {
                reject(error);
            }
        }, PROCESS_TIMEOUT_MS);

        promise.then((value) => {
            clearTimeout(timeout);
            resolve(value);
        }, (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

async function stopChild(child, exitPromise) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return exitPromise;
    }

    child.kill('SIGTERM');
    const gracefulExit = await waitWithTimeout(exitPromise, () => null);

    if (gracefulExit) {
        return gracefulExit;
    }

    child.kill('SIGKILL');

    return waitWithTimeout(exitPromise, () => {
        throw new Error('server did not exit after SIGKILL');
    });
}

async function main() {
    const child = spawn(process.execPath, [SERVER_ENTRYPOINT], {
        cwd: ROOT,
        env: { ...process.env, PORT: '0' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const exitPromise = waitForExit(child);
    let stderr = '';

    child.stderr.on('data', (chunk) => { stderr += chunk; });

    try {
        const port = await waitForBoundPort(child, exitPromise);
        const root = await request(port, '/');

        assert.strictEqual(root.statusCode, 200);
        assert.match(root.body, /<title>String of Pearls Air Traffic Control Simulator<\/title>/);

        const airportList = await request(port, '/assets/airports/airportLoadList.json');
        assert.strictEqual(airportList.statusCode, 200);
        assert.ok(Array.isArray(JSON.parse(airportList.body)));

        const missing = await request(port, '/missing');
        assert.strictEqual(missing.statusCode, 404);

        const traversal = await request(port, '/assets/%2e%2e/index.html');
        assert.strictEqual(traversal.statusCode, 404);
        assert.doesNotMatch(traversal.body, /<title>String of Pearls/);
    } finally {
        const exit = await stopChild(child, exitPromise);

        assert.ok(exit.code === 0 || exit.signal === 'SIGTERM', stderr);
    }

    process.stdout.write('server contract passed: ephemeral port, bounded requests, root, asset, 404, traversal, shutdown\n');
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
