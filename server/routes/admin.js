const express = require('express');
const db = require('../db/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 所有路由需要管理员权限
router.use(requireAuth, requireAdmin);

// 总览统计
router.get('/stats', (req, res) => {
  const soups = db.prepare('SELECT COUNT(*) as c FROM soups').get();
  const rooms = db.prepare('SELECT COUNT(*) as c FROM rooms').get();
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const activeRooms = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE status = 'playing'").get();
  res.json({ soups: soups.c, rooms: rooms.c, users: users.c, activeRooms: activeRooms.c });
});

// 用户列表
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

// 删除用户
router.delete('/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 更改用户角色
router.put('/users/:id/role', (req, res) => {
  const { role } = req.body;
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

// AI日志
router.get('/ai-logs', (req, res) => {
  const logs = db.prepare(`SELECT al.*, r.title as room_title FROM ai_log al
    LEFT JOIN rooms r ON al.room_id = r.id ORDER BY al.created_at DESC LIMIT 100`).all();
  res.json({ logs });
});

// 获取所有汤（含汤底，管理用）
router.get('/soups-full', (req, res) => {
  const soups = db.prepare('SELECT * FROM soups ORDER BY created_at DESC').all();
  const parsed = soups.map(s => ({ ...s, tags: JSON.parse(s.tags || '[]'), clues: JSON.parse(s.clues || '[]') }));
  res.json({ soups: parsed });
});

module.exports = router;
