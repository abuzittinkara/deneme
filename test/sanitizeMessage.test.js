const test = require('node:test');
const assert = require('assert');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const purify = DOMPurify(new JSDOM('').window);

test('HTML tags are stripped', () => {
  const dirty = '<b>bold</b> text';
  const clean = purify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  assert.strictEqual(clean, 'bold text');
});
