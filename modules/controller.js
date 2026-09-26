// QuickClip itself: builds the pieces, handles the lock screen, the shortcuts
// and every action a click or key press asks for.
//
// The clipboard source and the paster are handed in (extension.js makes the
// real ones), so this file is tested whole under Vitest.
//
// While the screen is locked there is no tile, no popup, no keybinding and no
// clipboard listener. That is what makes the unlock-dialog session mode safe.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { fill } from './listing.js';
import { History, KIND } from './model.js';
import { Panel } from './panel.js';
import { pasteKeys } from './paste.js';
import { ClipPopup } from './popup.js';
import { Recorder } from './recorder.js';
import { KEYS, historyOptions } from './settings.js';
import { TransformError, createTransforms, runTransform } from './transforms.js';

/**
 * How long to wait after the popup closes before pasting, so focus is back on
 * the window the paste is meant for.
 */
export const PASTE_DELAY_MS = 150;

export class QuickClip {
    /**
     * @param {{settings: Gio.Settings, source: object, paster: object,
     *   iconPath: string, gettext: Function, ngettext: Function,
     *   openPrefs: Function, uuid: function(): string,
     *   now?: function(): number,
     *   timers?: {setTimeout: Function, clearTimeout: Function}}} options
     */
    constructor({
        settings,
        source,
        paster,
        iconPath,
        gettext,
        ngettext,
        openPrefs,
        uuid,
        now = () => Date.now(),
        timers = globalThis,
    }) {
        this._settings = settings;
        this._source = source;
        this._paster = paster;
        this._iconPath = iconPath;
        this._gettext = gettext;
        this._ngettext = ngettext;
        this._openPrefs = openPrefs;
        this._uuid = uuid;
        this._now = now;
        this._timers = timers;

        this._history = null;
        this._recorder = null;
        this._transforms = null;
        this._panel = null;
        this._popup = null;
        this._pasteTimer = null;
        this._pasteWarned = false;
        this._keybound = false;
        this._locked = null;
        this._actions = this._createActions();
    }

    enable() {
        this._history = new History({
            ...historyOptions(this._settings),
            now: this._now,
        });
        this._transforms = createTransforms({ uuid: this._uuid, now: this._now });
        this._recorder = new Recorder({
            source: this._source,
            history: this._history,
            settings: this._settings,
            timers: this._timers,
        });
        this._recorder.start();

        Main.sessionMode.connectObject('updated', () => this._syncLock(), this);
        this._locked = null;
        this._syncLock();
    }

    disable() {
        Main.sessionMode.disconnectObject(this);
        this._hideUi();
        this._recorder?.destroy();
        this._recorder = null;
        this._history?.clear();
        this._history = null;
        this._locked = null;
    }

    /** Open the popup, unless locked or already open. */
    openPopup() {
        if (this._locked || this._popup || !this._history) return;
        this._history.expire();
        this._popup = new ClipPopup({
            history: this._history,
            pinned: this._settings.get_strv(KEYS.PINNED),
            transforms: this._transforms,
            gettext: this._gettext,
            onChoose: item => this._choose(item),
            onTransform: (transform, item) => {
                if (this._transform(transform, item)) this._schedulePaste();
            },
        });
        this._popup.connectObject('destroy', () => (this._popup = null), this);
        if (!this._popup.open()) this._popup.destroy();
    }

    _syncLock() {
        const locked = Main.sessionMode.isLocked;
        if (locked === this._locked) return;
        this._locked = locked;

        if (locked) {
            this._hideUi();
            this._recorder.deafen();
            if (this._settings.get_boolean(KEYS.CLEAR_ON_LOCK)) this._history.clear();
            console.debug('[quickclip] locked');
        } else {
            // The expiry timer is monotonic and stood still through any
            // suspend while locked; History's times are wall-clock.
            this._history.expire();
            this._recorder.listen();
            this._showUi();
            console.debug('[quickclip] listening');
        }
    }

    _showUi() {
        this._panel = new Panel({
            settings: this._settings,
            history: this._history,
            transforms: this._transforms,
            actions: this._actions,
            iconPath: this._iconPath,
            gettext: this._gettext,
            ngettext: this._ngettext,
        });
        this._panel.enable();

        const bind = (key, handler) =>
            Main.wm.addKeybinding(
                key,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                handler,
            );
        bind(KEYS.POPUP_SHORTCUT, () => this.openPopup());
        bind(KEYS.PAUSE_SHORTCUT, () =>
            this._actions.setPaused(!this._settings.get_boolean(KEYS.PAUSED)),
        );
        this._keybound = true;
    }

    _hideUi() {
        if (this._pasteTimer !== null) this._timers.clearTimeout(this._pasteTimer);
        this._pasteTimer = null;

        this._popup?.disconnectObject(this);
        this._popup?.close();
        this._popup?.destroy();
        this._popup = null;

        if (this._keybound) {
            Main.wm.removeKeybinding(KEYS.POPUP_SHORTCUT);
            Main.wm.removeKeybinding(KEYS.PAUSE_SHORTCUT);
            this._keybound = false;
        }

        this._panel?.disable();
        this._panel = null;
    }

    _createActions() {
        const settings = this._settings;
        return Object.freeze({
            copy: item => this._recorder.copy(item),
            copyText: text => this._recorder.copyText(text),
            pin: text => {
                const pinned = settings.get_strv(KEYS.PINNED);
                if (!pinned.includes(text))
                    settings.set_strv(KEYS.PINNED, [...pinned, text]);
            },
            unpin: index =>
                settings.set_strv(
                    KEYS.PINNED,
                    settings.get_strv(KEYS.PINNED).filter((_text, at) => at !== index),
                ),
            clear: () => this._history.clear(),
            setPaused: paused => settings.set_boolean(KEYS.PAUSED, paused),
            transform: transform => this._transform(transform, this._history.current),
            openPrefs: () => this._openPrefs(),
            // Before history is shown: GLib timeouts do not run during a
            // suspend, so the expiry timer can be late.
            expire: () => this._history.expire(),
        });
    }

    _choose(item) {
        this._recorder.copy(item);
        this._schedulePaste();
    }

    /**
     * Run a transform on an item and put the result on the clipboard.
     *
     * @returns {boolean} Whether it worked.
     */
    _transform(transform, item) {
        const _ = this._gettext;
        const text = item?.kind === KIND.TEXT ? item.text : '';
        try {
            this._recorder.copyText(runTransform(transform, text));
            return true;
        } catch (error) {
            if (!(error instanceof TransformError)) throw error;
            // Fixed wording only: a notification can outlive the copy and show
            // on the lock screen.
            Main.notify(
                'QuickClip',
                fill(_('%s did not apply'), _(transform.label)) +
                    ` — ${_(error.message)}`,
            );
            return false;
        }
    }

    _schedulePaste() {
        if (!this._settings.get_boolean(KEYS.AUTO_PASTE)) return;
        if (this._pasteTimer !== null) this._timers.clearTimeout(this._pasteTimer);
        this._pasteTimer = this._timers.setTimeout(() => {
            this._pasteTimer = null;
            this._paste();
        }, PASTE_DELAY_MS);
    }

    _paste() {
        // _hideUi cancels the timer on lock; this is the second line, so a
        // Ctrl+V can never land in the unlock dialog.
        if (this._locked) return;
        const keys = pasteKeys(
            this._source.focusedAppId(),
            this._settings.get_strv(KEYS.TERMINAL_APPS),
        );
        if (this._paster.paste(keys) || this._pasteWarned) return;
        this._pasteWarned = true;
        Main.notify(
            'QuickClip',
            this._gettext(
                'Auto-paste is unavailable. The item was copied; paste it yourself.',
            ),
        );
    }
}
