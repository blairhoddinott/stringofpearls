'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const WORKFLOW_DIRECTORY = path.resolve(__dirname, '../../.github/workflows');
const WORKFLOW_FILE = 'local-ci.yml';
const APPROVED_WORKFLOW_DIGEST = '4a80ae857972a6068178e50cfd1d26e582335fd816f60b950cac2cbc70cff80c';

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
    const workflowFiles = Object.keys(workflows).sort();

    if (workflowFiles.length !== 1 || workflowFiles[0] !== WORKFLOW_FILE) {
        return [`workflow set must contain only ${WORKFLOW_FILE}; found ${workflowFiles.join(', ') || 'none'}`];
    }

    try {
        const digest = workflowDigest(workflows[WORKFLOW_FILE]);

        if (digest !== APPROVED_WORKFLOW_DIGEST) {
            return [`workflow semantics do not match the approved policy: ${digest}`];
        }
    } catch (error) {
        return [`workflow YAML is not allowed: ${error.message}`];
    }

    return [];
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

function validateMutationResistance(workflows) {
    const failures = [];
    const baseline = workflows[WORKFLOW_FILE];

    expectRejected('extra workflow file', {
        ...workflows,
        'bypass.yml': 'name: bypass\non: pull_request\njobs: {}\n'
    }, failures);

    expectRejected('extra expression-named required-context jobs with YAML spelling variants', {
        [WORKFLOW_FILE]: `${baseline}\n${[
            '  "spoof-branch":',
            "    name: ${{ 'Branch checks' }}",
            '    runs-on : ubuntu-latest',
            '    steps: []',
            '  "spoof-master":',
            "    name: ${{ 'Master acceptance' }}",
            '    runs-on : ubuntu-latest',
            '    steps: []',
            ''
        ].join('\n')}`
    }, failures);

    expectRejected('removed actor gates', {
        [WORKFLOW_FILE]: baseline.replaceAll("github.actor == 'blairhoddinott' &&\n", '')
    }, failures);

    expectRejected('neutralized same-repository gate', {
        [WORKFLOW_FILE]: baseline.replaceAll(
            'github.event.pull_request.head.repo.full_name == github.repository &&',
            '(true || github.event.pull_request.head.repo.full_name == github.repository) &&'
        )
    }, failures);

    expectRejected('external checkout override', {
        [WORKFLOW_FILE]: baseline.replace(
            '          fetch-depth: 0\n',
            '          fetch-depth: 0\n          repository: attacker/untrusted\n'
        )
    }, failures);

    expectRejected('extra action with whitespace before the mapping colon', {
        [WORKFLOW_FILE]: baseline.replace(
            '      - name: Verify runner toolchain\n',
            '      - name: Untrusted action\n        uses : attacker/untrusted-action@0123456789abcdef0123456789abcdef01234567\n\n      - name: Verify runner toolchain\n'
        )
    }, failures);

    expectRejected('duplicate mapping key', {
        [WORKFLOW_FILE]: baseline.replace('permissions:\n', 'permissions:\npermissions:\n')
    }, failures);

    expectRejected('YAML anchor and alias', {
        [WORKFLOW_FILE]: baseline.replace(
            'permissions:\n  contents: read\n',
            'permissions: &permissions\n  contents: read\npermissions-copy: *permissions\n'
        )
    }, failures);

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
