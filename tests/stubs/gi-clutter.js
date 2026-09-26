// Clutter 18, as far as QuickClip uses it: key symbols, the virtual keyboard
// modules/paste.js drives, and the alignment enums the views set.
//
// The keysym values are the real ones from clutter-keysyms.h, so a test that
// compares against them compares against what the Shell would send.

/**
 * The seat Clutter.get_default_backend() returns. Each virtual device records
 * the keyvals it was sent; set `fail` to make creation throw.
 */
export const virtualSeat = {
    devices: [],
    fail: false,

    create_virtual_device(type) {
        if (virtualSeat.fail) throw new Error('no virtual devices on this seat');
        const device = {
            type,
            events: [],
            notify_keyval(_time, keyval, state) {
                device.events.push([keyval, state]);
            },
        };
        virtualSeat.devices.push(device);
        return device;
    },

    reset() {
        virtualSeat.devices = [];
        virtualSeat.fail = false;
    },
};

export default {
    get_default_backend: () => ({ get_default_seat: () => virtualSeat }),

    KEY_Return: 0xff0d,
    KEY_KP_Enter: 0xff8d,
    KEY_Escape: 0xff1b,
    KEY_Tab: 0xff09,
    KEY_ISO_Left_Tab: 0xfe20,
    KEY_Up: 0xff52,
    KEY_Down: 0xff54,
    KEY_Control_L: 0xffe3,
    KEY_Shift_L: 0xffe1,
    KEY_v: 0x076,
    KEY_a: 0x061,

    KeyState: { RELEASED: 0, PRESSED: 1 },
    InputDeviceType: { POINTER_DEVICE: 0, KEYBOARD_DEVICE: 1 },
    ActorAlign: { FILL: 0, START: 1, CENTER: 2, END: 3 },
    Orientation: { HORIZONTAL: 0, VERTICAL: 1 },
    EVENT_PROPAGATE: false,
    EVENT_STOP: true,
};
