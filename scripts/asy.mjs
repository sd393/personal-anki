// Shared helper: compile Asymptote source to SVG using the local `asy` binary.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function compileAsyToSvg(asySource) {
  const dir = mkdtempSync(join(tmpdir(), 'asy-'));
  try {
    const src = join(dir, 'diagram.asy');
    writeFileSync(src, asySource, 'utf8');
    execFileSync('asy', ['-f', 'svg', '-o', join(dir, 'diagram'), src], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    const svg = readFileSync(join(dir, 'diagram.svg'), 'utf8');
    // Strip the XML prolog/comments so the SVG can be injected via innerHTML.
    return svg.slice(svg.indexOf('<svg'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
