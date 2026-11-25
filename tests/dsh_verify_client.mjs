// Faithful code-path test of client.js factory registration.
// Mocks: window.__ModuleLoader__.load, require('react'), document, ctx.slots.
// Proves: factory returns slots injectable, apply() registers 'main' + 'sidebar.panellist'
// with the exact contract fields the live slot tree requires (verified via cordis inspect).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dir, 'client.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); };

// --- mock document (for injectStyle) ---
const appended = [];
const styleEl = () => { const e = { attrs: {}, textContent: '' }; e.setAttribute = (k, v) => (e.attrs[k] = v); return e; };
const fakeDoc = {
  head: { appendChild: (el) => appended.push(el) },
  createElement: (tag) => ({ tag, ...styleEl() }),
  querySelector: (sel) => appended.find((e) => sel === 'style[data-llw]' && e.attrs['data-llw'] === '1') || null,
};
globalThis.document = fakeDoc;

// --- mock React (only createElement + hooks referenced at factory eval time) ---
const React = {
  createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
  useCallback: (fn) => fn, useEffect: () => {}, useState: (v) => [v, () => {}],
};
const require = (m) => { if (m === 'react') return React; throw new Error('unexpected require ' + m); };

// --- capture the load() payload ---
let loaded = null;
globalThis.window = {
  __ModuleLoader__: { load: (payload) => { loaded = payload; } },
};

try {
  // Evaluate the client module exactly as the web loader would.
  // eslint-disable-next-line no-eval
  new Function('window', 'require', src)(globalThis.window, require);
  ok('client.js calls __ModuleLoader__.load', !!loaded);
  ok('load id is dsh-llmwiki', loaded && loaded.id === 'dsh-llmwiki', loaded && loaded.id);

  const mod = loaded.factory(require);
  ok('factory returns inject:["slots"]', Array.isArray(mod.inject) && mod.inject.includes('slots'), JSON.stringify(mod.inject));
  ok('factory.apply is a function', typeof mod.apply === 'function');

  // --- mock slots ctx, recording registrations in order ---
  const registrations = [];
  const injections = [];
  const ctx = {
    slots: {
      inject: (slotName, fn) => { injections.push(slotName); fn(); },
      register: (contract, renderer) => {
        registrations.push({ contract, renderer: renderer({}) });
        return () => {};
      },
    },
  };
  mod.apply(ctx);

  ok('injectStyle created exactly one style[data-llw]', appended.length === 1 && appended[0].attrs['data-llw'] === '1', `count=${appended.length}`);
  ok('injected into both main and sidebar.panellist', injections.includes('main') && injections.includes('sidebar.panellist'), JSON.stringify(injections));

  const main = registrations.find((r) => r.contract.name === 'main');
  const side = registrations.find((r) => r.contract.name === 'sidebar.panellist');
  ok('registered a main panel', !!main);
  ok('main uses keyed contract with key=PANEL_ID', !!main && typeof main.contract.key === 'string' && main.contract.key === 'dsh-llmwiki', main && JSON.stringify(main.contract));
  ok('main renderer returns an element', !!main && !!main.renderer && !!main.renderer.type);

  ok('registered a sidebar.panellist entry', !!side);
  ok('sidebar entry has id/order/label per live contract', !!side && side.contract.id === 'dsh-llmwiki' && typeof side.contract.order === 'number' && typeof side.contract.label === 'function' && side.contract.label() === 'LLM Wiki', side && JSON.stringify({ id: side.contract.id, order: side.contract.order, label: side.contract.label && side.contract.label() }));
  // Source contains the JS escape '\u{1F4DA}', which evaluates to the actual
  // 📚 emoji at runtime; the test must compare against the evaluated code point.
  const glyphOk = !!side && JSON.stringify(side.renderer).includes('\u{1F4DA}');
  ok('sidebar entry renderer renders a 📚 glyph', glyphOk, glyphOk ? 'U+1F4DA present' : 'missing');

  console.log(`\n=== CLIENT FACTORY RESULT: ${pass} passed, ${fail} failed ===`);
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('THREW:', e && e.stack || e);
  process.exitCode = 1;
}
