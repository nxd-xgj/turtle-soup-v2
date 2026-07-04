const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password || !nickname) return res.status(400).json({ error: '请填写完整信息' });
  if (username.length < 2 || password.length < 4) return res.status(400).json({ error: '用户名至少2位，密码至少4位' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: '用户名已存在' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, password, nickname) VALUES (?,?,?,?)').run(id, username, hash, nickname);

  req.session.userId = id;
  req.session.userRole = 'player';
  res.json({ ok: true, user: { id, username, nickname, role: 'player' } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  req.session.userId = user.id;
  req.session.userRole = user.role;
  res.json({ ok: true, user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role } });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, role, avatar, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

router.put('/me', requireAuth, (req, res) => {
  const { nickname, avatar } = req.body;
  if (nickname) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, req.session.userId);
  if (avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
