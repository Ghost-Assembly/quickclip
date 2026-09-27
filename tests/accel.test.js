import { describe, expect, it } from 'vitest';

import { canBeShortcut, findConflicts, normalizeAccel } from '../modules/accel.js';

const gnome = [
    {
        source: 'org.gnome.shell.keybindings toggle-message-tray',
        values: ['<Super>v', '<Super>m'],
    },
    { source: 'org.gnome.desktop.wm.keybindings close', values: ['<Alt>F4'] },
];

describe('normalizeAccel', () => {
    it('ignores modifier order, aliases and letter case', () => {
        expect(normalizeAccel('<Shift><Super>V')).toBe(
            normalizeAccel('<Super><Shift>v'),
        );
        expect(normalizeAccel('<Primary>c')).toBe(normalizeAccel('<Control>c'));
        expect(normalizeAccel('<Ctrl>c')).toBe(normalizeAccel('<Control>c'));
        expect(normalizeAccel('<Mod4>a')).toBe(normalizeAccel('<Super>a'));
    });

    it('rejects empty and unknown input', () => {
        expect(normalizeAccel('')).toBe('');
        expect(normalizeAccel(null)).toBe('');
        expect(normalizeAccel('<Bogus>x')).toBe('');
        expect(normalizeAccel('<Super>')).toBe('');
    });
});

describe('findConflicts', () => {
    it('finds GNOME’s own Super+V', () => {
        expect(findConflicts('<Super>v', gnome).map(b => b.source)).toEqual([
            'org.gnome.shell.keybindings toggle-message-tray',
        ]);
    });

    it('allows the QuickClip default', () => {
        expect(findConflicts('<Super><Shift>v', gnome)).toEqual([]);
    });

    it('treats Alt and Mod1 alike', () => {
        expect(findConflicts('<Mod1>F4', gnome)).toHaveLength(1);
    });

    it('has nothing to say about an empty shortcut', () => {
        expect(findConflicts('', gnome)).toEqual([]);
    });
});

describe('canBeShortcut', () => {
    const code = char => char.codePointAt(0);

    it('refuses Shift with a key that types a character, as GNOME Settings does', () => {
        expect(canBeShortcut('<Shift>a', code('a'))).toBe(false);
        expect(canBeShortcut('<Shift>exclam', code('!'))).toBe(false);
        expect(canBeShortcut('<Shift>eacute', code('é'))).toBe(false);
        expect(canBeShortcut('<Shift>space', code(' '))).toBe(false);
    });

    it('takes Shift with a key that types nothing', () => {
        expect(canBeShortcut('<Shift>F5', 0)).toBe(true);
    });

    // Delete has a code point (0x7f), unlike F5, but a control character, so
    // this exercises the \p{Cc} half of the rule rather than codePoint <= 0.
    it('takes Shift+Delete, since Delete types a control character', () => {
        expect(canBeShortcut('<Shift>Delete', 0x7f)).toBe(true);
    });

    // Shift with these selects text, moves focus or ends a line in every
    // application, though none of them types a visible character. Code points
    // as Gdk.keyval_to_unicode gives them under gjs; ISO_Left_Tab is what GTK
    // reports for Shift+Tab, and dead_acute is a dead key, which types the
    // accent over the next letter. Arabic_switch, Prior and Next are the names
    // Gtk.accelerator_name or a hand-written setting can give Mode_switch,
    // Page_Up and Page_Down.
    it.each([
        ['Left', 0],
        ['Up', 0],
        ['Right', 0],
        ['Down', 0],
        ['Home', 0],
        ['End', 0],
        ['Page_Up', 0],
        ['Prior', 0],
        ['Page_Down', 0],
        ['Next', 0],
        ['Tab', 0x09],
        ['ISO_Left_Tab', 0],
        ['Return', 0x0d],
        ['KP_Enter', 0],
        ['Mode_switch', 0],
        ['Arabic_switch', 0],
        ['dead_acute', 0],
        ['dead_grave', 0],
        ['dead_hamza', 0],
        ['0xfe90', 0],
    ])(
        'refuses Shift+%s, which applications need for editing text',
        (key, codePoint) => {
            expect(canBeShortcut(`<Shift>${key}`, codePoint)).toBe(false);
        },
    );

    // Not Tab: Gtk.accelerator_valid, which prefs.js asks first, refuses Tab
    // with any modifier.
    it('takes the same keys with a modifier other than Shift', () => {
        expect(canBeShortcut('<Control>Left', 0)).toBe(true);
        expect(canBeShortcut('<Super>Left', 0)).toBe(true);
        expect(canBeShortcut('<Control>Return', code('\r'))).toBe(true);
    });

    it('takes any key with Ctrl, Alt or Super', () => {
        expect(canBeShortcut('<Control>a', code('a'))).toBe(true);
        expect(canBeShortcut('<Alt>1', code('1'))).toBe(true);
        expect(canBeShortcut('<Super><Shift>v', code('v'))).toBe(true);
    });

    it('refuses a bare key and anything it cannot read', () => {
        expect(canBeShortcut('a', code('a'))).toBe(false);
        expect(canBeShortcut('F5', 0)).toBe(false);
        expect(canBeShortcut('<Bogus>a', code('a'))).toBe(false);
        expect(canBeShortcut('', 0)).toBe(false);
    });
});
