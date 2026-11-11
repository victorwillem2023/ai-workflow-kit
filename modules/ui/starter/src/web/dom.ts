// Tiny DOM helpers: h() builds elements (text always goes in as text, never as HTML), plus small things every UI needs:
// clear/replace, on(), debounce, perFrame, toast, prefs (safe localStorage) and keepFocus (redraw without losing the keyboard).
// UI rule: `innerHTML` only for static markup you wrote yourself; anything that came from data goes through h().

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string | (string | false | null | undefined)[];
  dataset?: Record<string, string>;
  [attr: string]: unknown;
}

function append(el: Node, c: Child): void {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { for (const x of c) append(el, x); return; }
  el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}

/** There is no `style` prop on purpose: the style rules forbid inline styles. Use a class from the style sheet. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      // enumerated attributes are switched off with "false", not by leaving them out
      if (k === 'spellcheck' || k === 'draggable' || k === 'contenteditable') { el.setAttribute(k, String(v)); continue; }
      if (v === false) continue;
      if (k === 'style') continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'indeterminate') (el as unknown as Record<string, unknown>)[k] = v;
      else if (k === 'href' || k === 'src') { if (/^(https?:|\/|#|mailto:)/i.test(String(v))) el.setAttribute(k, String(v)); } // no javascript: or data: links
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  for (const c of children) append(el, c);
}

export function on<T extends Event>(el: EventTarget, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions): () => void {
  el.addEventListener(type, fn as EventListener, opts);
  return () => el.removeEventListener(type, fn as EventListener, opts);
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  const d = (...a: A) => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.cancel = () => { if (t) clearTimeout(t); t = null; };
  return d;
}

/** Runs `fn` once per frame however often it is called in between (for things that follow a drag or a scroll). */
export function perFrame(fn: () => void, schedule: (run: () => void) => void = (run) => { requestAnimationFrame(run); }): () => void {
  let waiting = false;
  return () => { if (waiting) return; waiting = true; schedule(() => { waiting = false; fn(); }); };
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** A short message at the bottom of the screen (needs `<div id="toast" class="toast" role="status"></div>` in index.html). */
export function toast(message: string, kind: 'info' | 'error' | 'ok' = 'info', ms = 3800): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${kind}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, ms);
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
export const isNarrow = () => matchMedia('(max-width: 899px)').matches;

/** Safe localStorage access (private windows can throw). Keys are namespaced; set `NAMESPACE` to your app's name. */
const NAMESPACE = '{{PREFIX}}';
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(`${NAMESPACE}:${key}`); return v == null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

/** What tells one control from the others around it: its kind, classes, data attributes and name. */
function controlKey(el: Element, text: boolean): string {
  const data = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'name' || a.name === 'role' || a.name === 'type').map((a) => `${a.name}=${a.value}`).sort().join(',');
  const cls = [...el.classList].filter((c) => c !== 'on' && c !== 'open' && c !== 'busy').sort().join('.');
  return `${el.tagName}|${cls}|${data}|${text ? (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() : ''}`;
}

/**
 * Draws a part of the page again and keeps the keyboard where it was: when the control that had the focus was thrown away by the
 * drawing, the same control in the new drawing gets it. Without this the focus falls to the page's body and a keyboard user starts
 * again from the top.
 */
export function keepFocus(root: Element, draw: () => void): void {
  const had = document.activeElement;
  if (!had || had === document.body || !root.contains(had)) { draw(); return; }
  const same = (key: string, text: boolean) => [...root.querySelectorAll(had.tagName)].filter((x) => controlKey(x, text) === key);
  const full = controlKey(had, true), bare = controlKey(had, false);
  const iFull = same(full, true).indexOf(had), iBare = same(bare, false).indexOf(had);
  draw();
  if (root.contains(document.activeElement) && document.activeElement !== document.body) return; // the drawing put the focus somewhere itself
  if (had.isConnected) return;
  const again = same(full, true)[iFull] ?? same(bare, false)[iBare];
  (again as HTMLElement | undefined)?.focus({ preventScroll: true });
}
