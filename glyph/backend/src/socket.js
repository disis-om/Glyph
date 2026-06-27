import { collectMetrics } from './metrics.js';

export function registerSocketHandlers(io, store) {
  function broadcastUsers() {
    io.emit('users:update', store.listUsers());
  }

  io.on('connection', (socket) => {
    socket.on('user:join', (payload = {}, ack) => {
      const user = store.upsertUser(socket.id, payload);
      socket.join(socket.id);
      broadcastUsers();
      ack?.({ ok: true, user, users: store.listUsers() });
    });

    socket.on('thread:open', (peerId, ack) => {
      const user = store.getUser(socket.id);
      const peer = store.getUser(peerId);
      if (!user || !peer) {
        ack?.({ ok: false, error: 'User is offline.' });
        return;
      }
      ack?.({ ok: true, messages: store.getThread(socket.id, peerId), peer });
    });

    socket.on('message:send', (payload = {}, ack) => {
      const message = store.addMessage({
        from: socket.id,
        to: payload.to,
        text: payload.text,
      });

      if (!message) {
        ack?.({ ok: false, error: 'Message could not be sent.' });
        return;
      }

      io.to(message.from).to(message.to).emit('message:new', message);
      ack?.({ ok: true, message });
    });

    socket.on('typing', (payload = {}) => {
      const user = store.getUser(socket.id);
      const peer = store.getUser(payload.to);
      if (!user || !peer) return;
      socket.to(peer.id).emit('typing', {
        from: user.id,
        name: user.name,
        isTyping: Boolean(payload.isTyping),
      });
    });

    socket.on('metrics:subscribe', async () => {
      let closed = false;
      socket.on('disconnect', () => {
        closed = true;
      });

      const sendMetrics = async () => {
        if (closed) return;
        socket.emit('metrics:update', await collectMetrics(store));
      };

      await sendMetrics();
      const timer = setInterval(sendMetrics, 3000);
      socket.on('disconnect', () => clearInterval(timer));
    });

    socket.on('disconnect', () => {
      store.removeUser(socket.id);
      broadcastUsers();
    });
  });
}
