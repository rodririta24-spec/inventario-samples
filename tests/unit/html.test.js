import { it, expect } from 'vitest';
import { esc } from '../../src/lib/html.js';

it('escapes html special chars', () => {
  expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
it('stringifies null as empty', () => expect(esc(null)).toBe(''));
