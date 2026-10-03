import { RealtimeClient } from '@supabase/realtime-js';
import { createTopicStrategy, entries, fromJson, keys, values } from '@trystero-p2p/core';

// Vermittlung der Direktverbindungen über das eigene Supabase-Projekt (Realtime Broadcast) statt
// über öffentliche Nostr-Relais. Von denen nahm Trystero bis zu 28 fremde Server, und einige davon
// stehen auf den Sperrlisten von Virenscannern (Warnung beim ersten Mehrspieler-Spiel).
//
// Nachgebaut nach @trystero-p2p/supabase 0.25.4, aber mit dem RealtimeClient, den das Spiel ohnehin
// hat (das Paket bräuchte das ganze supabase-js). Pro Thema ein Kanal: Auf dem Thema des Raums
// melden sich alle an ("join"), auf dem eigenen Thema kommen die Verbindungsangebote an ("sdp", von
// Trystero verschlüsselt). Adresse und Schlüssel kommen über relayConfig (url, key).

const EVENTS = { join: 'join', sdp: 'sdp' };
const channelName = (topic) => `ff-vermittlung-${topic}`;

// eine Verbindung zum Server für alle Räume (Trystero ruft init nur einmal auf)
let client = null;
const channels = {};

function bindEvent(entry, event) {
  if (entry.bound[event]) return;
  entry.bound[event] = true;
  entry.channel.on('broadcast', { event }, ({ payload }) => {
    for (const listener of values(entry.listeners[event] ?? {})) listener(payload);
  });
}

function addListener(entry, event, onPayload) {
  entry.listeners[event] ??= {};
  const id = String(entry.nextId++);
  entry.listeners[event][id] = onPayload;
  bindEvent(entry, event);
  return () => {
    const listeners = entry.listeners[event];
    if (!listeners) return;
    delete listeners[id];
    if (!keys(listeners).length) delete entry.listeners[event];
  };
}

function getChannel(topic) {
  if (channels[topic]) return channels[topic];
  let resolveReady;
  const ready = new Promise((res) => {
    resolveReady = res;
  });
  const channel = client.channel(channelName(topic), { config: { broadcast: { self: false } } });
  const entry = { channel, ready, listeners: {}, bound: {}, nextId: 0, announcement: undefined };
  let subscribed = false;
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    if (!subscribed) {
      subscribed = true;
      resolveReady(channel);
      return;
    }
    // nach einer Unterbrechung wieder anmelden
    if (entry.announcement !== undefined) channel.send({ type: 'broadcast', event: EVENTS.join, payload: entry.announcement });
  });
  channels[topic] = entry;
  return entry;
}

function removeUnusedChannels() {
  for (const [topic, entry] of entries(channels)) {
    if (values(entry.listeners).some((l) => keys(l).length)) continue;
    client.removeChannel(entry.channel);
    delete channels[topic];
  }
}

export const joinRoom = createTopicStrategy({
  init: (config) => (client ||= new RealtimeClient(config.relayConfig.url, { params: { apikey: config.relayConfig.key } })),
  subscribeTopic: async (_client, topic, onMessage, { kind }) => {
    const entry = getChannel(topic);
    const removeListener = addListener(entry, kind === 'root' ? EVENTS.join : EVENTS.sdp, (payload) => onMessage(topic, payload));
    await entry.ready;
    return () => {
      removeListener();
      removeUnusedChannels();
    };
  },
  publishTopic: (_client, topic, msg, { kind }) => {
    const entry = getChannel(topic);
    const payload = kind === 'announce' && typeof msg === 'string' ? fromJson(msg) : msg;
    if (kind === 'announce') entry.announcement = payload;
    return entry.ready.then(async (channel) => {
      await channel.send({ type: 'broadcast', event: kind === 'announce' ? EVENTS.join : EVENTS.sdp, payload });
    });
  },
});
