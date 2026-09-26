// The Shell's clipboard, as modules/recorder.js needs it.
//
// Plumbing only, and excluded from coverage (see vitest.config.js): every
// decision about a copy — whether to record it, what it is, how long to keep
// it — lives in modules/privacy.js, modules/recorder.js and modules/model.js.
//
// Nothing here runs at import time.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { IMAGE_MIME } from './privacy.js';

const CLIPBOARD = St.ClipboardType.CLIPBOARD;

export class ClipboardSource {
    constructor() {
        this._selection = null;
        this._ownerId = 0;
    }

    /**
     * Call onChange whenever something new owns the clipboard (not the
     * primary selection).
     *
     * @param {Function} onChange Called with no arguments.
     */
    start(onChange) {
        this.stop();
        this._selection = global.display.get_selection();
        this._ownerId = this._selection.connect('owner-changed', (_selection, type) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD) onChange();
        });
    }

    stop() {
        if (this._ownerId) this._selection.disconnect(this._ownerId);
        this._ownerId = 0;
        this._selection = null;
    }

    /** @returns {string[]} MIME types on offer. Reads no content. */
    mimetypes() {
        return St.Clipboard.get_default().get_mimetypes(CLIPBOARD) ?? [];
    }

    /** @returns {string} The focused app's desktop id, or ''. */
    focusedAppId() {
        return Shell.WindowTracker.get_default().focus_app?.get_id() ?? '';
    }

    /** @returns {Promise<string|null>} The clipboard's text. */
    readText() {
        return new Promise(resolve => {
            St.Clipboard.get_default().get_text(CLIPBOARD, (_clipboard, text) =>
                resolve(text ?? null),
            );
        });
    }

    /** @returns {Promise<{data: GLib.Bytes, size: number, hash: string}|null>} The PNG. */
    readImage() {
        return new Promise(resolve => {
            St.Clipboard.get_default().get_content(
                CLIPBOARD,
                IMAGE_MIME,
                (_clipboard, bytes) => {
                    const size = bytes?.get_size() ?? 0;
                    if (!size) {
                        resolve(null);
                        return;
                    }
                    resolve({
                        data: bytes,
                        size,
                        hash: GLib.compute_checksum_for_bytes(
                            GLib.ChecksumType.SHA256,
                            bytes,
                        ),
                    });
                },
            );
        });
    }

    writeText(text) {
        St.Clipboard.get_default().set_text(CLIPBOARD, text);
    }

    writeImage(data) {
        St.Clipboard.get_default().set_content(CLIPBOARD, IMAGE_MIME, data);
    }

    destroy() {
        this.stop();
    }
}
