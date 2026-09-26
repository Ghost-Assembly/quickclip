// QuickClip — a private clipboard history in GNOME quick settings.
//
// This file is deliberately thin. It builds the clipboard source, the paster
// and the controller, and tears them down; every decision lives in a module
// under modules/.
//
// Nothing here runs at import time. Creating an object, connecting a signal or
// touching the Shell during module evaluation is forbidden by the review
// guidelines.

import GLib from 'gi://GLib';

import {
    Extension,
    gettext as _,
    ngettext,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { ClipboardSource } from './modules/clipboard.js';
import { QuickClip } from './modules/controller.js';
import { Paster } from './modules/paste.js';

export default class QuickClipExtension extends Extension {
    enable() {
        this._source = new ClipboardSource();
        this._paster = new Paster();
        this._app = new QuickClip({
            settings: this.getSettings(),
            source: this._source,
            paster: this._paster,
            iconPath: `${this.path}/icons/quickclip-symbolic.svg`,
            gettext: _,
            ngettext,
            openPrefs: () => this.openPreferences(),
            uuid: () => GLib.uuid_string_random(),
        });
        this._app.enable();

        // scripts/headless-check.sh greps for this line; keep the prefix stable.
        console.debug(`[quickclip] enabled (v${this.metadata['version-name'] ?? '?'})`);
    }

    // metadata.json declares the unlock-dialog session mode, so this is not
    // called when the screen locks. That is deliberate: with "Clear on lock"
    // off, the history is kept in memory across a lock. While locked,
    // modules/controller.js removes the tile, the popup and both keybindings
    // and stops listening to the clipboard, so QuickClip shows nothing,
    // records nothing and has no shortcuts until the session is unlocked.
    disable() {
        // Ordered: the controller first, so nothing it owns can reach a
        // source or paster that is already gone.
        this._app?.disable();
        this._source?.destroy();
        this._paster?.destroy();

        this._app = null;
        this._source = null;
        this._paster = null;
    }
}
