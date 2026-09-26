import { describe, expect, it } from 'vitest';

import { findConflicts, normalizeAccel } from '../modules/accel.js';

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
