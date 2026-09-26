// The Quick Settings tile and its menu.
//
// Nothing here decides anything. What is listed comes from History and the
// pinned setting; what a click does is one of the `actions` the controller
// handed in. Every string from the clipboard is set as `text`, never markup.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { blockedText, fill, pinnable, rowText } from './listing.js';
import { KIND } from './model.js';
import { KEYS, SettingsWatcher } from './settings.js';
import { applicable } from './transforms.js';

const ICONS = Object.freeze({
    PIN: 'non-starred-symbolic',
    UNPIN: 'starred-symbolic',
});

/** A small icon button placed at the end of a menu row. */
function rowButton(iconName, accessibleName, onClick) {
    const button = new St.Button({
        style_class: 'icon-button quickclip-row-button',
        can_focus: true,
        accessible_name: accessibleName,
        child: new St.Icon({ icon_name: iconName }),
    });
    button.connect('clicked', onClick);
    return button;
}

/** A menu row whose label ellipsizes rather than widening the menu. */
function textRow(text, props = {}) {
    const row = new PopupMenu.PopupMenuItem(text, props);
    row.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    row.label.x_expand = true;
    return row;
}

/** A row that says something and cannot be clicked. */
function noteRow(text, styleClass = '') {
    const row = textRow(text, {
        reactive: false,
        can_focus: false,
        style_class: styleClass,
    });
    row.setSensitive(false);
    return row;
}

const QuickClipToggle = GObject.registerClass(
    class QuickClipToggle extends QuickSettings.QuickMenuToggle {
        /**
         * @param {{gicon: Gio.Icon, gettext: Function, ngettext: Function,
         *   actions: object, transforms: ReadonlyArray<object>}} options
         */
        _init({ gicon, gettext: _, ngettext, actions, transforms }) {
            // toggleMode: a click flips checked, and checked means recording.
            super._init({ title: 'QuickClip', gicon, toggleMode: true });

            this._gicon = gicon;
            this._gettext = _;
            this._ngettext = ngettext;
            this._actions = actions;
            this._transforms = transforms;
            // Item id -> icon, so St does not decode a PNG on every rebuild.
            this._thumbs = new Map();

            this._current = new PopupMenu.PopupMenuSection();
            this._pinned = new PopupMenu.PopupMenuSection();
            this._recent = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this._current);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Pinned')));
            this.menu.addMenuItem(this._pinned);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Recent')));
            this.menu.addMenuItem(this._recent);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const clear = new PopupMenu.PopupMenuItem(_('Clear history'));
            clear.connect('activate', () => this._actions?.clear());
            this.menu.addMenuItem(clear);
            const prefs = new PopupMenu.PopupMenuItem(_('Preferences'));
            prefs.connect('activate', () => this._actions?.openPrefs());
            this.menu.addMenuItem(prefs);

            this.connectObject(
                'clicked',
                () => this._actions?.setPaused(!this.checked),
                this,
            );
            // Expiry runs on a timer that stands still during a suspend, so
            // the controller gets a chance to catch up before the menu shows.
            this.menu.connectObject(
                'open-state-changed',
                (_menu, open) => {
                    if (open) this._actions?.expire();
                },
                this,
            );
            // A plain connect, as ButtonBox does: connectObject with this as its
            // own owner could be released by the destroy it is meant to handle.
            this.connect('destroy', () => this._onDestroy());
        }

        /**
         * @param {{items: object[], current: object|null, blocked: object|null,
         *   pinned: string[], paused: boolean}} state What to show.
         */
        sync({ items, current, blocked, pinned, paused }) {
            const _ = this._gettext;
            this.checked = !paused;
            this.subtitle = paused ? _('Paused') : _('Recording');
            this.menu.setHeader(
                this._gicon,
                _('Clipboard'),
                fill(
                    this._ngettext('%s item', '%s items', items.length),
                    String(items.length),
                ),
            );

            this._syncCurrent(current);
            this._syncPinned(pinned);
            this._syncRecent(items, blocked);

            const live = new Set(items.map(item => item.id));
            for (const id of [...this._thumbs.keys()])
                if (!live.has(id)) this._thumbs.delete(id);
        }

        _thumb(item) {
            if (!this._thumbs.has(item.id))
                this._thumbs.set(item.id, new Gio.BytesIcon({ bytes: item.data }));
            return this._thumbs.get(item.id);
        }

        _withThumb(row, item) {
            if (item.kind === KIND.IMAGE)
                row.insert_child_at_index(
                    new St.Icon({
                        gicon: this._thumb(item),
                        style_class: 'quickclip-thumb',
                    }),
                    1,
                );
            return row;
        }

        _syncCurrent(current) {
            const _ = this._gettext;
            this._current.removeAll();

            const text = current ? rowText(current, _) : _('Nothing recorded yet');
            const row = this._withThumb(
                noteRow(text, 'quickclip-current'),
                current ?? {},
            );
            this._current.addMenuItem(row);

            const choices = applicable(this._transforms, current);
            const submenu = new PopupMenu.PopupSubMenuMenuItem(_('Transform'), false);
            for (const transform of choices) {
                const item = new PopupMenu.PopupMenuItem(_(transform.label));
                item.connect('activate', () => this._actions?.transform(transform));
                submenu.menu.addMenuItem(item);
            }
            this._current.addMenuItem(submenu);
        }

        _syncPinned(pinned) {
            const _ = this._gettext;
            this._pinned.removeAll();
            if (!pinned.length) {
                this._pinned.addMenuItem(
                    noteRow(_('Pin text from Recent to keep it here')),
                );
                return;
            }
            pinned.forEach((text, index) => {
                const row = textRow(rowText({ kind: KIND.TEXT, text }, _));
                row.connect('activate', () => this._actions?.copyText(text));
                row.add_child(
                    rowButton(ICONS.UNPIN, _('Unpin'), () =>
                        this._actions?.unpin(index),
                    ),
                );
                this._pinned.addMenuItem(row);
            });
        }

        _syncRecent(items, blocked) {
            const _ = this._gettext;
            this._recent.removeAll();

            const notice = blocked ? blockedText(blocked.reason, _) : '';
            if (notice) this._recent.addMenuItem(noteRow(notice, 'quickclip-blocked'));
            if (!items.length && !notice)
                this._recent.addMenuItem(noteRow(_('Nothing copied yet')));

            for (const item of items) {
                const row = this._withThumb(textRow(rowText(item, _)), item);
                row.connect('activate', () => this._actions?.copy(item));
                if (item.kind === KIND.TEXT && pinnable(item.text))
                    row.add_child(
                        rowButton(ICONS.PIN, _('Pin'), () =>
                            this._actions?.pin(item.text),
                        ),
                    );
                this._recent.addMenuItem(row);
            }
        }

        // From the destroy signal rather than a destroy() override, which an
        // actor destroyed from C never calls.
        _onDestroy() {
            this._actions = null;
            this._thumbs.clear();
            // The Shell parents this menu into the quick settings overlay and
            // never destroys it (Shell 50.3), so without this every disable —
            // and every lock — would leave a menu behind.
            this.menu.destroy();
        }
    },
);

/** Builds the tile and keeps it in step with the history and settings. */
export class Panel {
    /**
     * @param {{settings: Gio.Settings, history: History,
     *   transforms: ReadonlyArray<object>, actions: object, iconPath: string,
     *   gettext: Function, ngettext: Function}} options Dependencies.
     */
    constructor({
        settings,
        history,
        transforms,
        actions,
        iconPath,
        gettext,
        ngettext,
    }) {
        this._settings = settings;
        this._history = history;
        this._transforms = transforms;
        this._actions = actions;
        this._iconPath = iconPath;
        this._gettext = gettext;
        this._ngettext = ngettext;

        this._indicator = null;
        this._toggle = null;
        this._watcher = null;
        this._unsubscribe = null;
    }

    enable() {
        this._toggle = new QuickClipToggle({
            gicon: Gio.icon_new_for_string(this._iconPath),
            gettext: this._gettext,
            ngettext: this._ngettext,
            actions: this._actions,
            transforms: this._transforms,
        });
        this._toggle.connectObject('destroy', () => (this._toggle = null), this);
        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.quickSettingsItems.push(this._toggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._watcher = new SettingsWatcher(this._settings);
        this._watcher.watch(KEYS.PAUSED, () => this.sync());
        this._watcher.watch(KEYS.PINNED, () => this.sync());
        this._unsubscribe = this._history.onChange(() => this.sync());
        this.sync();
    }

    sync() {
        if (!this._toggle) return;
        this._toggle.sync({
            items: this._history.items,
            current: this._history.current,
            blocked: this._history.blocked,
            pinned: this._settings.get_strv(KEYS.PINNED),
            paused: this._settings.get_boolean(KEYS.PAUSED),
        });
    }

    disable() {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._watcher?.release();
        this._watcher = null;

        // The Shell reparents the toggle into the quick settings grid, so it
        // goes first, then its indicator.
        this._toggle?.disconnectObject(this);
        this._toggle?.destroy();
        this._toggle = null;
        this._indicator?.destroy();
        this._indicator = null;
    }
}
