require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MemoryStore = require('./server/db/session-store')(session);
const path = require('path');
const { initDB } = require('./server/db/init');

const app = express();
const PORT = process.env.PORT || 3456;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new MemoryStore(),
  secret: process.env.SESSION_SECRET || 'turtle-soup-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// API路由
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/soups', require('./server/routes/soups'));
app.use('/api/rooms', require('./server/routes/rooms'));
app.use('/api/ai', require('./server/routes/ai'));
app.use('/api/admin', require('./server/routes/admin'));

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

// 初始化数据库后启动
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🐢 海龟汤 V2 已启动: http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
