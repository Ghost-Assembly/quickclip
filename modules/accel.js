// Keyboard accelerators, compared the way GNOME matches them.
//
// This file imports nothing, so prefs.js can load it and Vitest can test it.
// It exists for one rule: QuickClip never takes a shortcut GNOME or the user
// already uses.

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
 * A canonical form: modifiers de-aliased and sorted, key lowercased.
 *
 * @param {string|null} accel A GTK accelerator such as '<Super><Shift>v'.
 * @returns {string} The canonical form, or '' when empty or not understood.
 */
export function normalizeAccel(accel) {
    if (!accel) return '';
    const modifiers = new Set();
    let rest = accel.trim();
    for (;;) {
        const match = /^<([A-Za-z0-9]+)>/.exec(rest);
        if (!match) break;
        const modifier = MODIFIERS.get(match[1].toLowerCase());
        if (!modifier) return '';
        modifiers.add(modifier);
        rest = rest.slice(match[0].length);
    }
    if (!rest) return '';
    return [
        ...[...modifiers].sort().map(modifier => `<${modifier}>`),
        rest.toLowerCase(),
    ].join('');
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
