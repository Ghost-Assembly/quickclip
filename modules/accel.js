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
 * Keys Shift alone may not take, although none of them types a visible
 * character: Shift with one of them selects text, moves focus or ends a line
 * in every application.
 *
 * GNOME Settings' own list, forbidden_keyvals in is_valid_binding()
 * (gnome-control-center, panels/keyboard/keyboard-shortcuts.c), by key name,
 * plus ISO_Left_Tab, which is what GTK reports for Shift+Tab. A keyval can
 * have several names: Gtk.accelerator_name writes Mode_switch as
 * Arabic_switch, and Page_Up and Page_Down can be read back as Prior and
 * Next, so every name Gdk 4 gives each of those keyvals is here.
 */
const SHIFT_FORBIDDEN_KEYS = new Set([
    'Home',
    'Left',
    'Up',
    'Right',
    'Down',
    'Page_Up',
    'Prior',
    'Page_Down',
    'Next',
    'End',
    'Tab',
    'ISO_Left_Tab',
    'KP_Enter',
    'Return',
    'Mode_switch',
    'Arabic_switch',
    'Greek_switch',
    'Hangul_switch',
    'Hebrew_switch',
    'ISO_Group_Shift',
    'kana_switch',
    'script_switch',
]);

/**
 * Whether a key name is a dead key, which types nothing itself but puts an
 * accent on the next letter typed.
 *
 * Every dead key Gdk can name is called dead_*. Gdk 4 has no name for the four
 * at 0xfe90-0xfe93 (dead_lowline to dead_longsolidusoverlay), so
 * Gtk.accelerator_name writes those as their keyval in hex.
 *
 * @param {string} key A key name from an accelerator.
 * @returns {boolean} True for a dead key.
 */
function isDeadKey(key) {
    return key.startsWith('dead_') || /^0xfe9[0-3]$/.test(key);
}

/**
 * Whether a captured combination may be a shortcut.
 *
 * A bare key never may. Shift alone may only with a key that types no
 * visible character and is not one that editing text needs
 * (SHIFT_FORBIDDEN_KEYS) or a dead key: Shift+F5 may, Shift+A, Shift+Left and
 * Shift+dead_acute may not. Any other modifier makes it bindable.
 *
 * Built on GNOME Settings' is_valid_binding() (gnome-control-center,
 * panels/keyboard/keyboard-shortcuts.c), and differs in three ways: this
 * refuses every bare key, where GNOME allows one such as F5; it refuses
 * Shift with a dead key, which GNOME's list leaves out; and it judges what
 * Shift alone types by whether the key's code point is a visible character,
 * where GNOME checks per-script keyval ranges. QuickTiler and QuickTS apply the
 * same rule to keyvals; this applies it to the key's name.
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
    if (SHIFT_FORBIDDEN_KEYS.has(parsed.key) || isDeadKey(parsed.key)) return false;
    // Control characters (Delete, and the function keys, which have no code
    // point at all) type nothing visible.
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
