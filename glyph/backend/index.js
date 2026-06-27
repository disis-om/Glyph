import { createChatServer } from './src/app.js';

const port = Number(process.env.PORT || 8787);
const { server } = createChatServer();

server.listen(port, '0.0.0.0', () => {
  console.log(`Chat backend listening on http://0.0.0.0:${port}`);
});
