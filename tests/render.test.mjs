// Tests for the markdown + LaTeX + code renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRich } from '../src/lib/render.js';

test('inline math renders through KaTeX', () => {
  const html = renderRich('The value $x^2 + 1$ is positive.');
  assert.ok(html.includes('katex'));
  assert.ok(!html.includes('$x^2'));
});

test('display math with subscripts is not mangled by markdown', () => {
  const html = renderRich('$$W_1 x + b_1$$');
  assert.ok(html.includes('katex-display'));
  assert.ok(!html.includes('<em>')); // underscores must not become emphasis
});

test('dollar signs inside code fences stay literal', () => {
  const html = renderRich('```python\nprice = "$5 and $10"\n```');
  assert.ok(html.includes('hljs'));
  assert.ok(html.includes('$5 and $10'));
  assert.ok(!html.includes('katex'));
});

test('markdown still works around math', () => {
  const html = renderRich('**bold** and $y$');
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('katex'));
});

test('invalid latex degrades without throwing', () => {
  const html = renderRich('$\\frac{$');
  assert.equal(typeof html, 'string');
});

test('no sentinel characters leak into output', () => {
  const html = renderRich('a $x$ b\n\n```python\ncode\n```\n\n$$y$$');
  assert.ok(!html.includes('\uE000'));
});

test('empty and null input return empty string', () => {
  assert.equal(renderRich(''), '');
  assert.equal(renderRich(null), '');
  assert.equal(renderRich(undefined), '');
});

test('multiline display math survives', () => {
  const html = renderRich('$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$');
  assert.ok(html.includes('katex'));
});
