const db = require('./connection');

async function initDB() {
  await db.init();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT DEFAULT 'player',
      avatar TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS soups (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'normal',
      mood TEXT DEFAULT 'neutral',
      soup_face TEXT NOT NULL,
      soup_bottom TEXT NOT NULL,
      clues TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      difficulty INTEGER DEFAULT 3,
      host_manual TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      soup_id TEXT,
      host_type TEXT DEFAULT 'ai',
      host_id TEXT,
      ai_config TEXT DEFAULT '{}',
      status TEXT DEFAULT 'waiting',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (soup_id) REFERENCES soups(id),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'player',
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(room_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT,
      nickname TEXT NOT NULL,
      type TEXT DEFAULT 'chat',
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );
    CREATE TABLE IF NOT EXISTS ai_log (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      trigger_msg TEXT,
      ai_response TEXT,
      reasoning TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );
  `);

  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const hash = bcrypt.hashSync('admin888', 10);
    db.prepare('INSERT INTO users (id, username, password, nickname, role) VALUES (?,?,?,?,?)')
      .run(uuidv4(), 'admin', hash, '管理员', 'admin');
  }

  const seedCount = db.prepare('SELECT COUNT(*) as c FROM soups').get();
  if (!seedCount || seedCount.c === 0) {
    seedSoups();
  }

  console.log('[DB] 数据库初始化完成');
}

function seedSoups() {
  const { v4: uuidv4 } = require('uuid');

  const soups = [
    {
      title: '宿舍规则',
      type: 'host_manual', mood: 'dark',
      soup_face: `你新搬进了一间大学宿舍。室友递给你一张纸条，上面写着几条规则：
1. 晚上11点后不要照镜子。
2. 如果听到床底下有声音，不要低头看。
3. 凌晨3点若醒来，闭眼数到100再睁开。
4. 如果看到室友站在你床边微笑，不要回应。
5. 千万不要让室友知道你发现了规则。`,
      soup_bottom: '你的室友早就死了。床下的声音是真正室友的尸体在挣扎。站在你床边微笑的"室友"是杀害他的凶手——它正在等你也变成尸体。规则不是保护你，而是确保你乖乖待着，直到它找机会杀掉你。',
      clues: '["纸条是室友给的","室友从不离开宿舍","床下偶尔有敲击声","室友的笑容僵硬不自然"]',
      tags: '["恐怖","规则怪谈","校园"]', difficulty: 3,
      host_manual: '规则怪谈类。玩家会逐一分析每条规则。关键切入点是：这些规则看起来在保护"你"，但其实每一条都让你无法发现真相。如果有人质疑"室友自己为什么给你规则"，提示"他只是递给你，没说为什么要遵守"。如果有人发现"规则其实是把受害者关在笼子里"，快要猜到答案了，自然地说"这些规则...与其说是保护，不如说是一种驯养"。'
    },
    {
      title: '动物园规则',
      type: 'host_manual', mood: 'dark',
      soup_face: `你和朋友去动物园，在门口拿到一张游园指南："欢迎来到奇妙动物园！请遵守以下规则：
1.兔子园区的兔子不会说话，如果它们对你说话，请无视。
2.长颈鹿馆的长颈鹿脖子是正常的，如果你看到脖子异常长的长颈鹿，立刻闭上眼睛走开。
3.海洋馆的海豚表演在下午3点，如果你在其他时间听到海豚叫声，那是通风管道的声音。
4.不要喂食任何动物，尤其是那些向你讨食的。"`,
      soup_bottom: '这不是真正的动物园。那些"动物"是实验失败的变异体。兔子会说话是因为它们被植入了人类大脑，长颈鹿脖子异常是基因崩溃的前兆，海豚的叫声来自被困在水下实验室里的人——他们试图向游客求救。真正的动物园管理层在用规则掩盖一起可怕的生物实验事故。',
      clues: '["动物园里没有其他游客","工作人员表情都异常紧张","园区的动物种类每天都在变","指南封面有褪色的实验日志字样"]',
      tags: '["恐怖","规则怪谈","科幻"]', difficulty: 4,
      host_manual: '规则怪谈+阴谋类。玩家需要意识到这些规则不是在保护游客，而是在掩盖某种秘密。关键是"动物园"这个场景本身就不对——几乎没有其他游客、工作人员异常。如果有人提到"这不像动物园，更像实验室"，可以自然接一句"你们也有这种感觉吗？我第一次来的时候也这么觉得"。如果玩家开始把线索串起来指向"实验"，快要破解，可以说"通风管道的声音...有节奏的话，说不定是摩斯密码呢？"'
    },
    {
      title: '灰姑娘规则',
      type: 'host_manual', mood: 'dark',
      soup_face: `灰姑娘收到了舞会的邀请。继母给了她三条规则：
1. 必须在午夜前回家。
2. 不要和王子跳舞超过三支曲子。
3. 不要吃任何食物。
灰姑娘严格遵守了所有规则，但她还是没能回家。`,
      soup_bottom: '继母的规则不是在保护灰姑娘——而是在确保她成为完美的祭品。规则让她保持"纯净"（不进食、不深交、在魔力最强的午夜前回到魔法的掌控范围）。灰姑娘严格遵守规则，恰恰帮助继母完成了献祭仪式。午夜钟声响起时，她变成了南瓜——不是马车，是她自己。',
      clues: '["继母给规则时笑得很温柔","仙女教母出现的时间比往年晚了","南瓜地今年收成异常好","王子说灰姑娘的皮肤有南瓜的香味"]',
      tags: '["黑暗童话","规则怪谈","反转"]', difficulty: 3,
      host_manual: '黑暗童话反转类。经典童话被解构——规则看似保护实则陷阱。玩家会觉得"继母怎么可能好心给规则"，这就是切入点。如果有人注意到"为什么是三条"或"规则之间有关联"，可以引导他们往仪式方向想。如果玩家猜到了"南瓜"和"祭品"，快要破解，自然地感叹"童话里总有人变成南瓜，但从没问过为什么是南瓜"。'
    },
    {
      title: '双鱼',
      type: 'host_manual', mood: 'mystery',
      soup_face: `记忆里，小镇上有一口古井很灵验。小时候，他经常跟小伙伴们在井边玩耍，他记得自己曾趴在井口往下看，能看到水里有鱼儿游动。

他离家多年，对故乡的记忆逐渐模糊，唯独那口古井，连井沿的触感都清晰得如在指尖。

后来，他决定回去，再去看看那口古井。然而回乡后他才发现——那口井在他出生前就被填平了。`,
      soup_bottom: '他不是他。他其实是双胞胎中的一个，真正的那个在很小的时候掉进井里淹死了。他拥有的"记忆"其实是死去兄弟的记忆——或者说，是他吸收了兄弟的灵魂。古井在"他出生前"就被填平了，因为他真正的出生时间比这更晚。填井的原因就是双胞胎中的一个溺死在了井里。那句"我不是我"，是他在发现自己身份后的感叹。',
      clues: '["我总是梦见自己溺水","母亲看我的眼神总是带着悲伤","家里有一张褪色的合照上面有两个婴儿","村里老人看到我时总是欲言又止"]',
      tags: '["悬疑","双线谜题","身份"]', difficulty: 4,
      host_manual: '身份认知类。核心是"记忆vs现实"的矛盾。玩家会分析"记忆为什么这么清晰"和"古井为什么被填平"。如果有人开始往"双胞胎"方向猜，或者说"他不是他"，可以插一句"记忆有时候不一定属于记忆者本人"——但如果玩家直接猜中核心，就轻松地打岔"你们脑洞真大，不过双胞胎这个方向...好像只是巧合吧？"。关键藏头/暗示："我不是我"——这四个字在汤底解读中会浮现。'
    },
    {
      title: '寻找阿吉',
      type: 'host_manual', mood: 'mystery',
      soup_face: `村里有一个叫阿吉的人，他做了一件事。然后他走了。

村里的人都在找他。有人说他往北走了，有人说他往南走了。

可村里人不知道，其实他一直没有离开。`,
      soup_bottom: '阿吉"找"了一个东西。村民在找阿吉，但把"找阿吉"听成了"找"+"阿吉"。实际上"寻找阿吉"不是找人——是阿吉在寻找一件东西，他找到了，然后就消失了。他没有离开村子，而是回到了他找到的那个东西所在的地方——一个所有人都知道的、但他一直在里面藏身的地方。',
      clues: '["每次派出去的人都会回到原地","村里的狗总是对着同一个方向叫","阿吉的屋子里还有温度","他做的事村里每个人的理解都不一样"]',
      tags: '["悬疑","双线谜题","文字游戏"]', difficulty: 5,
      host_manual: '文字游戏+双线谜题。核心是多义解读——"寻找阿吉"可以理解为"村民在找阿吉"，也可以理解为"阿吉在寻找某物"。玩家最终需要意识到这个标题本身就是一个双关。引导玩家时可以说"标题有时候就是谜面的一部分"但不要说更多。如果玩家猜出双关含义，可以说"中文真的太有意思了，一个短语两种读法"——自然又不会太刻意。'
    }
  ];

  for (const s of soups) {
    db.prepare(`INSERT INTO soups (id, title, type, mood, soup_face, soup_bottom, clues, tags, difficulty, host_manual)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(uuidv4(), s.title, s.type, s.mood, s.soup_face, s.soup_bottom, s.clues, s.tags, s.difficulty, s.host_manual);
  }
  console.log('[DB] 种子数据已导入');
}

module.exports = { initDB };
