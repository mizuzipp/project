/**
 * MIZU 接案管理 — Google Apps Script 後端（API）
 * 貼在「MIZU 接案資料庫」這份 Google Sheet 的 Apps Script 裡。
 * 網頁放在 GitHub Pages，透過 POST 呼叫這裡讀寫 Sheet、同步 Google 日曆、傳 LINE。
 * 部署設定：網頁應用程式／執行身分：我／存取權：所有人
 */
const TZ = 'Asia/Taipei';
const CASE_COLS = ['id','案名','品牌','歸屬','接案人','規格','狀態','實拿金額','分帳方式','00固定金額','米米固定金額',
  '拍攝日','拍攝完成','腳本日','腳本完成','AC日','AC完成','廠商過稿日','廠商過稿完成','上線日','上線完成','匯款日','匯款完成',
  '廠商聯絡人','相關連結','備註','最後修改','修改時間'];
const EXP_COLS = ['id','日期','分類','金額','誰付的','相關案件id','說明'];
const MS = [['shoot','拍攝'],['script','腳本'],['review','AC'],['approve','廠商過稿'],['publish','上線'],['payment','匯款']];
const TO_KEY = {'00':'00','0':'00','米米':'mimi','mimi':'mimi','Mizu':'mizu','MIZU':'mizu','mizu':'mizu'};
const TO_LABEL = {'00':'00','mimi':'米米','mizu':'Mizu'};

// 你們現有的 Google 日曆：00 個人案 → TZU、米米個人案 → Miranda、Mizu 案 → mizu 米事
const CALS = {
  '00': '3802fe65a1dfdde93b7bd8fd6d9acb977ff4d429a770f29f9ba9b5b17a9e1c49@group.calendar.google.com',
  'mimi': 'c3777fdcdd59fcf07841cfac3c5d12192e69ff026b1217e85d5594872d39266d@group.calendar.google.com',
  'mizu': '1560368ba62edb977ee3c119b950ddb5337a3c90d93e570f3ce750f96f3cb8c7@group.calendar.google.com'
};
// 日曆上的事件名稱，照你們原本的寫法：「拍攝｜案名」
const CAL_WORD = { shoot: '拍攝', script: '腳本', review: 'AC', approve: '過稿', publish: '上線', payment: '匯款' };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('MIZU')
    .addItem('同步全部案件到 Google 日曆', 'syncAll')
    .addItem('第一次設定（授權＋每小時自動同步）', 'setup')
    .addSeparator()
    .addItem('設定 LINE 官方帳號', 'setupLine')
    .addItem('現在傳一次 LINE 通知（測試）', 'lineDaily')
    .addToUi();
}

const LOGO_ID = '1A8VSfEfI3An4LXZ7Ekwz0YRdBGgRvbtb'; // Drive 上的 logo.png
const APP_URL = 'https://mizuzipp.github.io/project/';     // 網頁現在放在 GitHub Pages

// 舊網址打開時，提示搬家
function doGet() {
  const out = HtmlService.createHtmlOutput(
    '<div style="font-family:-apple-system,BlinkMacSystemFont,PingFang TC,sans-serif;text-align:center;padding:80px 20px">' +
    '<div style="font-size:20px;font-weight:600;margin-bottom:8px">MIZU 搬家囉 🏠</div>' +
    '<div style="color:#888;margin-bottom:24px">網頁換到新網址了，記得把新網址加到書籤</div>' +
    '<a href="' + APP_URL + '" target="_top" style="background:#9254DE;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none">前往新網址</a></div>')
    .setTitle('MIZU 接案管理');
  try { out.setFaviconUrl('https://drive.google.com/uc?id=' + LOGO_ID + '&export=download&format=png'); } catch (e) {}
  return out;
}

// 網頁（GitHub Pages）和 LINE 都會 POST 到這裡，用內容分辨
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) {}
  if (body.fn) return api_(body);
  lineWebhook_(body);
  return ContentService.createTextOutput('ok');
}
function api_(b) {
  const fns = { apiPublic, apiLogin, apiLogout, apiLoad, apiSaveCase, apiDeleteCase, apiSaveExpense, apiDeleteExpense,
    apiSetSettlement, apiSaveUser, apiSetPassword, apiLineCode, apiCalendar, apiChat, apiChatSend, apiMail, apiSaveDraft, apiSetPrices };
  let res;
  if (!fns[b.fn]) res = { ok: false, error: '不支援的操作' };
  else {
    try { res = { ok: true, data: fns[b.fn].apply(null, b.args || []) }; }
    catch (err) { res = { ok: false, error: String(err && err.message || err) }; }
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 工具 ---------- */
function sh_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function table_(name) {
  const v = sh_(name).getDataRange().getValues();
  const h = v.shift().map(String);
  return { h: h, rows: v.filter(r => r[0] !== '' && r[0] !== null) };
}
function d2s_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}
function s2d_(s) { return s ? Utilities.parseDate(s + ' 12:00', TZ, 'yyyy-MM-dd HH:mm') : ''; }
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function key_(v) { return TO_KEY[String(v).trim()] || '00'; }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }

function upsert_(name, id, row) {
  const s = sh_(name);
  const ids = s.getRange(1, 1, Math.max(s.getLastRow(), 1), 1).getValues().map(r => String(r[0]));
  let i = ids.indexOf(String(id));
  const rowNo = i >= 0 ? i + 1 : s.getLastRow() + 1;
  const rg = s.getRange(rowNo, 1, 1, row.length);
  rg.setNumberFormats([row.map(v => (typeof v === 'string' ? '@' : (v instanceof Date ? 'yyyy-mm-dd' : 'General')))]);
  rg.setValues([row]);
}
function remove_(name, id) {
  const s = sh_(name);
  const ids = s.getRange(1, 1, s.getLastRow(), 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  if (i > 0) s.deleteRow(i + 1);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- 登入 ---------- */
function users_(withPw) {
  const t = table_('帳號');
  const out = {};
  t.rows.forEach(r => {
    const g = k => r[t.h.indexOf(k)];
    const k = key_(g('帳號'));
    out[k] = { name: String(g('名稱') || TO_LABEL[k]), color: g('代表色') || '#9254DE', emoji: g('emoji') || '🙂',
      bg: g('背景色') || '#F9F0FF', photo: g('頭貼') || '', status: g('狀態') || '', lineBound: !!g('LINE'), prefs: prefs_(g('偏好')) };
    if (withPw) out[k].pw = String(g('密碼'));
  });
  return out;
}
function prefs_(v) { try { return v ? JSON.parse(v) : {}; } catch (e) { return {}; } }
function auth_(token) {
  const u = token && PropertiesService.getScriptProperties().getProperty('tok_' + token);
  if (!u) throw new Error('請重新登入');
  return u;
}
function apiPublic() { return users_(false); }
function apiLogin(u, pw) {
  const us = users_(true);
  if (!us[u] || us[u].pw !== String(pw)) return null;
  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('tok_' + token, u);
  return token;
}
function apiLogout(token) { PropertiesService.getScriptProperties().deleteProperty('tok_' + token); }

/* ---------- 讀取 ---------- */
function apiLoad(token) {
  const me = auth_(token);
  const cases = casesFromSheet_();
  const e = table_('支出');
  const expenses = e.rows.map(r => {
    const g = k => r[e.h.indexOf(k)];
    return { id: String(g('id')), date: d2s_(g('日期')), cat: String(g('分類')), amount: Number(g('金額')) || 0,
      payer: key_(g('誰付的')), caseId: String(g('相關案件id') || '') || null, note: String(g('說明') || ''),
      split: ({ '全算00': '00', '全算米米': 'mimi' })[String(g('怎麼分') || '')] || 'half' };
  });
  const s = table_('月結');
  const settlements = {};
  s.rows.forEach(r => { if (bool_(r[1])) settlements[String(r[0])] = { done: true, by: key_(r[2]), at: d2s_(r[3]) }; });
  return { me: me, users: users_(false), cases: cases, expenses: expenses, settlements: settlements };
}

// 舊欄位名稱「校稿日／校稿完成」自動改成「AC日／AC完成」
function migrateAC_() {
  const s = sh_('案件');
  const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  [['校稿日', 'AC日'], ['校稿完成', 'AC完成']].forEach(([a, b]) => { const i = h.indexOf(a); if (i >= 0) s.getRange(1, i + 1).setValue(b); });
}
function casesFromSheet_() {
  let c = table_('案件');
  if (c.h.indexOf('校稿日') >= 0) { migrateAC_(); c = table_('案件'); }
  const cases = c.rows.map(r => {
    const g = k => r[c.h.indexOf(k)];
    const ms = {}, tt = parseTimes_(c.h.indexOf('時間') >= 0 ? g('時間') : '');
    const mv = c.h.indexOf('隸屬月份') >= 0 ? g('隸屬月份') : '';
    const month = mv instanceof Date ? Utilities.formatDate(mv, TZ, 'yyyy-MM') : (String(mv || '').match(/^(\d{4})[-\/.](\d{1,2})/) ? String(mv).replace(/^(\d{4})[-\/.](\d{1,2}).*$/, (_, y, m) => y + '-' + ('0' + m).slice(-2)) : '');
    MS.forEach(([k, l]) => { ms[k] = { date: d2s_(g(l + '日')), time: tt[k] || '', done: bool_(g(l + '完成')) }; });
    const owner = key_(g('歸屬'));
    return {
      id: String(g('id')), title: String(g('案名')), brand: String(g('品牌') || ''), owner: owner,
      lead: owner === 'mizu' ? key_(g('接案人')) : owner,
      specs: String(g('規格') || '').split(/[、,]/).map(s => s.trim()).filter(String),
      status: String(g('狀態') || '確定合作'), amount: Number(g('實拿金額')) || 0,
      split: g('分帳方式') === '固定金額' ? 'fixed' : 'half',
      fixed: { '00': Number(g('00固定金額')) || 0, 'mimi': Number(g('米米固定金額')) || 0 },
      month: month, ms: ms, contact: String(g('廠商聯絡人') || ''), link: String(g('相關連結') || ''), note: String(g('備註') || ''),
      updatedBy: TO_KEY[String(g('最後修改'))] || ''
    };
  });
  return cases;
}

// 「時間」欄格式：拍攝 14:00、腳本 10:30（沒寫的就是整天）
function parseTimes_(v) {
  const o = {};
  String(v || '').split(/[、,，]/).forEach(p => {
    const m = p.trim().match(/^(\S+)\s+(\d{1,2}):(\d{2})$/);
    if (!m) return;
    const k = (MS.find(x => x[1] === m[1] || x[1] === m[1].replace('校稿', 'AC')) || [])[0];
    if (k) o[k] = ('0' + m[2]).slice(-2) + ':' + m[3];
  });
  return o;
}
function timesStr_(c) {
  return MS.filter(([k]) => c.ms[k] && c.ms[k].date && c.ms[k].time).map(([k, l]) => l + ' ' + c.ms[k].time).join('、');
}
// 「時間」「隸屬月份」放在最後面的欄位（隸屬月份空白 = 跟拍攝日）
function writeTimes_(c) {
  ensureCol_('案件', '時間');
  ensureCol_('案件', '隸屬月份');
  const s = sh_('案件');
  const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const ids = s.getRange(1, 1, s.getLastRow(), 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(c.id));
  if (i < 0) return;
  s.getRange(i + 1, h.indexOf('時間') + 1).setNumberFormat('@').setValue(timesStr_(c));
  s.getRange(i + 1, h.indexOf('隸屬月份') + 1).setNumberFormat('@').setValue(/^\d{4}-\d{2}$/.test(c.month || '') ? c.month : '');
}

/* ---------- 信件＋報價建議 ---------- */
// 第一次更新後，請在 Apps Script 編輯器上方選 authorizeGmail → 執行，允許讀取 Gmail 和建立草稿
function authorizeGmail() { GmailApp.getInboxUnreadCount(); GmailApp.getDrafts(); }
const DEF_PRICES = { 'Reels': 3500, '配音': 500, 'Threads': 1000, '抖音': 1000, '限動': 500, '廣告主': 1000, '素材授權': 1500, '圖文': 1500 };
const SPEC_RX = [
  ['Reels', /reels?|短影音|短影片|影片|video/i], ['配音', /配音|旁白|口播|voice/i], ['Threads', /threads|脆/i],
  ['抖音', /抖音|tiktok/i], ['限動', /限動|限時動態|stor(y|ies)/i], ['廣告主', /廣告主|投放|白名單|ads?\b|廣告授權|boost/i],
  ['素材授權', /素材授權|授權使用|二次使用|二次利用|官方使用|usage right/i], ['圖文', /圖文|貼文|\bpost\b|輪播/i]];
const INQ_RX = /合作|邀約|邀請|業配|報價|詢價|費用|預算|開箱|體驗|試吃|試用|推廣|宣傳|媒體日|kol|influencer|collab|sponsor|quotation|rate card|業務洽談/i;
function getPrices_() {
  try { const v = PropertiesService.getScriptProperties().getProperty('prices'); if (v) return Object.assign({}, DEF_PRICES, JSON.parse(v)); } catch (e) {}
  return Object.assign({}, DEF_PRICES);
}
function apiSetPrices(token, o) {
  auth_(token);
  const clean = {};
  Object.keys(DEF_PRICES).forEach(k => clean[k] = Math.max(0, Math.round(+o[k] || 0)));
  PropertiesService.getScriptProperties().setProperty('prices', JSON.stringify(clean));
  return clean;
}
function draftMap_() {
  const m = {};
  GmailApp.getDrafts().forEach(d => { try { const msg = d.getMessage(); m[msg.getThread().getId()] = { id: d.getId(), body: msg.getPlainBody() }; } catch (e) {} });
  return m;
}
function apiMail(token) {
  auth_(token);
  const mine = Session.getEffectiveUser().getEmail().toLowerCase();
  const drafts = draftMap_();
  const threads = GmailApp.search('in:inbox newer_than:45d -category:promotions -category:social', 0, 30);
  const out = threads.map(th => {
    const msgs = th.getMessages();
    const first = msgs.filter(x => x.getFrom().toLowerCase().indexOf(mine) < 0)[0] || msgs[0];
    const last = msgs[msgs.length - 1];
    const fromRaw = first.getFrom(), mm = fromRaw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
    const body = first.getPlainBody().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const text = th.getFirstMessageSubject() + '\n' + body.slice(0, 4000);
    const replied = msgs.some(x => x.getFrom().toLowerCase().indexOf(mine) >= 0 && !x.isDraft());
    return {
      id: th.getId(), subject: th.getFirstMessageSubject() || '（沒有主旨）',
      from: mm ? (mm[1].trim() || mm[2]) : fromRaw, email: mm ? mm[2] : fromRaw,
      date: Utilities.formatDate(last.getDate(), TZ, "yyyy-MM-dd'T'HH:mm"),
      snippet: body.replace(/\s+/g, ' ').slice(0, 90), body: body.slice(0, 6000),
      inquiry: INQ_RX.test(text), specs: SPEC_RX.filter(r => r[1].test(text)).map(r => r[0]),
      replied: replied, draft: drafts[th.getId()] || null
    };
  });
  return { threads: out, prices: getPrices_() };
}
function apiSaveDraft(token, threadId, body) {
  auth_(token);
  const th = GmailApp.getThreadById(threadId);
  if (!th) throw new Error('找不到這封信');
  GmailApp.getDrafts().forEach(d => { try { if (d.getMessage().getThread().getId() === threadId) d.deleteDraft(); } catch (e) {} });
  const mine = Session.getEffectiveUser().getEmail().toLowerCase();
  const others = th.getMessages().filter(x => x.getFrom().toLowerCase().indexOf(mine) < 0 && !x.isDraft());
  const target = others.length ? others[others.length - 1] : null;   // 回覆對方最後一封
  const d = target ? target.createDraftReply(String(body || '')) : th.createDraftReply(String(body || ''));
  return { id: d.getId() };
}

/* ---------- 聊天室 ---------- */
function chatSheet_() {
  let s = sh_('聊天');
  if (!s) { s = SpreadsheetApp.getActive().insertSheet('聊天'); s.appendRow(['id', '時間', '誰', '內容']); s.getRange('A:D').setNumberFormat('@'); }
  return s;
}
function apiChat(token, since) {
  auth_(token);
  const s = chatSheet_(), n = s.getLastRow() - 1;
  if (n < 1) return [];
  const take = since ? Math.min(n, 300) : Math.min(n, 300);
  const rows = s.getRange(s.getLastRow() - take + 1, 1, take, 4).getValues();
  return rows.filter(r => r[0] && (!since || String(r[1]) > since))
    .map(r => ({ id: String(r[0]), at: String(r[1]), from: key_(r[2]), text: String(r[3]) }));
}
function apiChatSend(token, text) {
  const me = auth_(token);
  text = String(text || '').trim().slice(0, 2000);
  if (!text) throw new Error('訊息是空的');
  return withLock_(() => {
    const m = { id: Utilities.getUuid(), at: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS"), from: me, text: text };
    const s = chatSheet_();
    s.getRange(s.getLastRow() + 1, 1, 1, 4).setNumberFormat('@').setValues([[m.id, m.at, TO_LABEL[me], text]]);
    return m;
  });
}

/* ---------- Google 日曆同步 ---------- */
function calTime_(d, t) { return Utilities.parseDate(d + ' ' + t, TZ, 'yyyy-MM-dd HH:mm'); }
function calDate_(s) { return Utilities.parseDate(s + ' 12:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }
function syncCtx_() {
  let s = sh_('日曆同步');
  if (!s) { s = SpreadsheetApp.getActive().insertSheet('日曆同步'); s.appendRow(['key', '日曆', '事件id', '日期', '標題']); s.hideSheet(); }
  const m = {};
  s.getDataRange().getValues().slice(1).forEach((r, i) => { if (r[0]) m[r[0]] = { cal: String(r[1]), id: String(r[2]), date: (r[3] instanceof Date) ? d2s_(r[3]) : String(r[3] || ''), title: String(r[4] || ''), row: i + 2 }; });
  return { s: s, m: m, cals: {} };
}
function cal_(ctx, id) { return ctx.cals[id] || (ctx.cals[id] = CalendarApp.getCalendarById(id)); }
function setRec_(ctx, key, cal, id, date, title) {
  const rec = ctx.m[key];
  const row = [key, cal, id, date, title || ''];
  if (rec) ctx.s.getRange(rec.row, 1, 1, 5).setNumberFormat('@').setValues([row]);
  else { ctx.s.appendRow(row); ctx.m[key] = { row: ctx.s.getLastRow() }; }
  Object.assign(ctx.m[key], { cal: cal, id: id, date: date, title: title || '' });
}
function syncCase_(c, ctx) {
  ctx = ctx || syncCtx_();
  const oldest = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), TZ, 'yyyy-MM-dd');
  MS.forEach(([k]) => {
    const key = c.id + '_' + k, rec = ctx.m[key], date = c.ms[k].date, time = date ? (c.ms[k].time || '') : '';
    const dk = date + (time ? ' ' + time : '');
    const calId = CALS[c.owner], title = CAL_WORD[k] + '｜' + c.title;
    if (!date && !(rec && rec.id)) return;
    if (date && rec && rec.id && rec.date === dk && rec.cal === calId && rec.title === title) return; // 沒變就跳過
    let ev = null;
    if (rec && rec.id) { try { ev = cal_(ctx, rec.cal).getEventById(rec.id); } catch (e) { ev = null; } }
    if (!date) { if (ev) ev.deleteEvent(); if (rec && rec.id) setRec_(ctx, key, '', '', ''); return; }
    if (!ev && date < oldest) return; // 太久以前的不補
    if (ev && rec.cal !== calId) { ev.deleteEvent(); ev = null; } // 歸屬改了，換日曆
    const cal = cal_(ctx, calId);
    if (!ev) {
      // 日曆上已經有同名事件（你們手動建的）就直接沿用，不重複建
      const same = cal.getEventsForDay(calDate_(date));
      ev = same.filter(e => e.getTitle() === title)[0] || same.filter(e => looksSame_(e.getTitle(), title))[0];
      if (ev) { if (ev.getTitle() !== title) ev.setTitle(title); if (k === 'payment') ev.setColor(CalendarApp.EventColor.RED); }
      else ev = newEv_(cal, title, date, time, k);
      if (time && ev.isAllDayEvent()) { ev.deleteEvent(); ev = newEv_(cal, title, date, time, k); }
      else if (time) setEvTime_(ev, date, time);
      setRec_(ctx, key, calId, ev.getId(), dk, title);
      return;
    }
    if (ev.getTitle() !== title) ev.setTitle(title);
    const hadTime = (rec.date || '').length > 10;
    if (time) {
      if (ev.isAllDayEvent()) { ev.deleteEvent(); ev = newEv_(cal, title, date, time, k); }
      else if (rec.date !== dk) setEvTime_(ev, date, time);
    } else if (hadTime && !ev.isAllDayEvent()) { ev.deleteEvent(); ev = newEv_(cal, title, date, '', k); }
    else if (rec.date !== dk) {
      if (ev.isAllDayEvent()) ev.setAllDayDate(calDate_(date));
      else {
        const st = ev.getStartTime(), dur = ev.getEndTime() - st;
        const ns = Utilities.parseDate(date + ' ' + Utilities.formatDate(st, TZ, 'HH:mm'), TZ, 'yyyy-MM-dd HH:mm');
        ev.setTime(ns, new Date(ns.getTime() + dur));
      }
    }
    setRec_(ctx, key, calId, ev.getId(), dk, title);
  });
}
// 沒選時間 → 整天；有選時間 → 從那個時間開始 1 小時
function newEv_(cal, title, date, time, k) {
  const o = { description: '由 MIZU 接案管理同步' };
  let ev;
  if (!time) ev = cal.createAllDayEvent(title, calDate_(date), o);
  else { const st = calTime_(date, time); ev = cal.createEvent(title, st, new Date(st.getTime() + 36e5), o); }
  if (k === 'payment') ev.setColor(CalendarApp.EventColor.RED);   // 匯款一律紅色
  return ev;
}
// 自己手動建的行程（例如「AC｜統一布丁翻轉」）跟網頁的「AC｜統一布丁翻轉雪糕」視為同一個，不重複建
function looksSame_(a, b) {
  const n = s => String(s).replace(/[\s　()（）「」『』《》]/g, '').toLowerCase();
  const [pa, ...ra] = String(a).trim().split('｜'), [pb, ...rb] = String(b).trim().split('｜');
  if (!ra.length || pa.trim() !== pb.trim()) return false;
  const x = n(ra.join('')), y = n(rb.join(''));
  return x.length >= 2 && y.length >= 2 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0);
}
function setEvTime_(ev, date, time) {
  const st = calTime_(date, time);
  const dur = ev.isAllDayEvent() ? 36e5 : (ev.getEndTime() - ev.getStartTime()) || 36e5;
  ev.setTime(st, new Date(st.getTime() + dur));
}
function unsyncCase_(id) {
  const ctx = syncCtx_();
  MS.forEach(([k]) => {
    const rec = ctx.m[id + '_' + k];
    if (rec && rec.id) { try { cal_(ctx, rec.cal).getEventById(rec.id).deleteEvent(); } catch (e) {} setRec_(ctx, id + '_' + k, '', '', ''); }
  });
}
function syncAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ctx = syncCtx_();
    casesFromSheet_().forEach(c => { try { syncCase_(c, ctx); } catch (e) { console.log(c.title, e); } });
  } finally { lock.releaseLock(); }
}
function setup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncAll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  syncAll();
}
// 網頁日曆：抓三個日曆上「不是案件同步來的」其他行程
function apiCalendar(token, from, to) {
  auth_(token);
  const ctx = syncCtx_();
  const ours = {};
  Object.keys(ctx.m).forEach(k => { if (ctx.m[k].id) ours[ctx.m[k].id] = 1; });
  const out = [];
  const start = Utilities.parseDate(from + ' 00:00', TZ, 'yyyy-MM-dd HH:mm');
  const end = Utilities.parseDate(to + ' 23:59', TZ, 'yyyy-MM-dd HH:mm');
  Object.keys(CALS).forEach(who => {
    const cal = cal_(ctx, CALS[who]);
    if (!cal) return;
    cal.getEvents(start, end).forEach(e => {
      if (ours[e.getId()]) return;
      const all = e.isAllDayEvent();
      out.push({ who: who, title: e.getTitle(), time: all ? '' : Utilities.formatDate(e.getStartTime(), TZ, 'HH:mm'),
        date: all ? Utilities.formatDate(e.getAllDayStartDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd') : Utilities.formatDate(e.getStartTime(), TZ, 'yyyy-MM-dd') });
    });
  });
  return out;
}

/* ---------- 寫入 ---------- */
function apiSaveCase(token, c) {
  const me = auth_(token);
  return withLock_(() => {
    const cur = table_('案件');
    const old = cur.rows.find(r => String(r[0]) === String(c.id));
    if (old) {
      const o = key_(old[cur.h.indexOf('歸屬')]);
      if (o !== me && o !== 'mizu') throw new Error('這是對方的個人案，只能檢視');
    }
    if (c.owner !== me && c.owner !== 'mizu') throw new Error('只能新增自己或 Mizu 的案子');
    const row = [c.id, c.title, c.brand || '', TO_LABEL[c.owner], TO_LABEL[c.owner === 'mizu' ? c.lead : c.owner],
      (c.specs || []).join('、'), c.status, Number(c.amount) || 0, c.split === 'fixed' ? '固定金額' : '對半',
      Number(c.fixed && c.fixed['00']) || 0, Number(c.fixed && c.fixed['mimi']) || 0];
    MS.forEach(([k]) => { row.push(s2d_(c.ms[k].date)); row.push(!!c.ms[k].done); });
    row.push(c.contact || '', c.link || '', c.note || '', TO_LABEL[me], now_());
    upsert_('案件', c.id, row);
    writeTimes_(c);
    try { syncCase_(c); } catch (e) { console.log('calendar', e); }
    return true;
  });
}
function apiDeleteCase(token, id) {
  const me = auth_(token);
  return withLock_(() => {
    const cur = table_('案件');
    const old = cur.rows.find(r => String(r[0]) === String(id));
    if (!old) return true;
    const o = key_(old[cur.h.indexOf('歸屬')]);
    if (o !== me && o !== 'mizu') throw new Error('這是對方的個人案，不能刪除');
    remove_('案件', id);
    try { unsyncCase_(id); } catch (e) { console.log('calendar', e); }
    return true;
  });
}
function apiSaveExpense(token, x) {
  auth_(token);
  return withLock_(() => {
    ensureCol_('支出', '怎麼分');
    const sp = x.split === '00' ? '全算00' : x.split === 'mimi' ? '全算米米' : '平分';
    upsert_('支出', x.id, [x.id, s2d_(x.date), x.cat, Number(x.amount) || 0, TO_LABEL[x.payer], x.caseId || '', x.note || '', sp]);
    return true;
  });
}
function apiDeleteExpense(token, id) { auth_(token); return withLock_(() => { remove_('支出', id); return true; }); }
function apiSetSettlement(token, month, done) {
  const me = auth_(token);
  return withLock_(() => {
    upsert_('月結', month, [month, !!done, done ? TO_LABEL[me] : '', done ? s2d_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) : '']);
    return true;
  });
}
function apiSaveUser(token, f) {
  const me = auth_(token);
  return withLock_(() => {
    if (f.prefs != null) ensureCol_('帳號', '偏好');
    const s = sh_('帳號'), t = table_('帳號');
    const i = t.rows.findIndex(r => key_(r[0]) === me);
    const r = i + 2;
    const set = (k, v) => s.getRange(r, t.h.indexOf(k) + 1).setValue(v);
    if (f.name != null) set('名稱', f.name);
    if (f.color != null) set('代表色', f.color);
    if (f.emoji != null) set('emoji', f.emoji);
    if (f.bg != null) set('背景色', f.bg);
    if (f.photo != null) set('頭貼', f.photo);
    if (f.status != null) set('狀態', f.status);
    if (f.prefs != null) set('偏好', JSON.stringify(f.prefs));
    return true;
  });
}
function apiSetPassword(token, oldPw, newPw) {
  const me = auth_(token);
  const us = users_(true);
  if (us[me].pw !== String(oldPw)) throw new Error('目前的密碼不對');
  if (String(newPw).length < 6) throw new Error('新密碼至少 6 個字');
  const s = sh_('帳號'), t = table_('帳號');
  const i = t.rows.findIndex(r => key_(r[0]) === me);
  s.getRange(i + 2, t.h.indexOf('密碼') + 1).setNumberFormat('@').setValue(String(newPw));
  return true;
}

/* ---------- LINE 通知 ---------- */
const PROPS = () => PropertiesService.getScriptProperties();

// 選單：MIZU → 設定 LINE 官方帳號
function setupLine() {
  const ui = SpreadsheetApp.getUi();
  const t = ui.prompt('設定 LINE（1/2）', '貼上 Messaging API 的 Channel access token（長期）', ui.ButtonSet.OK_CANCEL);
  if (t.getSelectedButton() !== ui.Button.OK || !t.getResponseText().trim()) return;
  PROPS().setProperty('LINE_TOKEN', t.getResponseText().trim());
  const o = ui.prompt('設定 LINE（2/2）', '官方帳號的 ID（例如 @123abcde），會顯示在網頁上方便你們加好友', ui.ButtonSet.OK_CANCEL);
  if (o.getSelectedButton() === ui.Button.OK) PROPS().setProperty('LINE_OA', o.getResponseText().trim());
  ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'lineDaily').forEach(x => ScriptApp.deleteTrigger(x));
  ScriptApp.newTrigger('lineDaily').timeBased().everyDays(1).atHour(21).nearMinute(0).inTimezone(TZ).create();
  ensureLineCol_();
  ui.alert('設定完成！\n\n接下來：\n1. 到 LINE Developers 把 Webhook URL 設成這個網頁的網址\n2. 你們兩個加官方帳號好友\n3. 在網頁「個人設定」產生綁定碼，傳給官方帳號');
}
function ensureLineCol_() { ensureCol_('帳號', 'LINE'); }
function ensureCol_(sheet, name) {
  const s = sh_(sheet);
  const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  if (h.indexOf(name) < 0) {
    if (s.getMaxColumns() <= h.length) s.insertColumnAfter(h.length);
    s.getRange(1, h.length + 1).setValue(name);
  }
}
function apiLineCode(token) {
  const me = auth_(token);
  if (!PROPS().getProperty('LINE_TOKEN')) throw new Error('還沒設定 LINE 官方帳號，請先在 Sheet 的「MIZU → 設定 LINE 官方帳號」完成設定');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  CacheService.getScriptCache().put('bind_' + code, me, 600);
  return { code: code, oa: PROPS().getProperty('LINE_OA') || '' };
}
// LINE 傳訊息進來時（Webhook）
function lineWebhook_(body) {
  try {
    (body.events || []).forEach(ev => {
      if (ev.type === 'follow') return lineReply_(ev.replyToken, '嗨！到 MIZU 網頁的「個人設定 → LINE 通知」產生綁定碼，再把 6 位數字傳給我就完成綁定 🙌');
      if (ev.type !== 'message' || ev.message.type !== 'text') return;
      const text = ev.message.text.trim();
      if (/^\d{6}$/.test(text)) {
        const cache = CacheService.getScriptCache();
        const who = cache.get('bind_' + text);
        if (!who) return lineReply_(ev.replyToken, '這組綁定碼不對或過期了，回網頁重新產生一組試試看');
        cache.remove('bind_' + text);
        ensureLineCol_();
        const s = sh_('帳號'), t = table_('帳號');
        const i = t.rows.findIndex(r => key_(r[0]) === who);
        s.getRange(i + 2, t.h.indexOf('LINE') + 1).setValue(ev.source.userId);
        const name = users_(false)[who].name;
        return lineReply_(ev.replyToken, '綁定成功 ✨ ' + name + '，之後每天晚上 9 點會把隔天要做的事傳給你');
      }
      if (text === '明天' || text === '待辦') {
        const who = whoByLine_(ev.source.userId);
        if (who) return lineReply_(ev.replyToken, buildDigest_(who, casesFromSheet_()) || '明天沒有排程，好好休息 🌙');
      }
    });
  } catch (err) { console.log(err); }
}
function whoByLine_(uid) {
  const t = table_('帳號');
  const r = t.rows.find(x => String(x[t.h.indexOf('LINE')]) === uid);
  return r ? key_(r[0]) : null;
}
function responsible_(c, k) {
  if (c.owner !== 'mizu') return [c.owner];
  if (k === 'shoot') return ['00', 'mimi'];
  if (k === 'script') return ['00'];
  if (k === 'review') return ['mimi'];
  return [c.lead];
}
const TASK_WORD = { shoot: '拍攝', script: '腳本', review: 'AC', approve: '跟廠商過稿', publish: '發布上線', payment: '追匯款' };
function buildDigest_(who, cases) {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const tmr = Utilities.formatDate(new Date(Date.now() + 864e5), TZ, 'yyyy-MM-dd');
  const tomorrow = [], overdue = [];
  cases.forEach(c => {
    if (c.status === 'On hold' || c.status === '已結案') return;
    MS.forEach(([k]) => {
      const m = c.ms[k];
      if (!m.date || m.done || responsible_(c, k).indexOf(who) < 0) return;
      const line = '・' + (m.time ? m.time + ' ' : '') + TASK_WORD[k] + '｜' + c.title + (k === 'shoot' && c.owner === 'mizu' ? '（一起）' : '');
      if (m.date === tmr) tomorrow.push(line);
      else if (m.date <= today) overdue.push(line + '（' + m.date.slice(5).replace('-', '/') + '）');
    });
  });
  if (!tomorrow.length && !overdue.length) return '';
  const wk = '日一二三四五六'[new Date(Date.now() + 864e5).getDay()];
  let msg = '📋 明天 ' + tmr.slice(5).replace('-', '/') + '（' + wk + '）要做的事\n';
  msg += tomorrow.length ? tomorrow.join('\n') : '・沒有新的排程';
  if (overdue.length) msg += '\n\n⚠️ 還沒完成（' + overdue.length + '）\n' + overdue.slice(0, 10).join('\n') + (overdue.length > 10 ? '\n…還有 ' + (overdue.length - 10) + ' 件' : '');
  msg += '\n\n👉 ' + APP_URL;
  return msg;
}
// 每天晚上 9 點自動執行
function lineDaily() {
  const tokenOk = PROPS().getProperty('LINE_TOKEN');
  if (!tokenOk) return;
  const t = table_('帳號'), cases = casesFromSheet_();
  t.rows.forEach(r => {
    const uid = String(r[t.h.indexOf('LINE')] || '');
    if (!uid) return;
    const msg = buildDigest_(key_(r[0]), cases);
    if (msg) linePush_(uid, msg); // 明天沒事就不傳，省額度
  });
}
function linePush_(to, text) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + PROPS().getProperty('LINE_TOKEN') },
    payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] })
  });
}
function lineReply_(replyToken, text) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + PROPS().getProperty('LINE_TOKEN') },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] })
  });
}
