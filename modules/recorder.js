// Turns clipboard changes into history, and history into one expiry timer.
//
// The source is modules/clipboard.js's ClipboardSource in the Shell and a fake
// under Vitest. Reads are asynchronous, so every change bumps a generation
// counter and a read that finishes after a newer change, or after deafen(),
// is dropped rather than recorded out of order.
//
// Logs carry the kind of copy or the reason it was skipped, never its content.

import { KIND } from './model.js';
import { MAX_TEXT_CHARS, REASON, VISIBLE_REASONS, shouldRecord } from './privacy.js';
import { KEYS, SettingsWatcher, historyOptions } from './settings.js';

export class Recorder {
    /**
     * @param {{source: object, history: History, settings: Gio.Settings,
     *   timers?: {setTimeout: Function, clearTimeout: Function}}} options
     *   The clipboard, the history to fill, the settings, and the timer API
     *   (GJS's globals by default).
     */
    constructor({ source, history, settings, timers = globalThis }) {
        this._source = source;
        this._history = history;
        this._settings = settings;
        this._timers = timers;
        this._generation = 0;
        this._listening = false;
        this._timer = null;
        this._watcher = null;
        this._unsubscribe = null;
    }

    start() {
        this._watcher = new SettingsWatcher(this._settings);
        for (const key of [
            KEYS.HISTORY_SIZE,
            KEYS.IMAGE_BUDGET_MB,
            KEYS.EXPIRE_MINUTES,
        ])
            this._watcher.watch(key, () =>
                this._history.configure(historyOptions(this._settings)),
            );
        this._unsubscribe = this._history.onChange(() => this._schedule());
        this.listen();
    }

    /** @returns {boolean} Whether copies are being watched. */
    get listening() {
        return this._listening;
    }

    /** Start watching the clipboard. Idempotent. */
    listen() {
        if (this._listening) return;
        // The handler's promise is deliberately not awaited: owner-changed is
        // a signal, and _onOwnerChanged catches its own failures.
        this._source.start(() => void this._onOwnerChanged());
        this._listening = true;
    }

    /** Stop watching, and drop any read in flight. Idempotent. */
    deafen() {
        if (!this._listening) return;
        this._source.stop();
        this._listening = false;
        this._generation += 1;
    }

    /** Put a history or pinned item back on the clipboard. */
    copy(item) {
        if (item.kind === KIND.IMAGE) this._source.writeImage(item.data);
        else this._source.writeText(item.text);
    }

    /** Put text on the clipboard. */
    copyText(text) {
        this._source.writeText(text);
    }

    async _onOwnerChanged() {
        const generation = ++this._generation;
        const decision = shouldRecord({
            mimetypes: this._source.mimetypes(),
            appId: this._source.focusedAppId(),
            paused: this._settings.get_boolean(KEYS.PAUSED),
            ignoredApps: this._settings.get_strv(KEYS.IGNORED_APPS),
            imagesAllowed: this._settings.get_int(KEYS.IMAGE_BUDGET_MB) > 0,
        });

        if (!decision.record) {
            this._skip(decision.reason);
            return;
        }

        let entry;
        try {
            entry =
                decision.kind === KIND.TEXT
                    ? await this._readText()
                    : await this._readImage();
        } catch {
            console.debug('[quickclip] could not read the clipboard');
            return;
        }

        if (generation !== this._generation || !this._listening || !entry) return;
        if (entry.tooLarge || !this._history.add(entry)) {
            this._skip(REASON.TOO_LARGE);
            return;
        }
        console.debug(`[quickclip] recorded ${entry.kind}`);
    }

    _skip(reason) {
        if (VISIBLE_REASONS.has(reason)) this._history.block(reason);
        console.debug(`[quickclip] skipped ${reason}`);
    }

    async _readText() {
        const text = await this._source.readText();
        if (!text) return null;
        if (text.length > MAX_TEXT_CHARS) return { tooLarge: true };
        return { kind: KIND.TEXT, text };
    }

    async _readImage() {
        const image = await this._source.readImage();
        return image && { kind: KIND.IMAGE, ...image };
    }

    /** One timer, for the next item to expire; none when nothing will. */
    _schedule() {
        if (this._timer !== null) this._timers.clearTimeout(this._timer);
        this._timer = null;

        const at = this._history.nextExpiry();
        if (at === null) return;
        this._timer = this._timers.setTimeout(
            () => {
                this._timer = null;
                this._history.expire();
                this._schedule();
            },
            Math.max(0, at - this._history.now()),
        );
    }

    destroy() {
        this.deafen();
        if (this._timer !== null) this._timers.clearTimeout(this._timer);
        this._timer = null;
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._watcher?.release();
        this._watcher = null;
    }
}
