const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// 生成6位房间码
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// 列所有房间（搜索）
router.get('/', (req, res) => {
  const { search, status } = req.query;
  let sql = `SELECT r.*, s.title as soup_title, s.soup_face as soup_face,
    (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as player_count
    FROM rooms r LEFT JOIN soups s ON r.soup_id = s.id WHERE 1=1`;
  const params = [];
  if (search) { sql += ' AND (r.title LIKE ? OR r.code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  sql += ' ORDER BY r.created_at DESC LIMIT 50';
  const rooms = db.prepare(sql).all(...params);
  res.json({ rooms });
});

// 创建房间
router.post('/', requireAuth, (req, res) => {
  const { title, soup_id, host_type } = req.body;
  if (!title) return res.status(400).json({ error: '请输入房间名称' });

  const id = uuidv4();
  const code = genCode();
  db.prepare(`INSERT INTO rooms (id, code, title, soup_id, host_type, host_id, status)
    VALUES (?,?,?,?,?,?,?)`)
    .run(id, code, title, soup_id || null, host_type || 'ai', host_type === 'human' ? req.session.userId : null, 'waiting');

  db.prepare('INSERT INTO room_players (id, room_id, user_id, role) VALUES (?,?,?,?)')
    .run(uuidv4(), id, req.session.userId, 'owner');

  res.json({ ok: true, room: { id, code, title } });
});

// 加入房间（通过code）
router.post('/join', requireAuth, (req, res) => {
  const { code } = req.body;
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code);
  if (!room) return res.status(404).json({ error: '房间不存在' });

  const already = db.prepare('SELECT id FROM room_players WHERE room_id = ? AND user_id = ?').get(room.id, req.session.userId);
  if (!already) {
    db.prepare('INSERT INTO room_players (id, room_id, user_id, role) VALUES (?,?,?,?)')
      .run(uuidv4(), room.id, req.session.userId, 'player');
  }
  res.json({ ok: true, room_id: room.id });
});

// 房间详情
router.get('/:id', requireAuth, (req, res) => {
  const room = db.prepare(`SELECT r.*, s.title as soup_title, s.soup_face as soup_face, s.type as soup_type,
    (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as player_count
    FROM rooms r LEFT JOIN soups s ON r.soup_id = s.id WHERE r.id = ?`).get(req.params.id);

  if (!room) return res.status(404).json({ error: '房间不存在' });

  const players = db.prepare(`SELECT u.id, u.nickname, u.avatar, rp.role
    FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ?`).all(room.id);

  const messages = db.prepare(`SELECT * FROM messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 200`).all(room.id);

  res.json({ room, players, messages });
});

// 发消息
router.post('/:id/message', requireAuth, (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: '房间不存在' });

  const player = db.prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?')
    .get(room.id, req.session.userId);
  if (!player) return res.status(403).json({ error: '你不在这个房间' });

  const { content, type = 'chat' } = req.body;
  if (!content) return res.status(400).json({ error: '消息不能为空' });

  const user = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.session.userId);
  const msgId = uuidv4();
  db.prepare('INSERT INTO messages (id, room_id, user_id, nickname, type, content) VALUES (?,?,?,?,?,?)')
    .run(msgId, room.id, req.session.userId, user.nickname, type, content);

  res.json({ ok: true, message: { id: msgId, room_id: room.id, user_id: req.session.userId, nickname: user.nickname, type, content, created_at: new Date().toISOString() } });
});

// 更新房间状态
router.put('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const player = db.prepare('SELECT role FROM room_players WHERE room_id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!player || player.role !== 'owner') return res.status(403).json({ error: '只有房主可以操作' });
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// 离开房间
router.post('/:id/leave', requireAuth, (req, res) => {
  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  const remaining = db.prepare('SELECT COUNT(*) as c FROM room_players WHERE room_id = ?').get(req.params.id);
  if (remaining.c === 0) {
    db.prepare('DELETE FROM messages WHERE room_id = ?').run(req.params.id);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

module.exports = router;
