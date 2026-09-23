/**
 * 운영진 온보딩 챌린지 - 서버(구글 Apps Script)
 * 연결된 구글 시트 한 개만 읽고 씁니다.
 * @OnlyCurrentDoc
 *
 * 설정: 프로젝트 설정(톱니바퀴) > 스크립트 속성에 두 값을 추가합니다.
 *   ACCESS_CODE  운영진 공용 접속 코드
 *   ADMIN_CODE   관리자 화면 코드(접속 코드와 다르게)
 *
 * 시트는 처음 요청 때 자동으로 만들어집니다: 운영진, 진도, 기수, 공지
 */

var ROSTER = '운영진', PROGRESS = '진도', COHORT = '기수', NOTICE = '공지';
var HEAD = {};
HEAD[ROSTER] = ['이름', '기수', '상태', '등록일', '메모'];
HEAD[PROGRESS] = ['이름', 'PIN 확인값', '레벨', '경험치', '통과 단계',
  '01 관계기관', '02 개강 전', '03 출결', '04 변경·제적', '05 청구', '06 수료·취업', '07 평가·심사', '08 부정훈련',
  '최종 심사 최고점', '최종 합격', '합격일', '배지', '오답 노트', '첫 입장', '마지막 학습', '진도 데이터'];
HEAD[COHORT] = ['기수', '시작일', '마감일', '메모'];
HEAD[NOTICE] = ['ID', '작성일', '제목', '내용', '중요', '게시'];
var TEXT_COLS = {}; // 날짜가 자동 변환되지 않도록 텍스트 서식을 줄 열(1부터)
TEXT_COLS[ROSTER] = [4];
TEXT_COLS[COHORT] = [2, 3];
TEXT_COLS[NOTICE] = [1, 2];
var P = {PIN: 1, FIRST: 18, LAST: 19, JSON: 20}; // 진도 시트 열 위치(0부터)
var ACTIVE = '재직', LEFT = '퇴사';

// 연결 확인용: 코드 값은 알려 주지 않고, 시트 연결 여부와 코드 설정 여부만 답합니다.
function doGet() {
  var props = PropertiesService.getScriptProperties();
  return out_({ok: true, service: 'onboarding', message: '정상 작동 중입니다.',
    bound: !!SpreadsheetApp.getActiveSpreadsheet(),
    configured: !!(props.getProperty('ACCESS_CODE') && props.getProperty('ADMIN_CODE'))});
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ok: false, error: 'bad_json'}); }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    return out_(handle_(body));
  } catch (err) {
    return out_({ok: false, error: 'server_error', detail: String(err)});
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function handle_(p) {
  if (!SpreadsheetApp.getActiveSpreadsheet()) return {ok: false, error: 'not_bound'};
  var props = PropertiesService.getScriptProperties();
  var ACCESS = props.getProperty('ACCESS_CODE'), ADMIN = props.getProperty('ADMIN_CODE');
  if (!ACCESS || !ADMIN) return {ok: false, error: 'not_configured'};
  var action = String(p.action || ''), code = String(p.code || '');

  if (action.indexOf('admin') === 0 || ADMIN_ACTIONS[action]) {
    if (code !== ADMIN) return {ok: false, error: 'bad_admin_code'};
    if (action === 'admin') return adminData_();
    return ADMIN_ACTIONS[action] ? ADMIN_ACTIONS[action](p) : {ok: false, error: 'bad_action'};
  }

  if (code !== ACCESS) return {ok: false, error: 'bad_code'};
  var name = clean_(p.name, 20), pin = String(p.pin || '');
  if (!name) return {ok: false, error: 'no_name'};
  if (!/^\d{4}$/.test(pin)) return {ok: false, error: 'bad_pin_format'};
  if (action === 'login') return login_(name, pin, p.resume === true);
  if (action === 'save') return save_(name, pin, p);
  return {ok: false, error: 'bad_action'};
}

/* ---------- 운영진(학습자) ---------- */
// resume: 저장된 세션으로 자동 재확인하는 요청. 이때는 PIN을 새로 정하지 않습니다.
function login_(name, pin, resume) {
  var roster = sheet_(ROSTER), r = findRow_(roster, name);
  if (r < 0) {
    if (rosterRequired_()) return {ok: false, error: 'not_in_roster'};
    roster.appendRow([name, '', ACTIVE, today_(), '']);
    r = findRow_(roster, name);
  }
  var person = roster.getRange(r, 1, 1, HEAD[ROSTER].length).getValues()[0];
  if (String(person[2]) === LEFT) return {ok: false, error: 'inactive'};

  var sh = sheet_(PROGRESS), row = findRow_(sh, name), hash = hash_(name, pin), isNew = false, prog = null;
  if (row < 0) {
    if (resume) return {ok: false, error: 'no_user'};
    var line = [name, hash, '', 0, 0, '', '', '', '', '', '', '', '', 0, '', '', 0, 0, new Date(), '', '{}'];
    sh.appendRow(line);
    isNew = true;
  } else {
    var vals = sh.getRange(row, 1, 1, HEAD[PROGRESS].length).getValues()[0];
    if (vals[P.PIN] && vals[P.PIN] !== hash) return {ok: false, error: 'bad_pin'};
    if (!vals[P.PIN]) {
      if (resume) return {ok: false, error: 'pin_reset'}; // 관리자가 PIN을 초기화함: 직접 다시 입장해야 함
      sh.getRange(row, P.PIN + 1).setValue(hash);
    }
    try { prog = JSON.parse(vals[P.JSON] || 'null'); } catch (err) { prog = null; }
  }
  return {ok: true, isNew: isNew, progress: prog, profile: profile_(String(person[1] || '')), notices: notices_(false)};
}

function save_(name, pin, p) {
  var roster = sheet_(ROSTER), r = findRow_(roster, name);
  if (r < 0 && rosterRequired_()) return {ok: false, error: 'not_in_roster'};
  if (r > 0 && String(roster.getRange(r, 3).getValue()) === LEFT) return {ok: false, error: 'inactive'};
  var sh = sheet_(PROGRESS), row = findRow_(sh, name);
  if (row < 0) return {ok: false, error: 'no_user'};
  var cur = sh.getRange(row, 1, 1, HEAD[PROGRESS].length).getValues()[0];
  var hash = hash_(name, pin);
  if (!cur[P.PIN]) return {ok: false, error: 'pin_reset'};
  if (cur[P.PIN] !== hash) return {ok: false, error: 'bad_pin'};
  var s = p.summary || {}, best = (s.best || []).slice(0, 8);
  while (best.length < 8) best.push(0);
  var line = [name, hash, clean_(s.level, 30), num_(s.xp), num_(s.cleared)]
    .concat(best.map(num_))
    .concat([num_(s.finalBest), s.finalPassed ? '합격' : '', clean_(s.finalDate, 20), num_(s.badges), num_(s.wrong),
             cur[P.FIRST] || new Date(), new Date(), JSON.stringify(p.progress || {})]);
  sh.getRange(row, 1, 1, line.length).setValues([line]);
  return {ok: true};
}

function profile_(cohortName) {
  if (!cohortName) return {cohort: '', start: '', due: ''};
  var c = rows_(COHORT).filter(function (v) { return String(v[0]) === cohortName; })[0];
  return {cohort: cohortName, start: c ? dateStr_(c[1]) : '', due: c ? dateStr_(c[2]) : ''};
}

function notices_(all) {
  return rows_(NOTICE).filter(function (v) { return v[0] && (all || v[5] === 'Y'); }).map(function (v) {
    return {id: String(v[0]), date: dateStr_(v[1]), title: String(v[2]), body: String(v[3]), important: v[4] === 'Y', visible: v[5] === 'Y'};
  }).sort(function (a, b) {
    if (a.important !== b.important) return a.important ? -1 : 1;
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

/* ---------- 관리자 ---------- */
function adminData_() {
  var progress = rows_(PROGRESS).filter(function (v) { return v[0]; }).map(function (v) {
    return {name: String(v[0]), hasPin: !!v[P.PIN], level: String(v[2] || ''), xp: num_(v[3]), cleared: num_(v[4]),
      best: v.slice(5, 13).map(num_), finalBest: num_(v[13]), finalPassed: v[14] === '합격', finalDate: String(v[15] || ''),
      badges: num_(v[16]), wrong: num_(v[17]), first: iso_(v[P.FIRST]), last: iso_(v[P.LAST])};
  });
  var roster = rows_(ROSTER).filter(function (v) { return v[0]; }).map(function (v) {
    return {name: String(v[0]), cohort: String(v[1] || ''), status: String(v[2] || ACTIVE), registered: dateStr_(v[3]), memo: String(v[4] || '')};
  });
  var cohorts = rows_(COHORT).filter(function (v) { return v[0]; }).map(function (v) {
    return {name: String(v[0]), start: dateStr_(v[1]), due: dateStr_(v[2]), memo: String(v[3] || '')};
  });
  return {ok: true, settings: {rosterRequired: rosterRequired_()}, roster: roster, cohorts: cohorts,
          notices: notices_(true), progress: progress, today: today_()};
}

var ADMIN_ACTIONS = {
  roster_add: function (p) {
    var sh = sheet_(ROSTER), cohort = clean_(p.cohort, 30), memo = clean_(p.memo, 100);
    var names = (p.names || [p.name]).map(function (n) { return clean_(n, 20); }).filter(String);
    if (!names.length) return {ok: false, error: 'no_name'};
    var added = [], skipped = [];
    names.forEach(function (n) {
      if (findRow_(sh, n) > 0 || added.indexOf(n) >= 0) { skipped.push(n); return; }
      sh.appendRow([n, cohort, ACTIVE, today_(), memo]); added.push(n);
    });
    return {ok: true, added: added, skipped: skipped};
  },
  roster_update: function (p) {
    var sh = sheet_(ROSTER), r = findRow_(sh, clean_(p.name, 20));
    if (r < 0) return {ok: false, error: 'not_found'};
    if (p.cohort !== undefined) sh.getRange(r, 2).setValue(clean_(p.cohort, 30));
    if (p.status === ACTIVE || p.status === LEFT) sh.getRange(r, 3).setValue(p.status);
    if (p.memo !== undefined) sh.getRange(r, 5).setValue(clean_(p.memo, 100));
    return {ok: true};
  },
  pin_reset: function (p) {
    var sh = sheet_(PROGRESS), r = findRow_(sh, clean_(p.name, 20));
    if (r < 0) return {ok: false, error: 'not_found'};
    sh.getRange(r, P.PIN + 1).setValue('');
    return {ok: true};
  },
  cohort_save: function (p) {
    var name = clean_(p.name, 30), original = clean_(p.original, 30), start = String(p.start || ''), due = String(p.due || '');
    if (!name) return {ok: false, error: 'no_name'};
    if (!isDate_(start) || !isDate_(due)) return {ok: false, error: 'bad_date'};
    if (due < start) return {ok: false, error: 'bad_range'};
    var sh = sheet_(COHORT), r = original ? findRow_(sh, original) : -1, existing = findRow_(sh, name);
    if (existing > 0 && existing !== r) return {ok: false, error: 'exists'};
    var line = [name, start, due, clean_(p.memo, 100)];
    if (r > 0) sh.getRange(r, 1, 1, 4).setValues([line]); else sh.appendRow(line);
    if (original && original !== name) renameCohort_(original, name);
    return {ok: true};
  },
  cohort_delete: function (p) {
    var name = clean_(p.name, 30), sh = sheet_(COHORT), r = findRow_(sh, name);
    if (r > 0) sh.deleteRow(r);
    renameCohort_(name, '');
    return {ok: true};
  },
  notice_save: function (p) {
    var title = clean_(p.title, 60), body = clean_(p.body, 1000);
    if (!title) return {ok: false, error: 'no_title'};
    var sh = sheet_(NOTICE), id = String(p.id || ''), r = id ? findRow_(sh, id) : -1;
    var flags = [p.important ? 'Y' : 'N', p.visible === false ? 'N' : 'Y'];
    if (r > 0) sh.getRange(r, 3, 1, 4).setValues([[title, body].concat(flags)]);
    else sh.appendRow(['n' + new Date().getTime(), today_(), title, body].concat(flags));
    return {ok: true};
  },
  notice_delete: function (p) {
    var sh = sheet_(NOTICE), r = findRow_(sh, String(p.id || ''));
    if (r > 0) sh.deleteRow(r);
    return {ok: true};
  },
  settings_save: function (p) {
    PropertiesService.getScriptProperties().setProperty('ROSTER_REQUIRED', p.rosterRequired === false ? 'false' : 'true');
    return {ok: true};
  }
};

function renameCohort_(from, to) {
  var sh = sheet_(ROSTER), vals = rows_(ROSTER);
  for (var i = 0; i < vals.length; i++) if (String(vals[i][1]) === from) sh.getRange(i + 2, 2).setValue(to);
}

/* ---------- 시트 도우미 ---------- */
function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
    if (name === PROGRESS) { sh.hideColumns(P.PIN + 1); sh.hideColumns(P.JSON + 1); }
  }
  return sh;
}
function rows_(name) {
  var sh = sheet_(name), n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, HEAD[name].length).getValues();
}
function findRow_(sh, key) {
  var n = sh.getLastRow() - 1;
  if (n < 1 || !key) return -1;
  var keys = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) return i + 2;
  return -1;
}
function rosterRequired_() {
  return PropertiesService.getScriptProperties().getProperty('ROSTER_REQUIRED') !== 'false';
}
function clean_(v, max) {
  // 공백 정리, 수식으로 해석될 수 있는 첫 글자 제거, 길이 제한
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, max || 100);
}
function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Seoul'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function dateStr_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd') : String(v || ''); }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function hash_(name, pin) {
  var props = PropertiesService.getScriptProperties(), salt = props.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('SALT', salt); }
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, name + ':' + pin + ':' + salt, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
