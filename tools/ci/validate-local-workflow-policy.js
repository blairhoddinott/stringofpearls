'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const WORKFLOW_DIRECTORY = path.resolve(__dirname, '../../.github/workflows');
const APPROVED_WORKFLOW_DIGESTS = Object.freeze({
    'local-ci.yml': 'd1cb21439ad0703118a35e9f505ec3f05672fd2b6d0b3e7de7a188a86e55ad35',
    'local-master-acceptance.yml': '41b3441713cc1cc0f8fa04b751086f8650d013b3f147f622e8cc2d8c23f8b6bc',
    'local-release.yml': '5d5e1025e1598f04a50577b7081b63680d35658e525ee4973e07f269f89f64d5'
});

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize(value[key])])
        );
    }

    return value;
}

function parseWorkflow(source) {
    let containsAlias = false;
    const workflow = yaml.safeLoad(source, {
        json: false,
        listener(event, state) {
            if (Object.keys(state.anchorMap || {}).length > 0) {
                containsAlias = true;
            }
        }
    });

    if (containsAlias) {
        throw new Error('YAML anchors, aliases, and merge keys are not allowed');
    }

    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
        throw new Error('workflow root must be a mapping');
    }

    return workflow;
}

function workflowDigest(source) {
    const serialized = JSON.stringify(canonicalize(parseWorkflow(source)));

    return crypto.createHash('sha256').update(serialized).digest('hex');
}

function validateWorkflowSet(workflows) {
    const expectedFiles = Object.keys(APPROVED_WORKFLOW_DIGESTS).sort();
    const workflowFiles = Object.keys(workflows).sort();

    if (JSON.stringify(workflowFiles) !== JSON.stringify(expectedFiles)) {
        return [`workflow set must contain exactly ${expectedFiles.join(', ')}; found ${workflowFiles.join(', ') || 'none'}`];
    }

    const failures = [];

    for (const file of expectedFiles) {
        try {
            const digest = workflowDigest(workflows[file]);

            if (digest !== APPROVED_WORKFLOW_DIGESTS[file]) {
                failures.push(`${file} semantics do not match the approved policy: ${digest}`);
            }
        } catch (error) {
            failures.push(`${file} YAML is not allowed: ${error.message}`);
        }
    }

    return failures;
}

function loadWorkflowSet(directory) {
    const workflows = {};

    for (const file of fs.readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)).sort()) {
        workflows[file] = fs.readFileSync(path.join(directory, file), 'utf8');
    }

    return workflows;
}

function expectRejected(description, workflows, failures) {
    if (validateWorkflowSet(workflows).length === 0) {
        failures.push(`mutation was not rejected: ${description}`);
    }
}

function replaceWorkflow(workflows, file, transform) {
    return {
        ...workflows,
        [file]: transform(workflows[file])
    };
}

function validateMutationResistance(workflows) {
    const failures = [];
    const branchFile = 'local-ci.yml';
    const acceptanceFile = 'local-master-acceptance.yml';
    const releaseFile = 'local-release.yml';

    expectRejected('extra workflow file', {
        ...workflows,
        'bypass.yml': 'name: bypass\non: pull_request\njobs: {}\n'
    }, failures);

    const missingAcceptance = {...workflows};
    delete missingAcceptance[acceptanceFile];
    expectRejected('missing acceptance workflow', missingAcceptance, failures);

    const missingRelease = {...workflows};
    delete missingRelease[releaseFile];
    expectRejected('missing release workflow', missingRelease, failures);

    for (const file of [branchFile, acceptanceFile, releaseFile]) {
        expectRejected(`extra expression-named required-context job in ${file}`, replaceWorkflow(
            workflows,
            file,
            (baseline) => `${baseline}\n${[
                '  "spoof-master":',
                "    name: ${{ 'Master acceptance' }}",
                '    runs-on : ubuntu-latest',
                '    steps: []',
                ''
            ].join('\n')}`
        ), failures);

        expectRejected(`removed actor gates in ${file}`, replaceWorkflow(
            workflows,
            file,
            (baseline) => baseline.replaceAll("github.actor == 'blairhoddinott' &&\n", '')
        ), failures);

        expectRejected(`external checkout override in ${file}`, replaceWorkflow(
            workflows,
            file,
            (baseline) => baseline.replace(
                '          fetch-depth: 0\n',
                '          fetch-depth: 0\n          repository: attacker/untrusted\n'
            )
        ), failures);

        expectRejected(`extra action with a spaced mapping key in ${file}`, replaceWorkflow(
            workflows,
            file,
            (baseline) => baseline.replace(
                '      - name: Verify runner toolchain\n',
                '      - name: Untrusted action\n        uses : attacker/untrusted-action@0123456789abcdef0123456789abcdef01234567\n\n      - name: Verify runner toolchain\n'
            )
        ), failures);
    }

    expectRejected('neutralized same-repository gate', replaceWorkflow(
        workflows,
        acceptanceFile,
        (baseline) => baseline.replace(
            'github.event.pull_request.head.repo.full_name == github.repository &&',
            '(true || github.event.pull_request.head.repo.full_name == github.repository) &&'
        )
    ), failures);

    // --- release-workflow-specific mutations -------------------------------
    // The release workflow is the only privileged, token-bearing workflow, so
    // its trigger, guards, runner routing, permissions, and signed-release
    // invocation are all pinned by the canonical digest and probed here.

    expectRejected('release trigger moved off master push', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace(
            'on:\n  push:\n    branches:\n      - master\n  workflow_dispatch:\n',
            'on:\n  push:\n    branches:\n      - "*"\n  workflow_dispatch:\n'
        )
    ), failures);

    expectRejected('release direct-master-push routed into branch CI', replaceWorkflow(
        workflows,
        branchFile,
        (baseline) => baseline.replace(
            'on:\n  push:\n    branches-ignore:\n      - master\n',
            'on:\n  push:\n    branches:\n      - master\n'
        )
    ), failures);

    expectRejected('release repository gate removed', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace("github.repository == 'blairhoddinott/stringofpearls' &&\n", '')
    ), failures);

    expectRejected('release repository gate neutralized', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace(
            "github.repository == 'blairhoddinott/stringofpearls' &&",
            "(true || github.repository == 'blairhoddinott/stringofpearls') &&"
        )
    ), failures);

    expectRejected('release triggering-actor gate neutralized', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace(
            "github.triggering_actor == 'blairhoddinott'",
            'true'
        )
    ), failures);

    expectRejected('release current-ref gate neutralized', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace("github.ref == 'refs/heads/master' &&", 'true &&')
    ), failures);

    expectRejected('release rerun guard neutralized', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace('github.run_attempt == 1 &&', 'true &&')
    ), failures);

    expectRejected('release routed to a hosted runner', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace(
            'runs-on: [self-hosted, linux, x64, stringofpearls-release]',
            'runs-on: ubuntu-latest'
        )
    ), failures);

    expectRejected('release routed to the general self-hosted runner', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace('stringofpearls-release]', 'stringofpearls-ci]')
    ), failures);

    expectRejected('release permissions widened', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n')
    ), failures);

    expectRejected('release token echoed to the log', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace(
            'run: node tools/release/lifecycle-cli.js\n',
            'run: echo "${{ secrets.RELEASE_AUTOMATION_TOKEN }}"\n'
        )
    ), failures);

    expectRejected('release token placed on the command line', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace(
            'run: node tools/release/lifecycle-cli.js\n',
            'run: node tools/release/lifecycle-cli.js --token "${{ secrets.RELEASE_AUTOMATION_TOKEN }}"\n'
        )
    ), failures);

    expectRejected('release signing invocation neutralized', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => baseline.replace('run: node tools/release/lifecycle-cli.js\n', "run: 'true'\n")
    ), failures);

    expectRejected('release gains an extra job', replaceWorkflow(
        workflows,
        releaseFile,
        (baseline) => `${baseline}\n${[
            '  smuggle:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - run: echo smuggle',
            ''
        ].join('\n')}`
    ), failures);

    expectRejected('duplicate mapping key', replaceWorkflow(
        workflows,
        branchFile,
        (baseline) => baseline.replace('permissions:\n', 'permissions:\npermissions:\n')
    ), failures);

    expectRejected('YAML anchor and alias', replaceWorkflow(
        workflows,
        acceptanceFile,
        (baseline) => baseline.replace(
            'permissions:\n  contents: read\n',
            'permissions: &permissions\n  contents: read\npermissions-copy: *permissions\n'
        )
    ), failures);

    return failures;
}

const workflows = loadWorkflowSet(WORKFLOW_DIRECTORY);
const failures = [
    ...validateWorkflowSet(workflows),
    ...validateMutationResistance(workflows)
];

if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`error: ${failure}`);
    }

    process.exitCode = 1;
} else {
    console.log('parsed local CI workflow policy and mutation resistance are valid');
}
