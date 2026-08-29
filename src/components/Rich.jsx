import { useMemo } from 'react';
import { renderRich } from '../lib/render.js';

/** Markdown + LaTeX + highlighted code renderer. */
export default function Rich({ text, className = '' }) {
  const html = useMemo(() => renderRich(text), [text]);
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
