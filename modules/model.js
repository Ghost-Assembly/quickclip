// The clipboard history: what is kept, for how long, and in what order.
//
// This file imports nothing. modules/recorder.js hands it plain entries and it
// keeps plain objects, so every decision about the history is reachable from
// Vitest on Node.
//
// Pinned snippets are not here: they live in GSettings (modules/settings.js KEYS.PINNED) and never expire.

/** What a history item holds. */
export const KIND = Object.freeze({ TEXT: 'text', IMAGE: 'image' });

/**
 * Whether two entries hold the same content: text by value, images by hash.
 */
function sameContent(a, b) {
    if (a.kind !== b.kind) return false;
    return a.kind === KIND.TEXT ? a.text === b.text : a.hash === b.hash;
}

/**
 * The history itself. Memory only; nothing here can reach a disk.
 */
export class History {
    /**
     * @param {{size: number, imageBudget: number, expireMs: number,
     *   now?: function(): number}} options Caps in items, bytes and
     *   milliseconds (0 = never expire), and the clock.
     */
    constructor({ size, imageBudget, expireMs, now = () => Date.now() }) {
        this._size = size;
        this._imageBudget = imageBudget;
        this._expireMs = expireMs;
        this._now = now;
        this._items = [];
        this._nextId = 1;
        this._blocked = null;
        this._listeners = new Set();
    }

    /** @returns {number} The clock's time, in milliseconds. */
    now() {
        return this._now();
    }

    /** @returns {object[]} Items, newest first. A copy. */
    get items() {
        return [...this._items];
    }

    /** @returns {object|null} The newest item. */
    get current() {
        return this._items[0] ?? null;
    }

    /** @returns {{reason: string, at: number}|null} The last copy refused. */
    get blocked() {
        return this._blocked;
    }

    /** @returns {number} Bytes held by images. */
    get imageBytes() {
        return this._items.reduce(
            (sum, item) => sum + (item.kind === KIND.IMAGE ? item.size : 0),
            0,
        );
    }

    /**
     * Change the caps and apply them now.
     *
     * @param {{size: number, imageBudget: number, expireMs: number}} options New caps.
     */
    configure({ size, imageBudget, expireMs }) {
        this._size = size;
        this._imageBudget = imageBudget;
        this._expireMs = expireMs;
        this._trim();
        this._emit();
    }

    /**
     * Record a copy. A repeat of an existing item moves it to the top.
     *
     * @param {object} entry {kind: 'text', text} or {kind: 'image', data, size, hash}.
     * @returns {object|null} The stored item, or null for an image too big to keep.
     */
    add(entry) {
        if (entry.kind === KIND.IMAGE && entry.size > this._imageBudget) return null;

        const index = this._items.findIndex(item => sameContent(item, entry));
        let item;
        if (index === -1) {
            item = { ...entry, id: this._nextId++, addedAt: this._now() };
        } else {
            [item] = this._items.splice(index, 1);
            item.addedAt = this._now();
        }
        this._items.unshift(item);
        this._blocked = null;
        this._trim();
        this._emit();
        return item;
    }

    /**
     * Note that a copy was refused, so the menu can say so.
     *
     * @param {string} reason A REASON value from modules/privacy.js.
     */
    block(reason) {
        this._blocked = { reason, at: this._now() };
        this._emit();
    }

    /** Forget everything, including the blocked notice. */
    clear() {
        if (!this._items.length && !this._blocked) return;
        this._items = [];
        this._blocked = null;
        this._emit();
    }

    /**
     * Drop items whose time is up.
     *
     * @returns {number} How many were dropped.
     */
    expire() {
        if (!this._expireMs) return 0;
        const now = this._now();
        const before = this._items.length;
        this._items = this._items.filter(item => item.addedAt + this._expireMs > now);
        const removed = before - this._items.length;
        if (removed) this._emit();
        return removed;
    }

    /**
     * When the next item expires, so a single timer can be set for it.
     *
     * @returns {number|null} A clock time, or null when nothing will expire.
     */
    nextExpiry() {
        if (!this._expireMs || !this._items.length) return null;
        return Math.min(...this._items.map(item => item.addedAt)) + this._expireMs;
    }

    /**
     * @param {Function} callback Called after every change.
     * @returns {Function} Call to stop listening.
     */
    onChange(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    _trim() {
        if (this._items.length > this._size) this._items.length = this._size;

        let bytes = this.imageBytes;
        for (let i = this._items.length - 1; i >= 0 && bytes > this._imageBudget; i--) {
            const item = this._items.at(i);
            if (item.kind !== KIND.IMAGE) continue;
            bytes -= item.size;
            this._items.splice(i, 1);
        }
    }

    _emit() {
        for (const listener of [...this._listeners]) listener();
    }
}
