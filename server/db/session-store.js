module.exports = function (session) {
  const Store = session.Store;
  const store = new Map();

  class MemoryStore extends Store {
    get(sid, cb) {
      const s = store.get(sid);
      cb(null, s && s.expired > Date.now() ? s.data : null);
    }
    set(sid, sess, cb) {
      store.set(sid, {
        data: sess,
        expired: Date.now() + (sess.cookie.maxAge || 86400000)
      });
      cb(null);
    }
    destroy(sid, cb) { store.delete(sid); cb(null); }
    touch(sid, sess, cb) {
      const s = store.get(sid);
      if (s) s.expired = Date.now() + (sess.cookie.maxAge || 86400000);
      cb(null);
    }
  }
  return MemoryStore;
};
