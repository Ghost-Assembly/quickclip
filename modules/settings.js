// The extension's settings, written down once.
//
// This file imports nothing. prefs.js runs in a process with no access to
// gnome-shell's resource:// modules and must be able to load it, and Vitest has
// to reach it on plain Node so tests/settings.test.js can check it against the
// gschema.

/**
 * Schema keys.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const KEYS = Object.freeze({
    HISTORY_SIZE: 'history-size',
    IMAGE_BUDGET_MB: 'image-budget-mb',
    EXPIRE_MINUTES: 'expire-minutes',
    CLEAR_ON_LOCK: 'clear-on-lock',
    AUTO_PASTE: 'auto-paste',
    PAUSED: 'paused',
    POPUP_SHORTCUT: 'quickclip-open-popup',
    PAUSE_SHORTCUT: 'quickclip-toggle-pause',
    IGNORED_APPS: 'ignored-apps',
    TERMINAL_APPS: 'terminal-apps',
    PINNED: 'pinned',
});

/**
 * Terminals that paste with Ctrl+Shift+V, as desktop app ids. Kept identical
 * to the gschema default; tests/settings.test.js compares them.
 *
 * @type {ReadonlyArray<string>}
 */
export const DEFAULT_TERMINALS = Object.freeze([
    'org.gnome.Ptyxis.desktop',
    'org.gnome.Console.desktop',
    'org.gnome.Terminal.desktop',
    'kitty.desktop',
    'Alacritty.desktop',
    'foot.desktop',
    'org.wezfurlong.wezterm.desktop',
    'com.mitchellh.ghostty.desktop',
]);

/**
 * Each setting with the type the gschema declares and the wording prefs.js
 * shows for it.
 *
 * @type {ReadonlyArray<{key: string, type: string, label: string, detail: string}>}
 */
export const SETTINGS = Object.freeze(
    [
        {
            key: KEYS.HISTORY_SIZE,
            type: 'i',
            label: 'History size',
            detail: 'How many copies to keep',
        },
        {
            key: KEYS.IMAGE_BUDGET_MB,
            type: 'i',
            label: 'Image memory (MB)',
            detail: 'Memory copied images may use together; 0 keeps no images',
        },
        {
            key: KEYS.EXPIRE_MINUTES,
            type: 'i',
            label: 'Expire after (minutes)',
            detail: 'Drop copies older than this; 0 never expires them',
        },
        {
            key: KEYS.CLEAR_ON_LOCK,
            type: 'b',
            label: 'Clear on lock',
            detail: 'Empty the history when the screen locks',
        },
        {
            key: KEYS.AUTO_PASTE,
            type: 'b',
            label: 'Paste on select',
            detail: 'Paste the item chosen in the popup into the focused window',
        },
        {
            key: KEYS.PAUSED,
            type: 'b',
            label: 'Recording paused',
            detail: 'Toggled from the quick settings tile',
        },
        {
            key: KEYS.POPUP_SHORTCUT,
            type: 'as',
            label: 'Open the popup',
            detail: 'Shows the history under the keyboard',
        },
        {
            key: KEYS.PAUSE_SHORTCUT,
            type: 'as',
            label: 'Pause or resume',
            detail: 'Stops or restarts recording',
        },
        {
            key: KEYS.IGNORED_APPS,
            type: 'as',
            label: 'Ignored apps',
            detail: 'Copies made while one of these is focused are not recorded',
        },
        {
            key: KEYS.TERMINAL_APPS,
            type: 'as',
            label: 'Terminal apps',
            detail: 'These paste with Ctrl+Shift+V',
        },
        {
            key: KEYS.PINNED,
            type: 'as',
            label: 'Pinned snippets',
            detail: 'Kept until you unpin them',
        },
    ].map(setting => Object.freeze(setting)),
);

/**
 * Just the keys, for callers that only need to enumerate them.
 *
 * @type {ReadonlyArray<string>}
 */
export const ALL_KEYS = Object.freeze(SETTINGS.map(setting => setting.key));

/**
 * The settings History is built from, in the units it takes.
 *
 * @param {Gio.Settings} settings The extension's settings.
 * @returns {{size: number, imageBudget: number, expireMs: number}} Options.
 */
export function historyOptions(settings) {
    return {
        size: settings.get_int(KEYS.HISTORY_SIZE),
        imageBudget: settings.get_int(KEYS.IMAGE_BUDGET_MB) * 1024 * 1024,
        expireMs: settings.get_int(KEYS.EXPIRE_MINUTES) * 60 * 1000,
    };
}

/**
 * A group of settings handlers that are released together.
 *
 * Gio.Settings has no connectObject, so a `changed::` handler has to be
 * disconnected by the id its connect returned. Same shape as QuickMusic's.
 */
export class SettingsWatcher {
    /**
     * @param {Gio.Settings} settings Settings to watch.
     */
    constructor(settings) {
        this._settings = settings;
        this._ids = [];
    }

    /**
     * Watch one key.
     *
     * @param {string} key Settings key to watch.
     * @param {Function} callback Called when it changes.
     */
    watch(key, callback) {
        this._ids.push(this._settings.connect(`changed::${key}`, callback));
    }

    /** Disconnect everything watched so far. Idempotent. */
    release() {
        for (const id of this._ids) this._settings.disconnect(id);
        this._ids = [];
    }
}
