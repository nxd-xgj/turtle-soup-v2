const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const { search, type, mood, tag, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT id, title, type, mood, tags, difficulty, soup_face, created_at FROM soups WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (title LIKE ? OR soup_face LIKE ? OR tags LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (mood) { sql += ' AND mood = ?'; params.push(mood); }
  if (tag) { sql += ' AND tags LIKE ?'; params.push(`%${tag}%`); }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const soups = db.prepare(sql).all(...params);
  const parsed = soups.map(s => ({ ...s, tags: JSON.parse(s.tags || '[]') }));

  let countSql = 'SELECT COUNT(*) as total FROM soups WHERE 1=1';
  const countParams = [];
  if (search) { countSql += ' AND (title LIKE ? OR soup_face LIKE ? OR tags LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (type) { countSql += ' AND type = ?'; countParams.push(type); }
  if (mood) { countSql += ' AND mood = ?'; countParams.push(mood); }
  if (tag) { countSql += ' AND tags LIKE ?'; countParams.push(`%${tag}%`); }

  const { total } = db.prepare(countSql).get(...countParams);
  res.json({ soups: parsed, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const soup = db.prepare('SELECT * FROM soups WHERE id = ?').get(req.params.id);
  if (!soup) return res.status(404).json({ error: '汤不存在' });
  soup.tags = JSON.parse(soup.tags || '[]');
  soup.clues = JSON.parse(soup.clues || '[]');
  const isOwner = req.session && req.session.userRole === 'admin';
  res.json({ soup, showBottom: isOwner });
});

router.post('/', requireAdmin, (req, res) => {
  const { title, type, mood, soup_face, soup_bottom, clues, tags, difficulty, host_manual } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO soups (id,title,type,mood,soup_face,soup_bottom,clues,tags,difficulty,host_manual)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, title, type || 'normal', mood || 'neutral', soup_face, soup_bottom,
      JSON.stringify(clues || []), JSON.stringify(tags || []), difficulty || 3, host_manual || '');
  res.json({ ok: true, id });
});

router.put('/:id', requireAdmin, (req, res) => {
  const soup = db.prepare('SELECT id FROM soups WHERE id = ?').get(req.params.id);
  if (!soup) return res.status(404).json({ error: '汤不存在' });
  const { title, type, mood, soup_face, soup_bottom, clues, tags, difficulty, host_manual } = req.body;
  db.prepare(`UPDATE soups SET title=?,type=?,mood=?,soup_face=?,soup_bottom=?,clues=?,tags=?,difficulty=?,host_manual=?,updated_at=datetime('now') WHERE id=?`)
    .run(title, type, mood, soup_face, soup_bottom, JSON.stringify(clues || []), JSON.stringify(tags || []), difficulty, host_manual || '', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM soups WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
