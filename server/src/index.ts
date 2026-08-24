import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { db } from './db/database.js';
import { authMiddleware } from './middleware/auth.js';
import { wsHub } from './websocket/server.js';

import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { organizationRouter } from './routes/organizations.js';
import { tournamentRouter } from './routes/tournaments.js';
import { teamRouter } from './routes/teams.js';
import { matchRouter } from './routes/matches.js';
import { sponsorRouter } from './routes/sponsors.js';
import { reportRouter } from './routes/reports.js';
import { auctionRouter } from './routes/auctions.js';
import { playerRouter } from './routes/players.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo-role', 'x-demo-org-id']
}));

app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/tournaments', tournamentRouter);
app.use('/api/teams', teamRouter);
app.use('/api/matches', matchRouter);
app.use('/api/sponsors', sponsorRouter);
app.use('/api/reports', reportRouter);
app.use('/api/auctions', auctionRouter);
app.use('/api/players', playerRouter);

// Public Plans Endpoint (for Home Page and Registration)
app.get('/api/plans', (req, res) => {
  return res.json(db.plans);
});

// Public Health & Settings
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: db.platform_settings.platform_name,
    time: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Database Seed Reset (for automated testing and evaluation)
app.post('/api/dev/reset-seed', (req, res) => {
  db.resetToSeed();
  res.json({ message: 'Database reset to initial rich seed data successfully' });
});

const server = http.createServer(app);

// Initialize WebSocket Hub
wsHub.init(server);

server.listen(PORT, () => {
  console.log(`🚀 Multi-Tenant Sports SaaS API Server running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket Gateway available at ws://localhost:${PORT}/ws`);
});
