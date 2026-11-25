// 미나의 하루 — 개인 항목 폰 알림 (남편과 공유한 항목은 spaces/ 에 있어서 여기선 안 읽음)
// GitHub Actions 에서 10분마다 실행. 비밀값 FIREBASE_SA(서비스 계정 JSON) 필요.
import admin from 'firebase-admin';

const sa = JSON.parse(process.env.FIREBASE_SA || '{}');
if (!sa.project_id) { console.log('FIREBASE_SA 비밀값이 없어요'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const DRY = process.env.DRY_RUN === '1';

/* ---------- 날짜 (앱과 같은 계산) ---------- */
const WD = ['일','월','화','수','목','금','토'];
const pad = n => (n < 10 ? '0' : '') + n;
const iso = (y,m,d) => y + '-' + pad(m) + '-' + pad(d);
const parse = s => { const p = s.split('-'); return { y:+p[0], m:+p[1], d:+p[2] }; };
const utc = (y,m,d) => Date.UTC(y,m-1,d);
const dow = (y,m,d) => new Date(utc(y,m,d)).getUTCDay();
const dim = (y,m) => new Date(Date.UTC(y,m,0)).getUTCDate();
const addDays = (s,n) => { const p = parse(s), x = new Date(utc(p.y,p.m,p.d) + n*864e5); return iso(x.getUTCFullYear(), x.getUTCMonth()+1, x.getUTCDate()); };
const addMonths = (t,n) => { const p = parse(t); let m = p.m-1+n; const y = p.y + Math.floor(m/12); m = ((m%12)+12)%12+1; return iso(y,m,Math.min(p.d,dim(y,m))); };
const weekIdx = t => { const p = parse(t); return Math.floor((utc(p.y,p.m,p.d)/864e5+3)/7); };
const toMin = t => { const [h,m] = String(t||'0:0').split(':'); return (+h)*60 + (+m||0); };

function jstNow(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  const o = {}; f.formatToParts(d).forEach(p => o[p.type] = p.value);
  const h = +o.hour % 24;
  return { today: `${o.year}-${o.month}-${o.day}`, min: h*60 + (+o.minute), h };
}
const NOWJ = process.env.FAKE_NOW ? jstNow(new Date(process.env.FAKE_NOW)) : jstNow();
const TODAY = NOWJ.today, TOMORROW = addDays(TODAY, 1);

function evRule(e) {
  if (e.rr && e.rr.unit) return e.rr;
  const r = e.repeat || 'none', p = parse(e.date);
  if (r === 'daily') return { unit:'day', every:1 };
  if (r === 'weekly') return { unit:'week', every:1, days:[dow(p.y,p.m,p.d)] };
  if (r === 'monthly') return { unit:'month', every:1, mt:'date' };
  if (r === 'yearly') return { unit:'year', every:1 };
  return null;
}
function ruleMatch(date, rr, s) {
  if (s < date) return false;
  if (rr.until && s > rr.until) return false;
  const a = parse(date), b = parse(s), n = Math.max(1, +rr.every || 1);
  if (rr.unit === 'day') return Math.round((utc(b.y,b.m,b.d) - utc(a.y,a.m,a.d))/864e5) % n === 0;
  if (rr.unit === 'week') { const ds = (rr.days && rr.days.length) ? rr.days.map(Number) : [dow(a.y,a.m,a.d)]; if (ds.indexOf(dow(b.y,b.m,b.d)) < 0) return false; return (weekIdx(s) - weekIdx(date)) % n === 0; }
  const mo = (b.y-a.y)*12 + (b.m-a.m);
  if (rr.unit === 'month') { if (mo % n) return false;
    if (rr.mt === 'nth' || rr.mt === 'last') { if (dow(b.y,b.m,b.d) !== dow(a.y,a.m,a.d)) return false; return rr.mt === 'last' ? b.d+7 > dim(b.y,b.m) : Math.ceil(b.d/7) === Math.ceil(a.d/7); }
    return b.d === Math.min(a.d, dim(b.y,b.m)); }
  if (rr.unit === 'year') { if ((b.y-a.y) % n) return false; return b.m === a.m && b.d === Math.min(a.d, dim(b.y,b.m)); }
  return false;
}
function eventOn(e, s) { if (!e.date || s < e.date) return false; const rr = evRule(e); return rr ? ruleMatch(e.date, rr, s) : e.date === s; }

const rtYearly = r => r.mode === 'yearly' || !!r.amount;
function rtAfter(r, from) { const e = Math.max(1, +r.every || 7), u = r.eunit || 'day'; return u === 'month' ? addMonths(from, e) : addDays(from, u === 'week' ? e*7 : e); }
function rtDue(r) { if (r.mode && r.mode !== 'every') return null; return r.last ? rtAfter(r, r.last) : (r.since || TODAY); }

let DF = null; try { DF = new Intl.DateTimeFormat('en-u-ca-dangi', { month:'numeric', day:'numeric', timeZone:'UTC' }); } catch (e) {}
function lunarOf(s) { if (!DF) return null; const p = parse(s); let lm = '', ld = 0; DF.formatToParts(new Date(utc(p.y,p.m,p.d))).forEach(x => { if (x.type === 'month') lm = x.value; if (x.type === 'day') ld = +x.value; }); return { lm, ld }; }
function annualOn(a, s) {
  const p = parse(s);
  if (a.kind === 'birth' && a.cal === 'lunar') { const l = lunarOf(s); return !!l && l.lm === String(a.m) && l.ld === +a.d; }
  return p.m === +a.m && p.d === +a.d;
}

/* ---------- 하루치 모으기 ---------- */
function dayItems(S, s, isToday) {
  const evs = S.events.filter(e => eventOn(e, s)).sort((a,b) => (a.time||'').localeCompare(b.time||''));
  const todos = S.todos.filter(t => !t.done && t.due && (isToday ? t.due <= s : t.due === s));
  const rts = S.routines.filter(r => { if (rtYearly(r)) return false; const d = rtDue(r); return d && (isToday ? d <= s : d === s); });
  const days = S.annual.filter(a => annualOn(a, s)).map(a => a.name + (a.kind === 'birth' ? ' 생일' : ''))
    .concat(S.routines.filter(r => rtYearly(r) && rtDue(r) === s).map(r => r.name + ' 연회비'));
  return { evs, todos, rts, days };
}
function summary(it, s) {
  const lines = [];
  it.days.forEach(d => lines.push('🎈 ' + d));
  it.evs.forEach(e => lines.push((e.time ? e.time : '종일') + ' ' + (e.title || '일정')));
  if (it.todos.length) lines.push('할 일: ' + it.todos.map(t => (t.due < s ? '(지남) ' : '') + String(t.text||'').split('\n')[0]).join(', '));
  if (it.rts.length) lines.push('루틴: ' + it.rts.map(r => r.name).join(', '));
  return lines;
}

/* ---------- 보내기 ---------- */
async function send(uid, tokens, msg) {
  if (DRY) { console.log('[DRY]', uid, JSON.stringify(msg)); return []; }
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: msg.title, body: msg.body, tag: msg.tag || '', url: './' },
    webpush: { headers: { Urgency: 'high', TTL: String(msg.ttl || 3600) } },
  });
  const bad = [];
  res.responses.forEach((r, i) => { if (!r.success) { const c = r.error && r.error.code || ''; console.log('실패', c); if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(c)) bad.push(tokens[i]); } });
  return bad;
}

async function loadCol(uid, c) {
  const snap = await db.collection('users').doc(uid).collection(c).get();
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(x => !x.sample);
}

async function runUser(uid) {
  const meta = db.collection('users').doc(uid).collection('meta');
  const pdoc = await meta.doc('push').get();
  const P = pdoc.exists ? pdoc.data() : null;
  let tokens = (P && P.tokens || []).filter(Boolean);
  if (!tokens.length) return;

  const lref = meta.doc('pushlog');
  const ldoc = await lref.get();
  let L = ldoc.exists ? ldoc.data() : {};
  if (L.day !== TODAY) L = { day: TODAY, morning: false, evening: false, ev: {} };
  L.ev = L.ev || {};

  const S = {};
  for (const c of ['events','todos','routines','annual']) S[c] = await loadCol(uid, c);

  const out = [];
  const mm = toMin(P.morning || '09:00'), em = toMin(P.evening || '21:00');

  // 1) 아침 요약 (9시~12시 사이 첫 실행 때 한 번)
  if (!L.morning && NOWJ.min >= mm && NOWJ.min < mm + 180) {
    L.morning = true;
    const it = dayItems(S, TODAY, true), lines = summary(it, TODAY);
    const p = parse(TODAY);
    out.push({ title: `좋은 아침! 오늘 ${p.m}/${p.d}(${WD[dow(p.y,p.m,p.d)]})`, body: lines.length ? lines.join('\n') : '오늘은 등록된 일정이 없어요. 여유로운 하루 보내요 🌱', tag: 'morning', ttl: 3*3600 });
  }

  // 2) 일정 시작 30분 전 (시간이 있는 일정)
  S.events.filter(e => e.time && eventOn(e, TODAY)).forEach(e => {
    const left = toMin(e.time) - NOWJ.min, key = e.id + '@' + e.time;
    if (left > 40 || left < -5 || L.ev[key]) return;
    L.ev[key] = true;
    out.push({ title: left > 2 ? `${left}분 뒤 · ${e.time}` : `지금 시작 · ${e.time}`, body: e.title || '일정', tag: 'ev-' + e.id, ttl: 1800 });
  });

  // 3) 저녁 내일 미리보기 (21시~24시, 내일 뭔가 있을 때만)
  if (!L.evening && NOWJ.min >= em) {
    L.evening = true;
    const it = dayItems(S, TOMORROW, false), lines = summary(it, TOMORROW);
    const p = parse(TOMORROW);
    if (lines.length) out.push({ title: `내일 ${p.m}/${p.d}(${WD[dow(p.y,p.m,p.d)]}) 미리보기`, body: lines.join('\n'), tag: 'evening', ttl: 6*3600 });
  }

  let bad = [];
  for (const m of out) { bad = bad.concat(await send(uid, tokens, m)); tokens = tokens.filter(t => bad.indexOf(t) < 0); if (!tokens.length) break; }
  if (bad.length && !DRY) await meta.doc('push').set({ tokens: admin.firestore.FieldValue.arrayRemove(...bad) }, { merge: true });
  if (!DRY) await lref.set(L);
  console.log(uid.slice(0,6), '보낸 알림', out.length);
}

const users = await db.collection('users').listDocuments();
for (const u of users) { try { await runUser(u.id); } catch (e) { console.log('오류', u.id.slice(0,6), e.message); } }
console.log('끝', TODAY, Math.floor(NOWJ.min/60) + ':' + pad(NOWJ.min%60));
