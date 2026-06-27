import { randomUUID } from 'node:crypto';

export function createStore() {
  const users = new Map();
  const messagesByThread = new Map();

  function threadIdFor(a, b) {
    return [a, b].sort().join(':');
  }

  function listUsers() {
    return [...users.values()]
      .map((user) => ({ ...user }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function upsertUser(socketId, payload = {}) {
    const existing = users.get(socketId);
    const name = String(payload.name || existing?.name || 'Guest').trim().slice(0, 28) || 'Guest';
    const avatarHue = Number(payload.avatarHue ?? existing?.avatarHue ?? Math.floor(Math.random() * 360));
    const user = {
      id: socketId,
      name,
      avatarHue,
      status: 'online',
      joinedAt: existing?.joinedAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    users.set(socketId, user);
    return { ...user };
  }

  function removeUser(socketId) {
    const user = users.get(socketId);
    users.delete(socketId);
    return user ? { ...user } : null;
  }

  function getUser(socketId) {
    const user = users.get(socketId);
    return user ? { ...user } : null;
  }

  function getThread(a, b) {
    const threadId = threadIdFor(a, b);
    return (messagesByThread.get(threadId) || []).slice(-100);
  }

  function addMessage({ from, to, text }) {
    const sender = users.get(from);
    const receiver = users.get(to);
    const cleanText = String(text || '').trim().slice(0, 1000);
    if (!sender || !receiver || !cleanText) {
      return null;
    }

    const threadId = threadIdFor(from, to);
    const message = {
      id: randomUUID(),
      threadId,
      from,
      to,
      author: sender.name,
      text: cleanText,
      createdAt: new Date().toISOString(),
      delivered: true,
    };

    const thread = messagesByThread.get(threadId) || [];
    thread.push(message);
    if (thread.length > 140) {
      thread.splice(0, thread.length - 140);
    }
    messagesByThread.set(threadId, thread);
    return message;
  }

  function messageCount() {
    let count = 0;
    for (const thread of messagesByThread.values()) count += thread.length;
    return count;
  }

  return {
    addMessage,
    getThread,
    getUser,
    listUsers,
    messageCount,
    removeUser,
    upsertUser,
  };
}
