// Verify the panel CSS palette mirrors dsh-mnemon and obeys plugin-CSS safety rules.
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'client.js');
const src = fs.readFileSync(file, 'utf8');
const css = (src.match(/const CSS = `([\s\S]*?)`;/) || [])[1];
if (!css) throw new Error('CSS block not found');

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log('PASS ' + msg + (extra ? ' :: ' + extra : '')); }
  else { fail++; console.log('FAIL ' + msg + (extra ? ' :: ' + extra : '')); }
};

// 1. old purple scheme fully gone
ok(!/#a855f7/i.test(css), 'no old purple #a855f7');
ok(!/violet/i.test(css), 'no "violet" references');

// 2. accent = dsh-mnemon's exact token
ok(css.includes('--llw-accent:var(--dsw-alias-state-business-primary,#2563eb)'),
   'accent = --dsw-alias-state-business-primary (dsh-mnemon --mn-accent)');

// 3. the full --mn-* semantic map is mirrored (token names match dsh-mnemon/lib/client.js:8745)
const mirrored = [
  ['--dsw-alias-bg-base', 'bg'],
  ['--dsw-alias-bg-module-platform', 'bg2'],
  ['--dsw-alias-bg-layer-1', 'layer'],
  ['--dsw-alias-border-l2', 'line'],
  ['--dsw-alias-border-l3', 'line-strong'],
  ['--dsw-alias-label-primary', 'text'],
  ['--dsw-alias-label-secondary', 'mut'],
  ['--dsw-alias-label-tertiary', 'faint'],
  ['--dsw-alias-state-business-primary', 'accent'],
  ['--dsw-alias-interactive-bg-hover', 'hover'],
  ['--dsw-alias-state-success-primary', 'ok'],
  ['--dsw-alias-state-warn-primary', 'warn'],
  ['--dsw-alias-state-error-primary', 'err'],
  ['--dsw-focus-ring-color', 'focus'],
  ['--dsw-font-mono', 'code'],
  ['--dsw-font-family', 'sans'],
];
for (const [token, alias] of mirrored) {
  ok(css.includes(`--llw-${alias}:var(${token}`), `mirror --llw-${alias} <- ${token}`);
}

// 4. no manual dark-theme override block (host theme handles light/dark)
ok(!/\[data-ds-dark-theme\]\s*\.llw-root/.test(css), 'no manual dark override (host themes automatically)');

// 5. every HOST-token var() (--dsw-*) has a literal fallback. --llw-* vars are
//    self-defined in .llw-root and inherit, so they always resolve; the plugin-CSS
//    safety rule targets host tokens that may be absent from a given DSH version.
const uses = [...css.matchAll(/var\((--[\w-]+)([^)]*)\)/g)];
const hostUses = uses.filter(m => m[1].startsWith('--dsw-'));
const noFallback = hostUses.filter(m => !m[2].includes(','));
ok(noFallback.length === 0, `all ${hostUses.length} host-token var() uses carry a fallback`,
   noFallback.length ? 'missing: ' + noFallback.map(m => m[1]).join(', ') : '');
// also assert every --llw-* var actually referenced is defined in .llw-root
const defined = new Set([...css.matchAll(/(--llw-[\w-]+)\s*:/g)].map(m => m[1]));
const referenced = new Set(uses.filter(m => m[1].startsWith('--llw-')).map(m => m[1]));
const undefinedRefs = [...referenced].filter(v => !defined.has(v));
ok(undefinedRefs.length === 0, 'every referenced --llw-* var is defined',
   undefinedRefs.length ? undefinedRefs.join(', ') : `${defined.size} defined / ${referenced.size} referenced`);

// 6. no invented --dsw-alias-* names: every alias token used must be one dsh-mnemon uses
const aliasTokens = [...new Set([...css.matchAll(/--dsw-alias-([\w-]+)/g)].map(m => m[1]))];
const knownMn = new Set(['bg-base','bg-module-platform','bg-layer-1','bg-layer-2','bg-module','border-l2','border-l3','border-l4','label-primary','label-secondary','label-tertiary','label-caption','state-business-primary','state-success-primary','state-warn-primary','state-error-primary','interactive-bg-hover','interactive-bg-active','state-idle-primary']);
const invented = aliasTokens.filter(t => !knownMn.has(t));
ok(invented.length === 0, 'no invented --dsw-alias-* tokens', invented.length ? invented.join(', ') : aliasTokens.join(', '));

console.log(`\n=== PALETTE RESULT: ${pass} passed, ${fail} failed ===`);
if (fail) process.exit(1);
