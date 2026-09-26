// Paste into the focused window by typing the paste shortcut on a virtual
// keyboard, as Clipboard Indicator does. Wayland offers an extension no other
// way to paste into another client.
//
// Terminals take Ctrl+Shift+V, because Ctrl+V is a control character there.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

/**
 * The keys that paste in an app.
 *
 * @param {string} appId Focused app's desktop id, or ''.
 * @param {string[]} terminalApps Desktop ids that paste with Ctrl+Shift+V.
 * @returns {number[]} Keyvals, in press order.
 */
export function pasteKeys(appId, terminalApps) {
    return appId && terminalApps.includes(appId)
        ? [Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_v]
        : [Clutter.KEY_Control_L, Clutter.KEY_v];
}

export class Paster {
    /**
     * @param {{seat?: function(): Clutter.Seat, clock?: function(): number}}
     *   [options] Where the seat and the event time (microseconds) come from.
     */
    constructor({
        seat = () => Clutter.get_default_backend().get_default_seat(),
        clock = () => GLib.get_monotonic_time(),
    } = {}) {
        this._seat = seat;
        this._clock = clock;
        this._device = null;
    }

    /**
     * Type a key chord: every key down in order, then up in reverse.
     *
     * @param {number[]} keys Keyvals from pasteKeys.
     * @returns {boolean} False when no virtual keyboard is available.
     */
    paste(keys) {
        if (!this._device) {
            try {
                this._device = this._seat().create_virtual_device(
                    Clutter.InputDeviceType.KEYBOARD_DEVICE,
                );
            } catch (error) {
                console.debug(`[quickclip] no virtual keyboard: ${error.message}`);
                return false;
            }
            if (!this._device) return false;
        }

        const time = this._clock();
        for (const key of keys)
            this._device.notify_keyval(time, key, Clutter.KeyState.PRESSED);
        for (const key of [...keys].reverse())
            this._device.notify_keyval(time, key, Clutter.KeyState.RELEASED);
        return true;
    }

    destroy() {
        this._device = null;
    }
}
