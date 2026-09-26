// resource:///org/gnome/shell/ui/main.js, as far as QuickClip uses it.
//
// A module singleton, mirroring the real Main. reset() must be called from
// beforeEach or state leaks between tests.

import { FakeActor } from '../support/actors.js';

/** Indicators handed to addExternalIndicator. */
export const externalIndicators = [];

/** Notifications shown, as {title, body}. */
export const notifications = [];

const quickSettings = new FakeActor();
quickSettings.addExternalIndicator = (indicator, colSpan = 1) => {
    externalIndicators.push({ indicator, colSpan });
};

export const panel = { statusArea: { quickSettings } };

/** As the real WindowManager: one handler per name, NORMAL-mode flags kept. */
export const wm = {
    bindings: new Map(),

    addKeybinding(name, settings, flags, mode, handler) {
        if (wm.bindings.has(name)) throw new Error(`${name} is already bound`);
        wm.bindings.set(name, { settings, flags, mode, handler });
        return 1;
    },

    removeKeybinding(name) {
        wm.bindings.delete(name);
    },
};

/** The session mode. lock() flips it and emits 'updated' as the Shell does. */
export const sessionMode = new FakeActor();
sessionMode.isLocked = false;

export function lock(locked) {
    sessionMode.isLocked = locked;
    sessionMode.emit('updated');
}

export function notify(title, body) {
    notifications.push({ title, body });
}

/** Clear all recorded state. Call from beforeEach. */
export function reset() {
    externalIndicators.length = 0;
    notifications.length = 0;
    wm.bindings.clear();
    sessionMode.isLocked = false;
    for (const id of [...sessionMode.handlers.keys()]) sessionMode.disconnect(id);
}
