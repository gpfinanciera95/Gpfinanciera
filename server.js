'use strict';
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('Configuración incompleta: define SESSION_SECRET (mínimo 32 caracteres) como variable de entorno.');
  process.exit(1);
}
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminG&P2026!';
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'gp-financiera.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 created_at TEXT NOT NULL,
 full_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 email TEXT,
 municipality TEXT NOT NULL,
 purpose TEXT NOT NULL,
 amount TEXT NOT NULL,
 income TEXT NOT NULL,
 best_time TEXT NOT NULL,
 details TEXT,
 guarantee TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Nueva'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS config (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
)`);
// Inicializar contraseña de admin si no existe
const pwdRow = db.prepare('SELECT value FROM config WHERE key=?').get('admin_password');
if (!pwdRow) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('admin_password', DEFAULT_ADMIN_PASSWORD);
  console.log('Contraseña de administrador inicializada (ejemplo o desde ADMIN_PASSWORD).');
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '20kb' }));
app.use(cookieSession({
  name: 'gp_admin_session', keys: [SESSION_SECRET], httpOnly: true, sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000
}));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' } });
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Se alcanzó el límite de solicitudes desde esta conexión. Intenta más tarde.' } });
const adminOnly = (req, res, next) => req.session && req.session.admin === true ? next() : res.status(401).json({ error: 'Debes iniciar sesión como administrador.' });
const clean = (v, max=500) => String(v ?? '').trim().slice(0, max);
const validChoices = {
 municipality: ['Chinandega','El Viejo','Chichigalpa','Corinto','Posoltega','Villanueva','Somotillo','Otro municipio'],
 purpose: ['personal','negocio','asalariado'],
 income: ['Empleo formal','Negocio propio','Trabajo independiente','Actividad agrícola o ganadera','Otra fuente'],
 bestTime: ['Por la mañana','Por la tarde','Indistinto'],
 guaranteeType: ['Motocicleta','Automóvil','Casa o terreno','Otro bien']
};
app.post('/api/login', loginLimiter, (req, res) => {
  const password = clean(req.body && req.body.password, 300);
  const stored = db.prepare('SELECT value FROM config WHERE key=?').get('admin_password');
  const expectedPass = stored ? stored.value : DEFAULT_ADMIN_PASSWORD;
  const supplied = Buffer.from(password);
  const expected = Buffer.from(expectedPass);
  if (!password || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  req.session = { admin: true };
  res.json({ ok: true });
});

app.post('/api/admin/change-password', adminOnly, (req, res) => {
  const current = clean(req.body && req.body.current, 300);
  const next = clean(req.body && req.body.next, 300);
  if (!next || next.length < 14) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 14 caracteres.' });
  const stored = db.prepare('SELECT value FROM config WHERE key=?').get('admin_password');
  const expectedPass = stored ? stored.value : DEFAULT_ADMIN_PASSWORD;
  const supplied = Buffer.from(current);
  const expected = Buffer.from(expectedPass);
  if (!current || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
  }
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('admin_password', next);
  res.json({ ok: true, message: 'Contraseña actualizada. Usa la nueva en el próximo inicio de sesión.' });
});
app.post('/api/logout', adminOnly, (req, res) => { req.session = null; res.clearCookie('gp_admin_session').json({ ok: true }); });
app.get('/api/session', (req, res) => res.json({ authenticated: !!(req.session && req.session.admin === true) }));

app.post('/api/applications', submitLimiter, (req, res) => {
  const b = req.body || {};
  const full_name = clean(b.fullName, 100), phone = clean(b.phone, 25), email = clean(b.email, 120);
  const municipality = clean(b.municipality, 60), purpose = clean(b.purpose, 30), amount = clean(b.amount, 80);
  const income = clean(b.income, 60), best_time = clean(b.bestTime || 'Indistinto', 40), details = clean(b.details, 500);
  const hasGuarantee = b.hasGuarantee === 'yes';
  const guaranteeType = hasGuarantee ? clean(b.guaranteeType, 40) : '';
  const guaranteeValue = hasGuarantee ? clean(b.guaranteeValue, 30) : '';
  const guaranteeDescription = hasGuarantee ? clean(b.guaranteeDescription, 180) : '';
  if (b.consent !== true) return res.status(400).json({ error: 'Necesitamos tu autorización para responder a esta consulta.' });
  if (full_name.length < 3 || phone.length < 6 || !validChoices.municipality.includes(municipality) || !validChoices.purpose.includes(purpose) || !amount || !validChoices.income.includes(income) || !validChoices.bestTime.includes(best_time)) return res.status(400).json({ error: 'Revisa los campos obligatorios e inténtalo de nuevo.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El correo electrónico no parece válido.' });
  const guarantee = hasGuarantee ? [guaranteeType, guaranteeValue ? `Valor aprox. C$ ${guaranteeValue}` : '', guaranteeDescription].filter(Boolean).join(' · ') : 'No por ahora';
  const result = db.prepare(`INSERT INTO applications (created_at,full_name,phone,email,municipality,purpose,amount,income,best_time,details,guarantee,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'Nueva')`)
    .run(new Date().toISOString(), full_name, phone, email, municipality, purpose, amount, income, best_time, details, guarantee);
  res.status(201).json({ ok: true, id: result.lastInsertRowid, message: 'Solicitud recibida. Nuestro equipo revisará la información; esto no significa que el préstamo esté aprobado.' });
});
app.get('/api/admin/applications', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT id,created_at,full_name,phone,email,municipality,purpose,amount,income,best_time,details,guarantee,status FROM applications ORDER BY id DESC').all();
  res.json(rows);
});
app.patch('/api/admin/applications/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id), status = clean(req.body && req.body.status, 30);
  if (!Number.isSafeInteger(id) || id < 1 || !['Nueva','En revisión','Aprobada','Rechazada'].includes(status)) return res.status(400).json({ error: 'Solicitud o estado no válido.' });
  const result = db.prepare('UPDATE applications SET status=? WHERE id=?').run(status, id);
  if (!result.changes) return res.status(404).json({ error: 'No se encontró la solicitud.' });
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.use((err, req, res, next) => { console.error('Error de servidor:', err.message); res.status(500).json({ error: 'Ocurrió un error. Inténtalo de nuevo más tarde.' }); });
app.listen(PORT, '0.0.0.0', () => console.log(`G&P FINANCIERA escuchando en puerto ${PORT}`));
