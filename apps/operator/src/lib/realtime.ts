// Realtime messages are refetch signals only. useBroadcast('tabs:<venue>', cb) listens to
// one private broadcast topic and, on any message, invalidates the query-key prefixes of
// that topic (queryKeys.ts TOPIC_PREFIXES) and calls the optional onSignal.
// One channel per topic, shared and reference counted: realtime-js hands back a channel
// that is still leaving, so a channel per hook silently stops hearing events.
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { TOPIC_PREFIXES } from './queryKeys';

type Listener = () => void;
interface Entry {
  listeners: Set<Listener>;
  channel: ReturnType<typeof supabase.channel> | null;
  dead: boolean;
}
const entries = new Map<string, Entry>();
let leaving: Promise<unknown> = Promise.resolve();

// supabase.channel(topic) returns the EXISTING channel while one with that topic is still
// registered (even one being removed). React StrictMode mounts, unmounts and mounts again,
// so the channel is only created after every earlier removal has finished; creating it
// synchronously handed back the half-removed one and 'tried to join multiple times' threw.
function subscribe(topic: string, listener: Listener): () => void {
  let entry = entries.get(topic);
  if (!entry) {
    const created: Entry = { listeners: new Set<Listener>(), channel: null, dead: false };
    entry = created;
    void leaving.then(() => {
      if (created.dead) return;
      const channel = supabase.channel(topic, { config: { private: true } });
      channel.on('broadcast', { event: '*' }, () => created.listeners.forEach((l) => l()));
      created.channel = channel;
      channel.subscribe();
    });
    entries.set(topic, entry);
  }
  entry.listeners.add(listener);
  const e = entry;
  return () => {
    e.listeners.delete(listener);
    if (e.listeners.size === 0 && entries.get(topic) === e) {
      entries.delete(topic);
      e.dead = true;
      const channel = e.channel;
      if (channel) leaving = leaving.then(() => supabase.removeChannel(channel)).catch(() => undefined);
    }
  };
}

/** Test seam: the subscribe function without React. */
export const __subscribeForTest = subscribe;

export function useBroadcast(topic: string | null, onSignal?: () => void): void {
  const qc = useQueryClient();
  const cb = useRef(onSignal);
  useEffect(() => {
    cb.current = onSignal;
  });
  useEffect(() => {
    if (!topic) return;
    const area = topic.split(':')[0] ?? '';
    return subscribe(topic, () => {
      for (const prefix of TOPIC_PREFIXES[area] ?? []) {
        void qc.invalidateQueries({ queryKey: [...prefix] });
      }
      cb.current?.();
    });
  }, [topic, qc]);
}
