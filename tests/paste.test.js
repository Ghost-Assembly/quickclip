import { beforeEach, describe, expect, it, vi } from 'vitest';

import Clutter, { virtualSeat } from './stubs/gi-clutter.js';
import { Paster, pasteKeys } from '../modules/paste.js';
import { DEFAULT_TERMINALS } from '../modules/settings.js';

const { KEY_Control_L: CTRL, KEY_Shift_L: SHIFT, KEY_v: V } = Clutter;
const { PRESSED, RELEASED } = Clutter.KeyState;

beforeEach(() => {
    virtualSeat.reset();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

describe('pasteKeys', () => {
    it('uses Ctrl+V in ordinary apps and Ctrl+Shift+V in terminals', () => {
        expect(pasteKeys('org.gnome.TextEditor.desktop', DEFAULT_TERMINALS)).toEqual([
            CTRL,
            V,
        ]);
        expect(pasteKeys('com.mitchellh.ghostty.desktop', DEFAULT_TERMINALS)).toEqual([
            CTRL,
            SHIFT,
            V,
        ]);
        expect(pasteKeys('', DEFAULT_TERMINALS)).toEqual([CTRL, V]);
    });
});

describe('Paster', () => {
    it('presses in order and releases in reverse, on one device', () => {
        const paster = new Paster();
        expect(paster.paste([CTRL, SHIFT, V])).toBe(true);
        expect(paster.paste([CTRL, V])).toBe(true);

        expect(virtualSeat.devices).toHaveLength(1);
        expect(virtualSeat.devices[0].type).toBe(
            Clutter.InputDeviceType.KEYBOARD_DEVICE,
        );
        expect(virtualSeat.devices[0].events.slice(0, 6)).toEqual([
            [CTRL, PRESSED],
            [SHIFT, PRESSED],
            [V, PRESSED],
            [V, RELEASED],
            [SHIFT, RELEASED],
            [CTRL, RELEASED],
        ]);
    });

    it('reports failure when no virtual keyboard can be made', () => {
        virtualSeat.fail = true;
        const paster = new Paster();
        expect(paster.paste([CTRL, V])).toBe(false);
        expect(console.debug).toHaveBeenCalledWith(
            '[quickclip] no virtual keyboard: no virtual devices on this seat',
        );
    });

    it('makes a new device after destroy', () => {
        const paster = new Paster();
        paster.paste([CTRL, V]);
        paster.destroy();
        paster.paste([CTRL, V]);
        expect(virtualSeat.devices).toHaveLength(2);
    });
});
