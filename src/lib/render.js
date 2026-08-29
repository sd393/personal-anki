/**
 * Renders problem/rubric text: markdown + $inline$ / $$display$$ LaTeX +
 * fenced code blocks with syntax highlighting.
 *
 * Math and code are extracted first (so marked never mangles LaTeX
 * underscores or code), rendered separately, then substituted back via
 * private-use-area sentinels that markdown passes through untouched.
 */
import katex from 'katex';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import cpp from 'highlight.js/lib/languages/cpp';

hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('cpp', cpp);

marked.setOptions({ gfm: true, breaks: false });

const S = '\uE000'; // sentinel wrapping stashed chunk indices

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderCode(lang, code) {
  const trimmed = code.replace(/\n$/, '');
  if (lang && hljs.getLanguage(lang)) {
    return `<pre class="code-block"><code class="hljs">${hljs.highlight(trimmed, { language: lang }).value}</code></pre>`;
  }
  return `<pre class="code-block"><code class="hljs">${escapeHtml(trimmed)}</code></pre>`;
}

function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

export function renderRich(src) {
  if (!src) return '';
  const chunks = [];
  const stash = (html) => {
    chunks.push(html);
    return `${S}${chunks.length - 1}${S}`;
  };

  const text = src
    // fenced code first — $ inside code must stay literal
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => stash(renderCode(lang, code)))
    // display math
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(renderMath(tex, true)))
    // inline math (single line, non-greedy)
    .replace(/\$([^$\n]+?)\$/g, (_, tex) => stash(renderMath(tex, false)));

  let html = marked.parse(text);
  html = html.replace(new RegExp(`${S}(\\d+)${S}`, 'g'), (_, i) => chunks[Number(i)]);
  return html;
}
