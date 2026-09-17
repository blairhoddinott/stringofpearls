'use strict';

const eslint = require('@eslint/js');
const globals = require('globals');
const importX = require('eslint-plugin-import-x');

const maintainedJavaScript = [
    'src/**/*.js',
    'test/**/*.js',
    'tools/**/*.js',
    'eslint.config.js'
];

module.exports = [
    {
        ignores: [
            'coverage/**',
            'node_modules/**',
            'public/**'
        ]
    },
    {
        ...eslint.configs.recommended,
        files: maintainedJavaScript,
        rules: {
            ...eslint.configs.recommended.rules,
            'no-trailing-spaces': 'error'
        }
    },
    {
        ...importX.flatConfigs.recommended,
        files: maintainedJavaScript,
        rules: {
            ...importX.flatConfigs.recommended.rules,
            // Existing dependency cycles are tracked as architecture debt in the modernization audit.
            'import-x/no-cycle': 'off'
        }
    },
    {
        files: [
            'src/assets/scripts/client/**/*.js',
            'test/**/*.js'
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                prop: 'readonly',
                zlsa: 'readonly'
            }
        },
        rules: {
            'no-console': 'off',
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^(event|error)$'
                }
            ]
        }
    },
    {
        files: ['test/**/*.js'],
        rules: {
            'import-x/no-named-as-default-member': 'off'
        }
    },
    {
        files: ['tools/browser-smoke/smoke.js'],
        languageOptions: {
            globals: globals.browser
        }
    },
    {
        files: ['tools/build.js'],
        rules: {
            // AggregateError.errors already retains both caught errors.
            'preserve-caught-error': 'off'
        }
    },
    {
        files: [
            'src/assets/scripts/server/**/*.js',
            'tools/**/*.js',
            'eslint.config.js'
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            'no-console': 'off'
        }
    }
];
