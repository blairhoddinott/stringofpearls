'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { withAskpass } = require('./askpass');
const { ReleaseError } = require('./errors');

test('withAskpass provisions a private helper that echoes the token from the environment only', async () => {
    let helperPath;
    let capturedEnv;

    const output = await withAskpass({ token: 's3cr3t' }, async (gitEnv) => {
        capturedEnv = gitEnv;
        helperPath = gitEnv.GIT_ASKPASS;

        // The helper is mode 0700 and lives outside the repository tree.
        const mode = fs.statSync(helperPath).mode & 0o777;
        assert.equal(mode, 0o700);

        // The token is not baked into the helper file; it comes from the environment.
        const script = fs.readFileSync(helperPath, 'utf8');
        assert.ok(!script.includes('s3cr3t'));

        assert.equal(gitEnv.GIT_TERMINAL_PROMPT, '0');
        assert.equal(gitEnv.RELEASE_AUTOMATION_TOKEN, 's3cr3t');

        // Invoking the helper as git would (Password prompt) yields the token.
        const { stdout } = await execFileAsync(helperPath, ['Password for https://github.com:'], {
            env: { ...process.env, RELEASE_AUTOMATION_TOKEN: 's3cr3t' }
        });
        return stdout.trim();
    });

    assert.equal(output, 's3cr3t');
    // The helper directory is removed in the finally block.
    assert.equal(fs.existsSync(helperPath), false);
    assert.equal(capturedEnv.GIT_ASKPASS, helperPath);
});

test('the helper answers a username prompt with x-access-token', async () => {
    let username;

    await withAskpass({ token: 'abc' }, async (gitEnv) => {
        const { stdout } = await execFileAsync(gitEnv.GIT_ASKPASS, ['Username for https://github.com:'], {
            env: { ...process.env, RELEASE_AUTOMATION_TOKEN: 'abc' }
        });
        username = stdout.trim();
    });

    assert.equal(username, 'x-access-token');
});

test('withAskpass deletes the helper even when the callback throws', async () => {
    let helperPath;

    await assert.rejects(() => withAskpass({ token: 'x' }, async (gitEnv) => {
        helperPath = gitEnv.GIT_ASKPASS;
        throw new Error('boom');
    }), /boom/);

    assert.equal(fs.existsSync(helperPath), false);
});

test('withAskpass fails closed on a missing token', async () => {
    await assert.rejects(() => withAskpass({ token: '' }, async () => {}), ReleaseError);
});

test('withAskpass provisions its helper under a fresh temporary directory', async () => {
    let dir;
    await withAskpass({ token: 'x' }, async (gitEnv) => {
        dir = path.dirname(gitEnv.GIT_ASKPASS);
        assert.ok(dir.startsWith(await fsp.realpath(os.tmpdir())) || dir.startsWith(os.tmpdir()));
    });
    assert.equal(fs.existsSync(dir), false);
});
