// Keyboard accelerators, compared the way GNOME matches them.
//
// This file imports nothing, so prefs.js can load it and Vitest can test it.
// It exists for two rules: QuickClip never takes a shortcut GNOME or the user
// already uses, and never one that would swallow ordinary typing.

const MODIFIERS = new Map([
    ['control', 'control'],
    ['ctrl', 'control'],
    ['primary', 'control'],
    ['shift', 'shift'],
    ['alt', 'alt'],
    ['mod1', 'alt'],
    ['super', 'super'],
    ['mod4', 'super'],
    ['meta', 'meta'],
    ['hyper', 'hyper'],
]);

/**
 * Split an accelerator into de-aliased modifiers and its key.
 *
 * @param {string|null} accel A GTK accelerator.
 * @returns {{modifiers: Set<string>, key: string}|null} Null when empty or
 *   not understood.
 */
function parseAccel(accel) {
    if (!accel) return null;
    const modifiers = new Set();
    let rest = accel.trim();
    for (;;) {
        const match = /^<([A-Za-z0-9]+)>/.exec(rest);
        if (!match) break;
        const modifier = MODIFIERS.get(match[1].toLowerCase());
        if (!modifier) return null;
        modifiers.add(modifier);
        rest = rest.slice(match[0].length);
    }
    if (!rest) return null;
    return { modifiers, key: rest };
}

/**
 * A canonical form: modifiers de-aliased and sorted, key lowercased.
 *
 * @param {string|null} accel A GTK accelerator such as '<Super><Shift>v'.
 * @returns {string} The canonical form, or '' when empty or not understood.
 */
export function normalizeAccel(accel) {
    const parsed = parseAccel(accel);
    if (!parsed) return '';
    return [
        ...[...parsed.modifiers].sort().map(modifier => `<${modifier}>`),
        parsed.key.toLowerCase(),
    ].join('');
}

/**
 * Whether a captured combination may be a shortcut, as GNOME Settings rules
 * it: a bare key never, and Shift alone only with a key that types nothing,
 * such as F5 — Shift+A is how a capital A is typed.
 *
 * @param {string} accel A GTK accelerator.
 * @param {number} codePoint The character its key types, as
 *   Gdk.keyval_to_unicode gives it; 0 for none.
 * @returns {boolean} Whether to accept it.
 */
export function canBeShortcut(accel, codePoint) {
    const parsed = parseAccel(accel);
    if (!parsed || !parsed.modifiers.size) return false;
    const shiftOnly = parsed.modifiers.size === 1 && parsed.modifiers.has('shift');
    if (!shiftOnly) return true;
    // Control characters (Tab, Return, Delete) type nothing visible.
    const prints = codePoint > 0 && !/\p{Cc}/u.test(String.fromCodePoint(codePoint));
    return !prints;
}

/**
 * Bindings that already use an accelerator.
 *
 * @param {string} accel The accelerator wanted.
 * @param {Array<{source: string, values: string[]}>} bindings Existing ones.
 * @returns {Array<{source: string, values: string[]}>} Those it would collide with.
 */
export function findConflicts(accel, bindings) {
    const wanted = normalizeAccel(accel);
    if (!wanted) return [];
    return bindings.filter(binding =>
        binding.values.some(value => normalizeAccel(value) === wanted),
    );
}
