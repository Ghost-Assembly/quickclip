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
        expect(canBeShortcut('<Shift>Tab', code('\t'))).toBe(true);
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
