import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { createWebSocketServer } from './websocket';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// REST API routes
app.use(routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});

// WebSocket server
const wss = createWebSocketServer(server);

export { wss };
