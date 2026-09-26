// The clipboard history: what is kept, for how long, and in what order.
//
// This file imports nothing. modules/recorder.js hands it plain entries and it
// keeps plain objects, so every decision about the history is reachable from
// Vitest on Node.

/** What a history item holds. */
export const KIND = Object.freeze({ TEXT: 'text', IMAGE: 'image' });
