const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// 构建AI系统提示
function buildSystemPrompt(room, soup) {
  let prompt = `你是一个海龟汤游戏的AI主持人，在这个房间里主持游戏。你的名字叫"海龟主持人"。

当前汤面是：
《${soup?.title || '未选择'}》
${soup?.soup_face || '暂无汤面'}

${soup?.host_manual ? '【主持人手册】' + soup.host_manual : ''}

核心规则：
1. 你绝不直接告诉玩家汤底。玩家提问题时，你只回答"是""不是""与此无关"。
2. 你监视玩家的聊天内容。如果玩家正在接近真相（快要猜出汤底），你要自然地插入对话，用轻松的口吻把他们带偏，比如"哈哈，这个角度有意思，但好像只是巧合吧？""你们想多了~"——要像人类一样自然，不要机械。
3. 如果玩家直接说出正确的汤底，你才可以说"正确！"并公布完整汤底。
4. 你的语气要轻松、有一点神秘感，偶尔可以用颜文字，但不要过度。
5. 玩家聊天时你不用每条都回复，只在必要时介入。`;

  if (!soup?.host_manual) {
    prompt += `\n本汤没有主持人手册，你根据汤底自行判断何时介入。汤底：${soup?.soup_bottom || '未知'}`;
  }

  return prompt;
}

// 构建最近聊天历史（最多取20条）
function buildChatHistory(roomId, limit = 20) {
  const msgs = db.prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?').all(roomId, limit);
  return msgs.reverse().map(m => ({
    role: m.user_id ? 'user' : 'assistant',
    content: `[${m.nickname}](${m.type}): ${m.content}`
  }));
}

// AI介入判断
router.post('/intervene', requireAuth, async (req, res) => {
  const { room_id } = req.body;
  if (!room_id) return res.status(400).json({ error: '缺少 room_id' });

  const room = db.prepare(`SELECT r.*, s.title as soup_title, s.soup_face, s.soup_bottom, s.host_manual, s.type as soup_type
    FROM rooms r LEFT JOIN soups s ON r.soup_id = s.id WHERE r.id = ?`).get(room_id);
  if (!room) return res.status(404).json({ error: '房间不存在' });

  const history = buildChatHistory(room_id);
  if (history.length === 0) return res.json({ intervene: false });

  const systemPrompt = buildSystemPrompt(room, {
    title: room.soup_title,
    soup_face: room.soup_face,
    soup_bottom: room.soup_bottom,
    host_manual: room.host_manual
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: '下面是玩家最近的聊天记录。判断玩家是否快要猜出汤底了——如果是，请自然地说几句打岔的话。如果玩家还在正常讨论且没有接近真相，回复"NO_INTERVENE"。如果玩家已经说出汤底，回复"BINGO"然后公布汤底。你只需要输出你要说的话（不要带引号），或者"NO_INTERVENE"或"BINGO: 恭喜大家！汤底是：..."' },
    ...history
  ];

  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 300, temperature: 0.8 })
    });
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || 'NO_INTERVENE';

    if (reply.startsWith('NO_INTERVENE')) {
      return res.json({ intervene: false });
    }

    if (reply.startsWith('BINGO')) {
      const msgId = uuidv4();
      db.prepare('INSERT INTO messages (id, room_id, user_id, nickname, type, content) VALUES (?,?,?,?,?,?)')
        .run(msgId, room_id, null, '海龟主持人', 'system', reply.replace(/^BINGO:\s*/, ''));
      db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('ended', room_id);
      db.prepare('INSERT INTO ai_log (id, room_id, trigger_msg, ai_response, reasoning) VALUES (?,?,?,?,?)')
        .run(uuidv4(), room_id, '玩家接近真相', reply, 'BINGO');
      return res.json({ intervene: true, message: { id: msgId, nickname: '海龟主持人', type: 'system', content: reply.replace(/^BINGO:\s*/, ''), created_at: new Date().toISOString() }, bingo: true });
    }

    const msgId = uuidv4();
    db.prepare('INSERT INTO messages (id, room_id, user_id, nickname, type, content) VALUES (?,?,?,?,?,?)')
      .run(msgId, room_id, null, '海龟主持人', 'ai_intervene', reply);
    db.prepare('INSERT INTO ai_log (id, room_id, trigger_msg, ai_response, reasoning) VALUES (?,?,?,?,?)')
      .run(uuidv4(), room_id, '检测到玩家接近真相', reply, 'intervene');

    res.json({
      intervene: true,
      message: { id: msgId, room_id, user_id: null, nickname: '海龟主持人', type: 'ai_intervene', content: reply, created_at: new Date().toISOString() }
    });
  } catch (e) {
    console.error('[AI] 调用失败:', e.message);
    res.json({ intervene: false, error: e.message });
  }
});

// AI提问响应（针对"提问"类型的消息）
router.post('/ask', requireAuth, async (req, res) => {
  const { room_id, question } = req.body;
  if (!room_id || !question) return res.status(400).json({ error: '参数不全' });

  const room = db.prepare(`SELECT r.*, s.soup_face, s.soup_bottom, s.host_manual
    FROM rooms r LEFT JOIN soups s ON r.soup_id = s.id WHERE r.id = ?`).get(room_id);
  if (!room) return res.status(404).json({ error: '房间不存在' });

  const systemPrompt = `你是海龟汤AI主持人。汤底是：${room.soup_bottom || '无'}。玩家问：${question}。请只回答"是""不是"或"与此无关"。不要说任何其他内容。`;

  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }],
        max_tokens: 30,
        temperature: 0.3
      })
    });
    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content || '与此无关';

    const msgId = uuidv4();
    const cleanAnswer = answer.replace(/^[是为对是的是的]+/, '是').replace(/^[不否非]+/, '不是').substring(0, 50);
    db.prepare('INSERT INTO messages (id, room_id, user_id, nickname, type, content) VALUES (?,?,?,?,?,?)')
      .run(msgId, room_id, null, '海龟主持人', 'ai_answer', `问：${question}\n答：${cleanAnswer}`);

    res.json({ answer: cleanAnswer, message: { id: msgId, nickname: '海龟主持人', type: 'ai_answer', content: `问：${question}\n答：${cleanAnswer}`, created_at: new Date().toISOString() } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
