'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { escapeHtml, getProcessActionLabel } = require('../src/renderer/safeMarkup');
const rendererSource = fs.readFileSync('src/renderer/app.js', 'utf8');

test('renderer: malicious process names are escaped before HTML interpolation', () => {
  const malicious = '"><img src=x onerror=alert(1)><!--';
  const escaped = escapeHtml(malicious);

  assert.doesNotMatch(escaped, /[<>"']/);
  assert.match(escaped, /&quot;/);
  assert.match(escaped, /&lt;img/);
  assert.equal(getProcessActionLabel({ applicationName: malicious }), malicious);
});

test('renderer: process names are not serialized into data-name attributes', () => {
  assert.doesNotMatch(rendererSource, /data-name\s*=/);
  assert.match(rendererSource, /getProcessActionLabel\(process\)/);
  assert.match(rendererSource, /btn\.dataset\.pid/);
});
