'use strict';

const { JSDOM } = require('jsdom');

const dom = new JSDOM('', {
    url: 'http://localhost/'
});

global.window = dom.window;
