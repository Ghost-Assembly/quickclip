import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const stub = name =>
    fileURLToPath(new URL(`./tests/stubs/${name}.js`, import.meta.url));

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['modules/**/*.js', 'extension.js', 'prefs.js'],
            // Two exceptions, both toolkit plumbing a unit test could only
            // assert against a stub of the toolkit:
            //
            //   prefs.js             Adw and Gtk widget building. The key list,
            //                        wording and shortcut conflict rules live in
            //                        modules/settings.js and modules/accel.js.
            //   modules/clipboard.js St.Clipboard and Meta.Selection calls. Every
            //                        decision about a copy lives in
            //                        modules/privacy.js, modules/recorder.js and
            //                        modules/model.js and is tested there;
            //                        clipboard.js is covered by
            //                        scripts/headless-check.sh instead.
            //
            // Kept identical to sonar.coverage.exclusions so the two agree.
            exclude: ['prefs.js', 'modules/clipboard.js', 'tests/**'],
        },
    },

    // gnome-shell resolves these at runtime; Node cannot. The stubs live in
    // tests/, so they never ship and are never counted as covered code.
    resolve: {
        alias: [
            { find: 'gi://Clutter', replacement: stub('gi-clutter') },
            { find: 'gi://Gio', replacement: stub('gi-gio') },
            { find: 'gi://GLib', replacement: stub('gi-glib') },
            { find: 'gi://GObject', replacement: stub('gi-gobject') },
            { find: 'gi://Meta', replacement: stub('gi-meta') },
            { find: 'gi://Pango', replacement: stub('gi-pango') },
            { find: 'gi://Shell', replacement: stub('gi-shell') },
            { find: 'gi://St', replacement: stub('gi-st') },
            {
                find: 'resource:///org/gnome/shell/ui/main.js',
                replacement: stub('shell-main'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/modalDialog.js',
                replacement: stub('shell-modaldialog'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/popupMenu.js',
                replacement: stub('shell-popupmenu'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/quickSettings.js',
                replacement: stub('shell-quicksettings'),
            },
            {
                find: 'resource:///org/gnome/shell/misc/animationUtils.js',
                replacement: stub('misc-animationutils'),
            },
            {
                find: 'resource:///org/gnome/shell/extensions/extension.js',
                replacement: stub('shell-extension'),
            },
        ],
    },
});
