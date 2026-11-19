import { describe, expect, it, vi } from 'vitest';

// A fake realtime client with realtime-js's behaviour: channel(topic) returns the
// registered channel for that topic until removeChannel finishes, and a channel may be joined once.
const registry = new Map<string, { joined: boolean }>();
const created: { topic: string }[] = [];
vi.mock('./supabase', () => ({
  supabase: {
    channel: (topic: string) => {
      let ch = registry.get(topic);
      if (!ch) {
        ch = { joined: false };
        registry.set(topic, ch);
        created.push({ topic });
      }
      const c = ch;
      return {
        on: () => undefined,
        subscribe: () => {
          if (c.joined) throw new Error("tried to join multiple times. 'join' can only be called a single time per channel instance");
          c.joined = true;
        },
        topic,
      };
    },
    removeChannel: async (ch: { topic: string }) => {
      await Promise.resolve();
      registry.delete(ch.topic);
    },
  },
}));

import { __subscribeForTest } from './realtime';

describe('realtime subscribe', () => {
  it('survives the StrictMode mount, unmount, mount sequence without joining a channel twice', async () => {
    const off1 = __subscribeForTest('tabs:v', () => undefined);
    off1();
    const off2 = __subscribeForTest('tabs:v', () => undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(created).toHaveLength(1);
    expect(registry.get('tabs:v')?.joined).toBe(true);
    off2();
  });
});
