import { describe, expect, it } from 'vitest';

import { History, KIND } from '../modules/model.js';
import { createTimers, MB } from './support/world.js';

const text = value => ({ kind: KIND.TEXT, text: value });
const image = (hash, size) => ({ kind: KIND.IMAGE, data: { hash }, size, hash });

function build(options = {}) {
    const timers = createTimers();
    const history = new History({
        size: 3,
        imageBudget: 10 * MB,
        expireMs: 60_000,
        now: timers.now,
        ...options,
    });
    return { history, timers };
}

describe('History', () => {
    it('keeps copies newest first', () => {
        const { history } = build();
        history.add(text('a'));
        history.add(text('b'));
        expect(history.items.map(item => item.text)).toEqual(['b', 'a']);
        expect(history.current.text).toBe('b');
    });

    it('moves a repeated copy to the top instead of duplicating it', () => {
        const { history, timers } = build();
        const first = history.add(text('a'));
        history.add(text('b'));
        timers.advance(5);
        const again = history.add(text('a'));
        expect(again.id).toBe(first.id);
        expect(again.addedAt).toBe(timers.now());
        expect(history.items.map(item => item.text)).toEqual(['a', 'b']);
    });

    it('matches images by hash', () => {
        const { history } = build();
        history.add(image('h1', MB));
        history.add(text('x'));
        history.add(image('h1', MB));
        expect(history.items).toHaveLength(2);
        expect(history.current.kind).toBe(KIND.IMAGE);
    });

    it('drops the oldest past the size cap', () => {
        const { history } = build();
        for (const value of ['a', 'b', 'c', 'd']) history.add(text(value));
        expect(history.items.map(item => item.text)).toEqual(['d', 'c', 'b']);
    });

    it('evicts the oldest images past the memory budget, keeping text', () => {
        const { history } = build({ size: 10, imageBudget: 5 * MB });
        history.add(image('old', 3 * MB));
        history.add(text('t'));
        history.add(image('new', 3 * MB));
        expect(history.items.map(item => item.hash ?? item.text)).toEqual(['new', 't']);
        expect(history.imageBytes).toBe(3 * MB);
    });

    it('rejects an image bigger than the whole budget', () => {
        const { history } = build({ imageBudget: 2 * MB });
        expect(history.add(image('big', 3 * MB))).toBeNull();
        expect(history.items).toEqual([]);
    });

    it('rejects every image when the budget is zero', () => {
        const { history } = build({ imageBudget: 0 });
        expect(history.add(image('any', 1))).toBeNull();
    });

    it('expires copies older than expireMs, and says when the next one goes', () => {
        const { history, timers } = build();
        history.add(text('old'));
        timers.advance(30_000);
        history.add(text('new'));
        expect(history.nextExpiry()).toBe(timers.now() - 30_000 + 60_000);

        timers.advance(30_000);
        expect(history.expire()).toBe(1);
        expect(history.items.map(item => item.text)).toEqual(['new']);
        expect(history.nextExpiry()).toBe(timers.now() + 30_000);
    });

    it('never expires when expireMs is zero, and has nothing to schedule', () => {
        const { history, timers } = build({ expireMs: 0 });
        history.add(text('a'));
        timers.advance(10 ** 9);
        expect(history.expire()).toBe(0);
        expect(history.nextExpiry()).toBeNull();
    });

    it('has nothing to schedule when empty', () => {
        expect(build().history.nextExpiry()).toBeNull();
    });

    it('records the latest block until the next copy or a clear', () => {
        const { history, timers } = build();
        history.block('sensitive');
        expect(history.blocked).toEqual({ reason: 'sensitive', at: timers.now() });
        history.add(text('a'));
        expect(history.blocked).toBeNull();
        history.block('ignored-app');
        history.clear();
        expect(history.blocked).toBeNull();
        expect(history.items).toEqual([]);
    });

    it('re-applies caps when reconfigured', () => {
        const { history } = build({ size: 5 });
        for (const value of ['a', 'b', 'c', 'd']) history.add(text(value));
        history.configure({ size: 2, imageBudget: 10 * MB, expireMs: 60_000 });
        expect(history.items.map(item => item.text)).toEqual(['d', 'c']);
    });

    it('notifies listeners of changes, and stops when unsubscribed', () => {
        const { history } = build();
        let calls = 0;
        const unsubscribe = history.onChange(() => (calls += 1));
        history.add(text('a'));
        history.block('sensitive');
        history.clear();
        expect(calls).toBe(3);

        unsubscribe();
        history.add(text('b'));
        expect(calls).toBe(3);
    });

    it('does not notify for a clear of nothing', () => {
        const { history } = build();
        let calls = 0;
        history.onChange(() => (calls += 1));
        history.clear();
        expect(calls).toBe(0);
    });

    it('hands out copies of its list', () => {
        const { history } = build();
        history.add(text('a'));
        history.items.pop();
        expect(history.items).toHaveLength(1);
    });
});
