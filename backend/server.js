// backend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Storage file (simple JSON storage for college demo)
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'logs.json');

// Ensure data directory and log file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([]));

// Helpers
function readLogs() {
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Error reading logs:', err);
    return [];
  }
}

function writeLogs(logs) {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Error writing logs:', err);
  }
}

function addLog(entry) {
  const logs = readLogs();
  logs.unshift(entry); // newest first
  writeLogs(logs);
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Get recent logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const logs = readLogs();
  res.json(logs.slice(0, limit));
});

// Create a generic log (speech, gesture, emotion, translate, sos)
app.post('/api/logs', (req, res) => {
  const { type, data, userId } = req.body;
  if (!type || !data) {
    return res.status(400).json({ error: 'Missing required fields: type, data' });
  }

  const entry = {
    id: Date.now().toString(),
    type,
    userId: userId || 'anonymous',
    data,
    timestamp: new Date().toISOString(),
  };

  addLog(entry);
  res.json({ status: 'ok', entry });
});

// SOS endpoint
app.post('/api/sos', (req, res) => {
  const { userId, location, message } = req.body;

  const entry = {
    id: `sos-${Date.now()}`,
    type: 'sos',
    userId: userId || 'anonymous',
    data: { location: location || null, message: message || null },
    timestamp: new Date().toISOString(),
  };

  addLog(entry);

  // NOTE: For demo we only store SOS. Integrate email/SMS service here if needed.
  // Example: call Twilio or SMTP service.

  res.json({ status: 'ok', message: 'SOS recorded', entry });
});

// Translation endpoint (mock translator for demo)
app.post('/api/translate', (req, res) => {
  const { text, target } = req.body;
  if (!text || !target) {
    return res.status(400).json({ error: 'Missing required fields: text, target' });
  }

  // Simple mock translation: we return the same text and label it as "mock".
  // Replace this block with a real translation API call if you have API keys.
  const translatedText = `[${target} mock] ${text}`;

  const entry = {
    id: `translate-${Date.now()}`,
    type: 'translate',
    userId: req.body.userId || 'anonymous',
    data: { original: text, translated: translatedText, target },
    timestamp: new Date().toISOString(),
  };
  addLog(entry);

  res.json({ status: 'ok', translatedText });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`HearMe backend running on http://localhost:${PORT}`);
});