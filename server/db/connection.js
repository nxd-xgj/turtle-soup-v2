const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'turtle.db');

let SQL = null;
let db = null;
let _ready = false;

// 加载 sql.js WASM
async function init() {
  if (_ready) return;
  SQL = await initSqlJs();
  try {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } catch {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  _ready = true;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

// 同步包装器：暴露 prepapre().get()/.all()/.run() 和 exec()
function prepare(sql) {
  return {
    get(...params) {
      const stmt = db.prepare(sql);
      try { stmt.bind(params); if (stmt.step()) { const cols = stmt.getColumnNames(); const vals = stmt.get(); const obj = {}; cols.forEach((c, i) => obj[c] = vals[i]); return obj; } return undefined; }
      finally { stmt.free(); }
    },
    all(...params) {
      const results = [];
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const cols = stmt.getColumnNames();
        while (stmt.step()) { const vals = stmt.get(); const obj = {}; cols.forEach((c, i) => obj[c] = vals[i]); results.push(obj); }
        return results;
      } finally { stmt.free(); }
    },
    run(...params) {
      db.run(sql, params);
      save(); // auto-save on write
      return { changes: db.getRowsModified() };
    }
  };
}

function exec(sql) {
  db.run(sql);
  save();
}

module.exports = { init, prepare, exec, save };
