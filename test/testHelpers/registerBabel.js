'use strict';

const babelRegister = require('@babel/register');

babelRegister({
    babelrc: false,
    configFile: false,
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    node: 'current'
                }
            }
        ]
    ],
    retainLines: true,
    sourceMaps: false
});
