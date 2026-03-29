import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import { initDB, getStatus, addLog, updateStatus } from './src/server/db.js';
import { checkWebsite } from './src/server/scraper.js';
import dotenv from 'dotenv';
import webpush from 'web-push';
import fs from 'fs';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Web Push Setup
const vapidKeysPath = path.join(process.cwd(), 'data', 'vapid.json');
let vapidKeys: { publicKey: string, privateKey: string };

if (fs.existsSync(vapidKeysPath)) {
  vapidKeys = JSON.parse(fs.readFileSync(vapidKeysPath, 'utf-8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  const dataDir = path.dirname(vapidKeysPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys));
}

webpush.setVapidDetails(
  `mailto:${process.env.EMAIL_USER || 'admin@example.com'}`,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize database
  initDB();

  // API Routes
  app.get('/api/status', (req, res) => {
    try {
      const status = getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch status' });
    }
  });

  app.get('/api/logs', (req, res) => {
    try {
      const db = initDB();
      const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50').all();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  app.post('/api/check', async (req, res) => {
    try {
      await checkWebsite();
      res.json({ success: true, message: 'Manual check triggered' });
    } catch (error) {
      console.error('Manual check failed:', error);
      res.status(500).json({ error: 'Manual check failed' });
    }
  });

  app.get('/api/vapidPublicKey', (req, res) => {
    res.send(vapidKeys.publicKey);
  });

  app.post('/api/subscribe', (req, res) => {
    try {
      const subscription = req.body;
      const db = initDB();
      
      // Insert or ignore if it already exists
      db.prepare(`
        INSERT OR IGNORE INTO subscriptions (endpoint, keys) 
        VALUES (?, ?)
      `).run(subscription.endpoint, JSON.stringify(subscription.keys));
      
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Failed to save subscription:', error);
      res.status(500).json({ error: 'Failed to save subscription' });
    }
  });

  // Schedule cron job to run every 10 seconds
  cron.schedule('*/10 * * * * *', async () => {
    console.log('Running scheduled website check...');
    await checkWebsite();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Support Express v4
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Run initial check on startup
    checkWebsite().catch(console.error);
  });
}

startServer();
