import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { collectMetrics } from './metrics.js';
import { registerSocketHandlers } from './socket.js';
import { createStore } from './store.js';

export function createChatServer() {
  const app = express();
  const server = http.createServer(app);
  const store = createStore();
  const corsOrigin = process.env.CORS_ORIGIN || '*';

  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      name: 'dm-chat-backend',
      uptimeSeconds: Math.round(process.uptime()),
      users: store.listUsers().length,
      messages: store.messageCount(),
    });
  });

  app.get('/users', (_req, res) => {
    res.json(store.listUsers());
  });

  app.get('/metrics', async (_req, res) => {
    res.json(await collectMetrics(store));
  });

  registerSocketHandlers(io, store);

  return { app, io, server, store };
}
