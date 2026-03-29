import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'tracker.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database;

export function initDB() {
  if (db) return db;

  db = new Database(dbPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admitCardReleased BOOLEAN DEFAULT 0,
      responseSheetReleased BOOLEAN DEFAULT 0,
      resultReleased BOOLEAN DEFAULT 0,
      lastChecked DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastHtmlSnapshot TEXT,
      knownLinks TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      type TEXT,
      message TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE,
      keys TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Initialize status row if not exists
  const row = db.prepare('SELECT * FROM status WHERE id = 1').get();
  if (!row) {
    db.prepare(`
      INSERT INTO status (id, admitCardReleased, responseSheetReleased, resultReleased, lastHtmlSnapshot, knownLinks)
      VALUES (1, 0, 0, 0, '', '[]')
    `).run();
  }

  return db;
}

export function getStatus() {
  const db = initDB();
  return db.prepare('SELECT * FROM status WHERE id = 1').get();
}

export function updateStatus(updates: {
  admitCardReleased?: boolean;
  responseSheetReleased?: boolean;
  resultReleased?: boolean;
  lastHtmlSnapshot?: string;
  knownLinks?: string;
}) {
  const db = initDB();
  const current = getStatus() as any;
  
  const admitCard = updates.admitCardReleased !== undefined ? updates.admitCardReleased : current.admitCardReleased;
  const responseSheet = updates.responseSheetReleased !== undefined ? updates.responseSheetReleased : current.responseSheetReleased;
  const result = updates.resultReleased !== undefined ? updates.resultReleased : current.resultReleased;
  const snapshot = updates.lastHtmlSnapshot !== undefined ? updates.lastHtmlSnapshot : current.lastHtmlSnapshot;
  const knownLinks = updates.knownLinks !== undefined ? updates.knownLinks : current.knownLinks;

  db.prepare(`
    UPDATE status 
    SET admitCardReleased = ?, 
        responseSheetReleased = ?, 
        resultReleased = ?, 
        lastHtmlSnapshot = ?,
        knownLinks = ?,
        lastChecked = ?
    WHERE id = 1
  `).run(admitCard ? 1 : 0, responseSheet ? 1 : 0, result ? 1 : 0, snapshot, knownLinks, new Date().toISOString());
}

export function addLog(type: string, message: string, details: string = '') {
  const db = initDB();
  db.prepare('INSERT INTO logs (type, message, details, timestamp) VALUES (?, ?, ?, ?)').run(type, message, details, new Date().toISOString());
}
