// Preferences. Runs in its own process, with no access to gnome-shell's
// resource:// modules — so nothing here may import the Shell-side modules.
//
// It holds only widget construction; the key list and wording live in
// modules/settings.js, the shortcut rules in modules/accel.js and the pin
// limit in modules/listing.js, all tested on plain Node. This file is excluded
// from coverage for that reason.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { canBeShortcut, findConflicts } from './modules/accel.js';
import { fill, pinnable } from './modules/listing.js';
import { KEYS, SETTINGS } from './modules/settings.js';

/** Schemas whose `as` keys are keyboard shortcuts GNOME itself owns. */
const KEYBINDING_SCHEMAS = [
    'org.gnome.desktop.wm.keybindings',
    'org.gnome.shell.keybindings',
    'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings',
    'org.gnome.settings-daemon.plugins.media-keys',
];
const MEDIA_KEYS = 'org.gnome.settings-daemon.plugins.media-keys';
const CUSTOM_KEYBINDING =
    'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';

function describe(key) {
    return SETTINGS.find(setting => setting.key === key);
}

/**
 * Every shortcut GNOME and the user's custom shortcuts hold right now.
 * Other extensions' shortcuts are not visible from here; the docs say so.
 */
function systemBindings() {
    const source = Gio.SettingsSchemaSource.get_default();
    const bindings = [];

    for (const id of KEYBINDING_SCHEMAS) {
        const schema = source.lookup(id, true);
        if (!schema) continue;
        const settings = new Gio.Settings({ settings_schema: schema });
        for (const key of schema.list_keys()) {
            if (schema.get_key(key).get_value_type().dup_string() !== 'as') continue;
            bindings.push({ source: `${id} ${key}`, values: settings.get_strv(key) });
        }
    }

    const media = source.lookup(MEDIA_KEYS, true);
    const custom = source.lookup(CUSTOM_KEYBINDING, true);
    if (media && custom) {
        const paths = new Gio.Settings({ settings_schema: media }).get_strv(
            'custom-keybindings',
        );
        for (const path of paths) {
            const entry = new Gio.Settings({ settings_schema: custom, path });
            bindings.push({
                source: entry.get_string('name') || path,
                values: [entry.get_string('binding')],
            });
        }
    }
    return bindings;
}

/**
 * Stop GNOME acting on its own shortcuts while one is being captured, so
 * Super+V reaches the dialog and can be refused, instead of opening the
 * message tray. gnome-control-center does the same; the Shell may ask the user
 * first.
 *
 * @param {Gtk.Widget} widget Any widget in the window to inhibit.
 * @returns {Function} Call once to give the shortcuts back.
 */
function inhibitSystemShortcuts(widget) {
    const surface = widget.get_native()?.get_surface();
    // Only a Gdk.Toplevel surface has these; never let prefs throw without.
    if (
        typeof surface?.inhibit_system_shortcuts !== 'function' ||
        typeof surface.restore_system_shortcuts !== 'function'
    )
        return () => {};
    surface.inhibit_system_shortcuts(null);
    return () => surface.restore_system_shortcuts();
}

/**
 * Ask for a key combination. Esc cancels; Backspace disables the shortcut.
 *
 * @param {Adw.PreferencesWindow} window Parent.
 * @param {function(string|null)} onAccel Called with the accelerator, or null.
 */
function captureShortcut(window, onAccel) {
    const dialog = new Adw.AlertDialog({
        heading: _('Press a shortcut'),
        body: _(
            'Hold Ctrl, Alt or Super with a key. Esc cancels; Backspace turns it off.',
        ),
    });
    dialog.add_response('cancel', _('Cancel'));

    const keys = new Gtk.EventControllerKey({
        propagation_phase: Gtk.PropagationPhase.CAPTURE,
    });
    keys.connect('key-pressed', (_controller, keyval, keycode, state) => {
        const mods = state & Gtk.accelerator_get_default_mod_mask();
        const key = Gdk.keyval_to_lower(keyval);
        if (!mods && key === Gdk.KEY_Escape) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (!mods && key === Gdk.KEY_BackSpace) {
            onAccel(null);
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        // A lone modifier is not a shortcut yet; a bare key, or Shift with a
        // letter, would swallow typing everywhere.
        if (!Gtk.accelerator_valid(key, mods)) return Gdk.EVENT_STOP;
        const accel = Gtk.accelerator_name_with_keycode(null, key, keycode, mods);
        if (!canBeShortcut(accel, Gdk.keyval_to_unicode(key))) return Gdk.EVENT_STOP;
        onAccel(accel);
        dialog.close();
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(keys);
    dialog.present(window);

    // 'closed' fires on every way out: Esc, Backspace, a capture, Cancel.
    const restore = inhibitSystemShortcuts(window);
    dialog.connect('closed', () => restore());
}

/** A row showing one shortcut, with Set and Turn off buttons. */
function shortcutRow(window, settings, key) {
    const info = describe(key);
    const row = new Adw.ActionRow({ title: _(info.label), subtitle: _(info.detail) });
    const label = new Gtk.ShortcutLabel({
        disabled_text: _('Off'),
        valign: Gtk.Align.CENTER,
    });
    const sync = () => {
        label.accelerator = settings.get_strv(key)[0] ?? '';
    };
    const id = settings.connect(`changed::${key}`, sync);
    sync();

    const set = new Gtk.Button({ label: _('Set…'), valign: Gtk.Align.CENTER });
    set.connect('clicked', () =>
        captureShortcut(window, accel => {
            if (!accel) {
                settings.set_strv(key, []);
                return;
            }
            const others = [KEYS.POPUP_SHORTCUT, KEYS.PAUSE_SHORTCUT]
                .filter(other => other !== key)
                .map(other => ({
                    source: 'QuickClip',
                    values: settings.get_strv(other),
                }));
            const [conflict] = findConflicts(accel, [...systemBindings(), ...others]);
            if (conflict) {
                window.add_toast(
                    // Adw.Toast parses its title as markup by default; every
                    // accelerator has "<" and ">", and conflict.source can be
                    // a user-typed custom shortcut name.
                    new Adw.Toast({
                        title: fill(
                            _('%s is already used by %s'),
                            accel,
                            conflict.source,
                        ),
                        use_markup: false,
                    }),
                );
                return;
            }
            settings.set_strv(key, [accel]);
        }),
    );
    const off = new Gtk.Button({
        icon_name: 'edit-clear-symbolic',
        tooltip_text: _('Turn off'),
        valign: Gtk.Align.CENTER,
    });
    off.connect('clicked', () => settings.set_strv(key, []));

    row.add_suffix(label);
    row.add_suffix(set);
    row.add_suffix(off);
    return { row, release: () => settings.disconnect(id) };
}

/** A group listing desktop app ids from a strv key, with add and remove. */
function appListGroup(settings, key, title) {
    const info = describe(key);
    const group = new Adw.PreferencesGroup({ title, description: _(info.detail) });
    const apps = Gio.AppInfo.get_all()
        .filter(app => app.should_show() && app.get_id())
        .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

    const picker = new Adw.ComboRow({
        title: _('Add an app'),
        model: Gtk.StringList.new(apps.map(app => app.get_display_name())),
        enable_search: true,
        expression: Gtk.PropertyExpression.new(Gtk.StringObject, null, 'string'),
    });
    const add = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        tooltip_text: _('Add'),
        valign: Gtk.Align.CENTER,
    });
    add.connect('clicked', () => {
        const app = apps.at(picker.selected);
        if (!app) return;
        const ids = settings.get_strv(key);
        if (!ids.includes(app.get_id())) settings.set_strv(key, [...ids, app.get_id()]);
    });
    picker.add_suffix(add);
    group.add(picker);

    const rows = [];
    const sync = () => {
        for (const row of rows) group.remove(row);
        rows.length = 0;
        for (const id of settings.get_strv(key)) {
            const name =
                apps.find(app => app.get_id() === id)?.get_display_name() ?? id;
            // Adw rows parse titles as markup by default; an app name with "&"
            // would break it.
            const row = new Adw.ActionRow({
                title: name,
                subtitle: id,
                use_markup: false,
            });
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: _('Remove'),
                valign: Gtk.Align.CENTER,
            });
            remove.connect('clicked', () =>
                settings.set_strv(
                    key,
                    settings.get_strv(key).filter(existing => existing !== id),
                ),
            );
            row.add_suffix(remove);
            group.add(row);
            rows.push(row);
        }
    };
    const id = settings.connect(`changed::${key}`, sync);
    sync();
    return { group, release: () => settings.disconnect(id) };
}

/** Pinned snippets: remove any, add one line at a time. */
function pinnedGroup(settings) {
    const info = describe(KEYS.PINNED);
    const group = new Adw.PreferencesGroup({
        title: _(info.label),
        description: _('Stored in your settings. Pin multi-line text from the menu.'),
    });
    const entry = new Adw.EntryRow({
        title: _('Add a snippet'),
        show_apply_button: true,
    });
    entry.connect('apply', () => {
        const text = entry.text;
        const pinned = settings.get_strv(KEYS.PINNED);
        if (pinnable(text) && !pinned.includes(text))
            settings.set_strv(KEYS.PINNED, [...pinned, text]);
        entry.text = '';
    });
    group.add(entry);

    const rows = [];
    const sync = () => {
        for (const row of rows) group.remove(row);
        rows.length = 0;
        settings.get_strv(KEYS.PINNED).forEach((text, index) => {
            // Never markup: a snippet of "<b>" must show as exactly that.
            const row = new Adw.ActionRow({
                title: text.replace(/\s+/g, ' ').slice(0, 80),
                use_markup: false,
            });
            row.title_lines = 1;
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: _('Unpin'),
                valign: Gtk.Align.CENTER,
            });
            remove.connect('clicked', () =>
                settings.set_strv(
                    KEYS.PINNED,
                    settings.get_strv(KEYS.PINNED).filter((_text, at) => at !== index),
                ),
            );
            row.add_suffix(remove);
            group.add(row);
            rows.push(row);
        });
    };
    const id = settings.connect(`changed::${KEYS.PINNED}`, sync);
    sync();
    return { group, release: () => settings.disconnect(id) };
}

function spinRow(settings, key, lower, upper) {
    const info = describe(key);
    const row = new Adw.SpinRow({
        title: _(info.label),
        subtitle: _(info.detail),
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: 1,
            page_increment: 10,
        }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings, key) {
    const info = describe(key);
    const row = new Adw.SwitchRow({ title: _(info.label), subtitle: _(info.detail) });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class QuickClipPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const releases = [];

        const general = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'edit-paste-symbolic',
        });
        const history = new Adw.PreferencesGroup({
            title: _('History'),
            description: _('Kept in memory only. Nothing you copy is written to disk.'),
        });
        history.add(spinRow(settings, KEYS.HISTORY_SIZE, 5, 100));
        history.add(spinRow(settings, KEYS.IMAGE_BUDGET_MB, 0, 256));
        history.add(spinRow(settings, KEYS.EXPIRE_MINUTES, 0, 1440));
        history.add(switchRow(settings, KEYS.CLEAR_ON_LOCK));
        history.add(switchRow(settings, KEYS.AUTO_PASTE));
        general.add(history);

        const shortcuts = new Adw.PreferencesGroup({
            title: _('Shortcuts'),
            description: _('A shortcut GNOME or you already use is refused.'),
        });
        for (const key of [KEYS.POPUP_SHORTCUT, KEYS.PAUSE_SHORTCUT]) {
            const { row, release } = shortcutRow(window, settings, key);
            shortcuts.add(row);
            releases.push(release);
        }
        general.add(shortcuts);

        const pinned = pinnedGroup(settings);
        general.add(pinned.group);
        releases.push(pinned.release);
        window.add(general);

        const apps = new Adw.PreferencesPage({
            title: _('Apps'),
            icon_name: 'application-x-executable-symbolic',
        });
        const ignored = appListGroup(settings, KEYS.IGNORED_APPS, _('Ignored apps'));
        const terminals = appListGroup(
            settings,
            KEYS.TERMINAL_APPS,
            _('Terminal apps'),
        );
        apps.add(ignored.group);
        apps.add(terminals.group);
        releases.push(ignored.release, terminals.release);
        window.add(apps);

        window.connect('close-request', () => {
            for (const release of releases) release();
            return false;
        });
    }
}
