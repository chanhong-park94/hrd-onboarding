/**
 * 운영진 온보딩 챌린지 - 진도 저장용 Apps Script
 * 이 스크립트는 연결된 구글 시트 한 개만 읽고 씁니다.
 * @OnlyCurrentDoc
 *
 * 설정: 프로젝트 설정(톱니바퀴) > 스크립트 속성에 아래 두 값을 추가합니다.
 *   ACCESS_CODE  운영진 공용 접속 코드
 *   ADMIN_CODE   관리자 화면 코드 (접속 코드와 다르게)
 */

var SHEET_NAME = '진도';
var HEAD = ['이름', 'PIN 확인값', '레벨', '경험치', '통과 단계',
  '01 관계기관', '02 개강 전', '03 출결', '04 변경·제적', '05 청구', '06 수료·취업', '07 평가·심사', '08 부정훈련',
  '최종 심사 최고점', '최종 합격', '합격일', '배지', '오답 노트', '마지막 학습', '진도 데이터'];

function doGet() {
  return out_({ok: true, service: 'onboarding', message: '정상 작동 중입니다.'});
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out_({ok: false, error: 'bad_json'});
  }
  try {
    return out_(handle_(body));
  } catch (err) {
    return out_({ok: false, error: 'server_error', detail: String(err)});
  }
}

function handle_(p) {
  var props = PropertiesService.getScriptProperties();
  var ACCESS = props.getProperty('ACCESS_CODE');
  var ADMIN = props.getProperty('ADMIN_CODE');
  if (!ACCESS || !ADMIN) return {ok: false, error: 'not_configured'};

  var action = String(p.action || '');
  var code = String(p.code || '');

  if (action === 'admin') {
    if (code !== ADMIN) return {ok: false, error: 'bad_admin_code'};
    return {ok: true, rows: readAll_()};
  }

  if (code !== ACCESS) return {ok: false, error: 'bad_code'};
  var name = cleanName_(p.name);
  var pin = String(p.pin || '');
  if (!name) return {ok: false, error: 'no_name'};
  if (!/^\d{4}$/.test(pin)) return {ok: false, error: 'bad_pin_format'};

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    var row = findRow_(sh, name);
    var hash = hash_(name, pin);

    if (action === 'login') {
      if (row < 0) {
        var blank = [];
        for (var i = 2; i < HEAD.length; i++) blank.push('');
        sh.appendRow([name, hash].concat(blank));
        return {ok: true, isNew: true, progress: null};
      }
      var vals = sh.getRange(row, 1, 1, HEAD.length).getValues()[0];
      if (vals[1] && vals[1] !== hash) return {ok: false, error: 'bad_pin'};
      if (!vals[1]) sh.getRange(row, 2).setValue(hash); // 관리자가 PIN을 지운 경우 새 PIN 등록
      var prog = null;
      try { prog = JSON.parse(vals[HEAD.length - 1] || 'null'); } catch (err) { prog = null; }
      return {ok: true, isNew: false, progress: prog};
    }

    if (action === 'save') {
      if (row < 0) return {ok: false, error: 'no_user'};
      var cur = sh.getRange(row, 2).getValue();
      if (cur && cur !== hash) return {ok: false, error: 'bad_pin'};
      var s = p.summary || {};
      var best = (s.best || []).slice(0, 8);
      while (best.length < 8) best.push('');
      var line = [name, hash, String(s.level || ''), num_(s.xp), num_(s.cleared)]
        .concat(best.map(function (b) { return b === '' ? '' : num_(b); }))
        .concat([num_(s.finalBest), s.finalPassed ? '합격' : '', String(s.finalDate || ''),
                 num_(s.badges), num_(s.wrong), new Date(), JSON.stringify(p.progress || {})]);
      sh.getRange(row, 1, 1, HEAD.length).setValues([line]);
      return {ok: true};
    }

    return {ok: false, error: 'bad_action'};
  } finally {
    lock.releaseLock();
  }
}

function readAll_() {
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, HEAD.length).getValues();
  return vals.filter(function (v) { return v[0]; }).map(function (v) {
    return {
      name: v[0], level: v[2], xp: v[3] || 0, cleared: v[4] || 0,
      best: v.slice(5, 13).map(function (b) { return b === '' ? 0 : b; }),
      finalBest: v[13] || 0, finalPassed: v[14] === '합격', finalDate: v[15],
      badges: v[16] || 0, wrong: v[17] || 0,
      last: v[18] instanceof Date ? v[18].toISOString() : String(v[18] || '')
    };
  });
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(2);               // PIN 확인값
    sh.hideColumns(HEAD.length);     // 진도 데이터(JSON)
  }
  return sh;
}

function findRow_(sh, name) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  var names = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < names.length; i++) if (String(names[i][0]) === name) return i + 2;
  return -1;
}

function cleanName_(v) {
  // 앞뒤 공백 정리, 수식으로 해석될 수 있는 첫 글자 제거, 20자 제한
  return String(v || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, 20);
}

function hash_(name, pin) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('SALT', salt); }
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, name + ':' + pin + ':' + salt, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
