// The keyboard popup: filter, pick, paste. Also the transforms, on Tab.
//
// A ModalDialog, so it takes the keyboard while open and hands focus back to
// the previous window when it closes — which is what lets the controller paste
// into that window afterwards. It destroys itself on close.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { entries, rowText, step } from './listing.js';
import { KIND } from './model.js';
import { applicable } from './transforms.js';

const MODE = Object.freeze({ HISTORY: 'history', TRANSFORMS: 'transforms' });

export const ClipPopup = GObject.registerClass(
    class ClipPopup extends ModalDialog.ModalDialog {
        /**
         * @param {{history: History, pinned: string[],
         *   transforms: ReadonlyArray<object>, gettext: Function,
         *   onChoose: Function, onTransform: Function}} options
         */
        _init({ history, pinned, transforms, gettext: _, onChoose, onTransform }) {
            super._init({ styleClass: 'quickclip-popup', destroyOnClose: true });

            this._history = history;
            this._pinned = pinned;
            this._transforms = transforms;
            this._gettext = _;
            this._onChoose = onChoose;
            this._onTransform = onTransform;
            this._mode = MODE.HISTORY;
            this._target = null;
            this._rows = [];
            this._buttons = [];
            this._selected = -1;

            const box = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'quickclip-popup-box',
            });
            this._entry = new St.Entry({
                hint_text: _('Type to filter · Tab for transforms'),
                can_focus: true,
                x_expand: true,
            });
            this._list = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
            });
            this._scroll = new St.ScrollView({
                hscrollbar_policy: St.PolicyType.NEVER,
                style_class: 'quickclip-scroll',
                child: this._list,
            });
            box.add_child(this._entry);
            box.add_child(this._scroll);
            this.contentLayout.add_child(box);

            this._entry.clutter_text.connectObject(
                'text-changed',
                () => {
                    this._selected = 0;
                    this._rebuild();
                },
                'key-press-event',
                (_actor, event) => this._onKey(event.get_key_symbol()),
                this,
            );
            this.setInitialKeyFocus(this._entry);
            this._rebuild();

            // A plain connect, as panel.js's toggle does: connectObject with
            // this as its own owner could be released by the destroy it is
            // meant to handle. The entry's clutter_text is a real Clutter
            // child of the entry in the Shell, so its handlers are cleaned up
            // when the entry is destroyed there; nothing guarantees that in
            // every host, so it is done here too.
            this.connect('destroy', () =>
                this._entry.clutter_text.disconnectObject(this),
            );
        }

        _rebuild() {
            const _ = this._gettext;
            for (const child of this._list.get_children()) child.destroy();
            this._list.remove_all_children();

            if (this._mode === MODE.HISTORY) {
                this._rows = entries({
                    pinned: this._pinned,
                    items: this._history.items,
                    query: this._entry.get_text(),
                }).map(row => ({ row, label: rowText(row.item, _) }));
            } else {
                this._rows = applicable(this._transforms, this._target).map(
                    transform => ({
                        transform,
                        label: _(transform.label),
                    }),
                );
            }

            this._buttons = this._rows.map((entry, index) =>
                this._button(entry, () => this._activate(index)),
            );
            for (const button of this._buttons) this._list.add_child(button);
            if (!this._rows.length) {
                const empty =
                    this._mode === MODE.HISTORY && !this._entry.get_text()
                        ? _('Nothing copied yet')
                        : _('Nothing matches');
                this._list.add_child(
                    new St.Label({ text: empty, style_class: 'quickclip-empty' }),
                );
            }

            this._selected = this._rows.length
                ? Math.min(Math.max(this._selected, 0), this._rows.length - 1)
                : -1;
            this._highlight();
        }

        _button(entry, onClick) {
            const box = new St.BoxLayout({
                style_class: 'quickclip-row-box',
                x_expand: true,
            });
            const item = entry.row?.item;
            if (item?.kind === KIND.IMAGE)
                box.add_child(
                    new St.Icon({
                        gicon: new Gio.BytesIcon({ bytes: item.data }),
                        style_class: 'quickclip-thumb',
                        icon_size: 48,
                    }),
                );
            if (entry.row?.pinned)
                box.add_child(
                    new St.Icon({ icon_name: 'starred-symbolic', icon_size: 16 }),
                );
            const label = new St.Label({
                text: entry.label,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            box.add_child(label);

            // popup-menu-item gives the theme's own hover and :selected look.
            const button = new St.Button({
                style_class: 'popup-menu-item quickclip-item',
                accessible_name: entry.label,
                can_focus: false,
                x_expand: true,
                child: box,
            });
            button.connectObject('clicked', onClick, this);
            return button;
        }

        _highlight() {
            this._buttons.forEach((button, index) => {
                if (index === this._selected) {
                    button.add_style_pseudo_class('selected');
                    ensureActorVisibleInScrollView(this._scroll, button);
                } else {
                    button.remove_style_pseudo_class('selected');
                }
            });
        }

        _onKey(symbol) {
            switch (symbol) {
                case Clutter.KEY_Up:
                    this._move(-1);
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Down:
                    this._move(1);
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    this._activate(this._selected);
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Tab:
                case Clutter.KEY_ISO_Left_Tab:
                    this._toggleMode();
                    return Clutter.EVENT_STOP;
                case Clutter.KEY_Escape:
                    if (this._mode === MODE.TRANSFORMS) this._toggleMode();
                    else this.close();
                    return Clutter.EVENT_STOP;
                default:
                    return Clutter.EVENT_PROPAGATE;
            }
        }

        _move(delta) {
            this._selected = step(this._selected, delta, this._rows.length);
            this._highlight();
        }

        _toggleMode() {
            if (this._mode === MODE.HISTORY) {
                this._target =
                    this._selected < 0 ? null : this._rows.at(this._selected).row.item;
                this._mode = MODE.TRANSFORMS;
            } else {
                this._mode = MODE.HISTORY;
                this._target = null;
            }
            this._selected = 0;
            this._rebuild();
        }

        _activate(index) {
            if (index < 0 || index >= this._rows.length) return;
            const entry = this._rows.at(index);
            const target = this._target;
            this.close();
            if (entry.transform) this._onTransform(entry.transform, target);
            else this._onChoose(entry.row.item);
        }
    },
);
