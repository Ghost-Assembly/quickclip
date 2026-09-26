// Fakes for what the modules are handed: settings, the clipboard and a clock.

import { DEFAULT_TERMINALS, KEYS } from '../../modules/settings.js';

export const MB = 1024 * 1024;

/**
 * An in-memory Gio.Settings covering the calls QuickClip makes.
 *
 * @param {object} [values] Initial values by key.
 */
export function createSettings(values = {}) {
    const state = new Map([
        [KEYS.HISTORY_SIZE, 20],
        [KEYS.IMAGE_BUDGET_MB, 32],
        [KEYS.EXPIRE_MINUTES, 30],
        [KEYS.CLEAR_ON_LOCK, true],
        [KEYS.AUTO_PASTE, true],
        [KEYS.PAUSED, false],
        [KEYS.POPUP_SHORTCUT, ['<Super><Shift>v']],
        [KEYS.PAUSE_SHORTCUT, []],
        [KEYS.IGNORED_APPS, []],
        [KEYS.TERMINAL_APPS, [...DEFAULT_TERMINALS]],
        [KEYS.PINNED, []],
        ...Object.entries(values),
    ]);

    const handlers = new Map();
    let nextId = 1;

    return {
        /** Live handler ids, so a test can prove they were disconnected. */
        connected: handlers,

        get_boolean: key => Boolean(state.get(key)),
        get_int: key => Number(state.get(key) ?? 0),
        get_strv: key => [...(state.get(key) ?? [])],

        set_boolean(key, value) {
            state.set(key, Boolean(value));
            this.emitChange(key);
        },

        set_int(key, value) {
            state.set(key, Number(value));
            this.emitChange(key);
        },

        set_strv(key, value) {
            state.set(key, [...value]);
            this.emitChange(key);
        },

        connect(signal, callback) {
            const id = nextId++;
            handlers.set(id, { signal, callback });
            return id;
        },

        disconnect(id) {
            handlers.delete(id);
        },

        /** Fire `changed::<key>` as GSettings would. */
        emitChange(key) {
            for (const { signal, callback } of [...handlers.values()])
                if (signal === `changed::${key}`) callback(this, key);
        },
    };
}

/**
 * A stand-in for modules/clipboard.js's ClipboardSource: same surface, no Shell.
 *
 * copyText/copyImage put content on the fake clipboard and fire owner-changed,
 * as another application copying would. With `deferred` set, reads wait until
 * release() so a test can overlap two copies.
 */
export function createClipboard() {
    let listener = null;
    const pending = [];

    const clip = {
        mimes: [],
        text: null,
        image: null,
        appId: '',
        deferred: false,
        listening: false,
        /** Every write QuickClip made, as [kind, value]. */
        writes: [],
        /** How many times QuickClip read the content. */
        reads: 0,

        start(onChange) {
            listener = onChange;
            clip.listening = true;
        },

        stop() {
            listener = null;
            clip.listening = false;
        },

        mimetypes: () => [...clip.mimes],
        focusedAppId: () => clip.appId,

        readText() {
            clip.reads += 1;
            return clip._answer(clip.text);
        },

        readImage() {
            clip.reads += 1;
            return clip._answer(clip.image);
        },

        _answer(value) {
            if (!clip.deferred) return Promise.resolve(value);
            return new Promise(resolve => pending.push(() => resolve(value)));
        },

        /** Let every held-back read finish, oldest first. */
        release() {
            while (pending.length) pending.shift()();
        },

        writeText(text) {
            clip.writes.push(['text', text]);
        },

        writeImage(data) {
            clip.writes.push(['image', data]);
        },

        destroy() {
            clip.stop();
        },

        copyText(text, { mimes = ['text/plain;charset=utf-8'], appId = '' } = {}) {
            clip.mimes = mimes;
            clip.text = text;
            clip.image = null;
            clip.appId = appId;
            listener?.();
        },

        copyImage(image, { appId = '' } = {}) {
            clip.mimes = ['image/png'];
            clip.image = image;
            clip.text = null;
            clip.appId = appId;
            listener?.();
        },
    };

    return clip;
}

/**
 * A manual clock and timer queue with the setTimeout/clearTimeout surface.
 * advance() runs due callbacks in time order, including ones they schedule.
 */
export function createTimers() {
    let now = 1_000_000;
    let nextId = 1;
    const pending = new Map();

    return {
        now: () => now,

        setTimeout(callback, ms) {
            const id = nextId++;
            pending.set(id, { at: now + ms, callback });
            return id;
        },

        clearTimeout(id) {
            pending.delete(id);
        },

        get pending() {
            return pending.size;
        },

        advance(ms) {
            now += ms;
            for (;;) {
                const due = [...pending]
                    .filter(([, timer]) => timer.at <= now)
                    .sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                pending.delete(due[0]);
                due[1].callback();
            }
        },
    };
}

/** Let pending promise callbacks run. */
export const flush = () => new Promise(resolve => setImmediate(resolve));
