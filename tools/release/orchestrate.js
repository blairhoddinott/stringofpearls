'use strict';

const fsp = require('fs/promises');

const { ReleaseError } = require('./errors');
const { resolveWithinRoot } = require('./paths');
const {
    prepareRelease,
    MANIFEST_PATH,
    LOCKFILE_PATH,
    CHANGELOG_PATH,
    RELEASE_DOC_PATH
} = require('./prepare');
const {
    classifyMasterPush,
    selectReleaseBaseline,
    resolveOpenReleasePr,
    buildReleasePullRequest,
    buildGitHubRelease,
    verifyReleaseArtifactsAgree,
    reconcileExistingRelease,
    releaseTagForVersion
} = require('./lifecycle');
const { withAskpass } = require('./askpass');
const { BASE_BRANCH } = require('./constants');


const DEFAULT_IO = {
    readFile: (file) => fsp.readFile(file, 'utf8'),
    async writeFile(file, contents) {
        await fsp.mkdir(require('path').dirname(file), { recursive: true });
        await fsp.writeFile(file, contents);
    }
};
const GENERATED_RELEASE_PATHS = [MANIFEST_PATH, LOCKFILE_PATH, CHANGELOG_PATH, RELEASE_DOC_PATH].sort();

/**
 * Drive the full master-push release lifecycle.
 *
 * This is the single side-effecting entry point. Every collaborator — the git
 * command runner, the GitHub API client, the filesystem reader, the preparation
 * function, and the askpass wrapper — is injected, so the whole control flow is
 * exercised against fakes with no real token, key, or network. The pure
 * decisions live in `lifecycle.js`; this function only sequences them and the
 * effects they authorize.
 *
 * @param {object} options
 * @param {string} options.sha the pushed master commit
 * @param {object} options.git git collaborator (see git.js)
 * @param {object} options.api GitHub API client (see github.js)
 * @param {string} options.token the push token, read from the environment by the caller
 * @param {Record<string, string|undefined>} options.env
 * @param {string} options.cwd repository root
 * @param {object} [options.io] filesystem reader
 * @param {Function} [options.prepare] preparation function
 * @param {Function} [options.askpass] askpass wrapper
 * @param {string} [options.remote] git remote name
 * @param {(message: string) => void} [options.logger]
 * @returns {Promise<object>} a description of the action taken
 */
async function runReleaseLifecycle(options) {
    const {
        sha,
        git,
        api,
        token,
        env = process.env,
        cwd,
        io = DEFAULT_IO,
        prepare = prepareRelease,
        askpass = withAskpass,
        remote = 'origin',
        logger = () => {}
    } = options;

    if (typeof sha !== 'string' || sha.length === 0) {
        throw new ReleaseError('a pushed commit sha is required', 'invalid-argument');
    }

    const currentMaster = await api.getBranchHead(BASE_BRANCH);

    if (currentMaster !== sha) {
        throw new ReleaseError('the triggering commit is no longer the current master tip', 'stale-event');
    }

    const localHead = await git.revParse('HEAD');

    if (localHead !== sha) {
        throw new ReleaseError('checked-out HEAD does not match the triggering master commit', 'wrong-checkout');
    }

    const status = await git.status();

    if (!status || status.clean !== true) {
        throw new ReleaseError('release workflow checkout is dirty', 'dirty-tree');
    }

    const associatedPulls = await api.listCommitPulls(sha);
    const classification = classifyMasterPush({ mergeCommitSha: sha, associatedPulls });

    switch (classification.kind) {
        case 'none':
            logger(`no release action: ${classification.reason}`);
            return { action: 'noop', reason: classification.reason };
        case 'feature-merge':
            return prepareAndOpenReleasePr({ sha, git, api, token, env, cwd, io, prepare, askpass, remote, logger });
        case 'release-pr':
            return publishRelease({
                version: classification.version,
                pull: classification.pull,
                sha,
                git,
                api,
                token,
                cwd,
                io,
                askpass,
                remote,
                logger
            });
        default:
            throw new ReleaseError(`unhandled classification: ${classification.kind}`, 'invalid-state');
    }
}

async function prepareAndOpenReleasePr({ sha, git, api, token, env, cwd, io, prepare, askpass, remote, logger }) {
    const openPulls = await api.listOpenPulls();
    resolveOpenReleasePr({ openPulls, version: 'the next release' });

    const tagNames = await git.listSemverTags();
    const { bootstrap, baseline } = selectReleaseBaseline({ tagNames });

    // A non-bootstrap baseline is a signed tag; verify its signature before we
    // trust it as the range anchor.
    if (!bootstrap) {
        await git.verifyTag(baseline);
    }

    const releaseEnv = { ...env };

    if (!releaseEnv.RELEASE_DATE && !releaseEnv.SOURCE_DATE_EPOCH) {
        releaseEnv.RELEASE_DATE = await git.commitDate(sha);
    }

    const plan = await prepare({ git, cwd, env: releaseEnv, bootstrap, baseline, mode: 'write', io });

    if (!plan.released) {
        logger(`nothing to release: ${plan.reason}`);
        return { action: 'noop', reason: plan.reason };
    }

    const { version, tag, branch } = plan;


    // Stage exactly the generated files, produce a forced signature, verify it
    // locally, and only then push.
    await git.checkoutBranch(branch);
    await git.addPaths(plan.changes.map((change) => change.path));
    await git.signedCommit({ message: plan.commitMessage });
    await git.verifyCommitSignature('HEAD');

    await askpass({ token }, (gitEnv) => git.pushBranch({ remote, branch, env: gitEnv }));


    const payload = buildReleasePullRequest({
        version,
        tag,
        releaseBody: plan.releaseBody,
        previousVersion: plan.previousVersion
    });
    const pull = await api.createPull(payload);

    logger(`opened release PR for ${tag}`);
    return { action: 'opened-release-pr', version, tag, pull };
}

async function publishRelease({ version, pull, sha, git, api, token, cwd, io, askpass, remote, logger }) {
    const releaseHead = pull.head.sha;
    const parents = await git.commitParents(sha);

    if (parents.length !== 2 || parents[1] !== releaseHead) {
        throw new ReleaseError('release PR must be merged with its signed head as the second parent', 'untrusted-release-merge');
    }

    await git.verifyCommitSignature(releaseHead);

    const changedPaths = (await git.changedPaths(parents[0], sha)).sort();

    if (JSON.stringify(changedPaths) !== JSON.stringify(GENERATED_RELEASE_PATHS)) {
        throw new ReleaseError('release PR merge changed files outside the four generated artifacts', 'unexpected-release-diff');
    }

    const [manifestText, lockText, changelogText, latestReleaseDocText] = await Promise.all([
        io.readFile(resolveWithinRoot(cwd, MANIFEST_PATH)),
        io.readFile(resolveWithinRoot(cwd, LOCKFILE_PATH)),
        io.readFile(resolveWithinRoot(cwd, CHANGELOG_PATH)),
        io.readFile(resolveWithinRoot(cwd, RELEASE_DOC_PATH))
    ]);

    const agreed = verifyReleaseArtifactsAgree({ manifestText, lockText, changelogText, latestReleaseDocText });

    if (agreed.version !== version) {
        throw new ReleaseError(
            `merged release PR is for ${version} but its artifacts describe ${agreed.version}`,
            'artifact-mismatch'
        );
    }

    const tag = releaseTagForVersion(version);

    // Create-and-sign the tag unless an identical one already exists (idempotent
    // rerun). A tag pointing at a different commit is a hard conflict.
    const existingTagSha = await git.tagCommit(tag);

    if (existingTagSha) {
        if (existingTagSha !== sha) {
            throw new ReleaseError(
                `tag ${tag} already exists at ${existingTagSha}, not the merge commit`,
                'tag-conflict'
            );
        }

        await git.verifyTag(tag);
        logger(`local tag ${tag} already present and verified`);
    } else {
        await git.signedAnnotatedTag({ tag, message: `Release ${tag}`, commit: sha });
        await git.verifyTag(tag);
    }

    const localTagObject = await git.tagObject(tag);

    await askpass({ token }, async (gitEnv) => {
        let remoteTag = await git.remoteTag({ remote, tag, env: gitEnv });

        if (!remoteTag) {
            await git.pushTag({ remote, tag, env: gitEnv });
            remoteTag = await git.remoteTag({ remote, tag, env: gitEnv });
        }

        if (!remoteTag || remoteTag.commit !== sha || remoteTag.object !== localTagObject) {
            throw new ReleaseError(
                `remote tag ${tag} does not match the locally verified signed tag`,
                'remote-tag-conflict'
            );
        }
    });

    const payload = buildGitHubRelease({ tag, notes: agreed.notes });
    const existingRelease = await api.getReleaseByTag(tag);
    let release;

    if (existingRelease) {
        reconcileExistingRelease({ existing: existingRelease, expected: payload });
        release = existingRelease;
        logger(`GitHub Release for ${tag} already present and matching`);
    } else {
        release = await api.createRelease(payload);
        logger(`published GitHub Release for ${tag}`);
    }

    return { action: 'published', version, tag, release };
}

module.exports = { runReleaseLifecycle };
