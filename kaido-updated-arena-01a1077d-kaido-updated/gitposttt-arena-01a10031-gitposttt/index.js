require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

require('events').EventEmitter.defaultMaxListeners = 500;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Servir les fichiers statiques du dashboard
app.use('/dashboard', express.static(path.join(process.cwd(), 'dashboard_static')));

// Middleware d'authentification admin pour routes protégées
function requireAdminPass(req, res, next) {
  const adminPass = process.env.ADMIN_PASS || 'adminplag';
  const pass = req.headers['x-admin-pass'] || req.body?.adminPass;
  if (pass === adminPass) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// Router principal (Pairing + Dashboard API + WhatsApp Socket Management)
const pairRouter = require('./pair');
app.use('/', pairRouter);
app.use('/code', pairRouter);

// Gestion des rejets de promesses non gérés
process.on('unhandledRejection', (reason, promise) => {
  console.warn('⚠️ Unhandled Promise Rejection:', reason);
});

// Lancement du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════╗
║     KAIDO-MD Dashboard Server      ║
╠════════════════════════════════════╣
║  Serveur actif sur :               ║
║  http://localhost:${PORT}                ║
║                                    ║
║  Tableau de bord :                 ║
║  http://localhost:${PORT}/dashboard     ║
║  http://localhost:${PORT}/dashboard/sessions.html
║  http://localhost:${PORT}/dashboard/admins.html
║  http://localhost:${PORT}/pair
╚════════════════════════════════════╝
`);
});

module.exports = app;
