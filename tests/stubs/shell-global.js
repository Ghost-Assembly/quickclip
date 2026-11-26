// The Shell's `global`, as far as QuickClip reads it outside an injected
// dependency: the seat that modules/paste.js types into.

import { virtualSeat } from './gi-clutter.js';

globalThis.global = {
    stage: {
        context: { get_backend: () => ({ get_default_seat: () => virtualSeat }) },
    },
};
