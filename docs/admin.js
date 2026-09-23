/*
 * 관리자 화면: 대시보드, 운영진 명단, 기수·일정, 공지사항
 * 관리자 코드는 이 브라우저 탭을 닫으면 잊습니다(sessionStorage).
 */
const ORG = Object.assign({ORG_NAME:"", ORG_LOGO:"", API_URL:""}, window.ORG_CONFIG || {});
const ADMIN_KEY = "hrd-gyeoljae-admin";
const TABS = ["dash", "roster", "cohort", "notice"];
let CODE = "", DATA = null, TAB = "dash", BUSY = false;
const AERR = {
  bad_admin_code: "관리자 코드가 맞지 않습니다.",
  not_configured: "Apps Script의 스크립트 속성(ACCESS_CODE, ADMIN_CODE)을 먼저 설정하세요.",
  exists: "같은 이름이 이미 있습니다.",
  bad_date: "날짜를 모두 입력하세요.",
  bad_range: "마감일이 시작일보다 빠릅니다.",
  no_title: "제목을 입력하세요.",
  no_name: "이름을 입력하세요.",
  not_found: "대상을 찾지 못했습니다. 새로고침 후 다시 시도하세요.",
  network: "서버에 연결하지 못했습니다. 인터넷 연결과 config.js의 API_URL을 확인하세요."
};

/* ---------- helpers ---------- */
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
function el(tag, attrs, html){
  const n = document.createElement(tag);
  if(attrs) for(const k in attrs){ if(k === "class") n.className = attrs[k]; else if(k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); }
  if(html !== undefined) n.innerHTML = html;
  return n;
}
let toastTimer;
function toast(msg){ const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800); }
function ymd(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtYmd(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? m[1] + "." + Number(m[2]) + "." + Number(m[3]) + "." : (s || "-"); }
function hhmm(d){ return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function fmtTime(iso){ const d = new Date(iso); if(!iso || isNaN(d)) return "-"; return (d.getMonth() + 1) + "." + d.getDate() + ". " + hhmm(d); }
function daysUntil(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if(!m) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - t) / 86400000);
}
function dday(n){ return n === null ? "" : n > 0 ? "D-" + n : n === 0 ? "D-day" : "D+" + (-n); }
async function api(body){
  const res = await fetch(ORG.API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), redirect:"follow"});
  if(!res.ok) throw new Error("http_" + res.status);
  return res.json();
}
// 변경 요청: 성공하면 데이터를 다시 불러와 화면을 그립니다
async function act(action, payload, okMsg){
  if(BUSY) return false;
  BUSY = true; document.body.style.cursor = "progress";
  try{
    const r = await api(Object.assign({action, code:CODE}, payload));
    if(!r.ok){ toast(AERR[r.error] || ("처리하지 못했습니다(" + r.error + ").")); return false; }
    if(okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
    await load(true);
    return r;
  }catch(e){ toast(AERR.network); return false; }
  finally{ BUSY = false; document.body.style.cursor = ""; }
}
const app = () => document.getElementById("adminApp");

/* ---------- people: roster + progress joined ---------- */
function people(){
  const prog = {}; (DATA.progress || []).forEach(p => { prog[p.name] = p; });
  const coh = {}; (DATA.cohorts || []).forEach(c => { coh[c.name] = c; });
  const names = new Set((DATA.roster || []).map(r => r.name));
  const list = (DATA.roster || []).map(r => ({name:r.name, cohort:r.cohort, status:r.status, memo:r.memo, registered:r.registered, inRoster:true}));
  (DATA.progress || []).forEach(p => { if(!names.has(p.name)) list.push({name:p.name, cohort:"", status:"재직", memo:"", registered:"", inRoster:false}); });
  return list.map(x => {
    const p = prog[x.name] || null, c = coh[x.cohort] || null;
    const done = !!(p && p.cleared >= 8 && p.finalPassed), n = c ? daysUntil(c.due) : null;
    let state = "active";
    if(x.status === "퇴사") state = "left";
    else if(done) state = "done";
    else if(n !== null && n < 0) state = "late";
    else if(!p || (!p.xp && !p.cleared)) state = "idle";
    return Object.assign(x, {p, c, done, n, state});
  });
}
const STATE = {late:["마감 지남", "bad", 0], active:["진행 중", "", 1], idle:["미시작", "off", 2], done:["완료", "ok", 3], left:["퇴사", "off", 4]};
function pill(state){ const s = STATE[state]; return `<span class="pill ${s[1]}">${s[0]}</span>`; }

/* ---------- gate ---------- */
function renderGate(msg){
  document.getElementById("adminTop").hidden = true; app().innerHTML = "";
  const g = document.getElementById("adminGate"); g.hidden = false; g.innerHTML = "";
  const card = el("div", {class:"sheet gate-card"});
  card.innerHTML = `<span class="gate-seal">관리</span>
    <p class="eyebrow">${esc(ORG.ORG_NAME ? ORG.ORG_NAME + " · " : "")}운영진 온보딩</p>
    <h1>관리자 화면</h1>
    <p class="muted">운영진 명단, 기수·마감일, 공지사항을 관리하고 진도를 봅니다.</p>
    ${ORG.API_URL ? "" : `<p class="gate-note">config.js에 API_URL이 비어 있습니다. 구글 시트 연결(README 1~3단계)을 먼저 끝내야 관리자 화면을 쓸 수 있습니다.</p>`}
    <form id="aForm" class="gate-form" novalidate>
      <div class="field"><label for="aCode">관리자 코드</label><input id="aCode" type="password" autocomplete="off"${ORG.API_URL ? "" : " disabled"}></div>
      <p class="gate-msg" id="aMsg" role="alert"></p>
      <button class="btn" type="submit" id="aBtn"${ORG.API_URL ? "" : " disabled"}>들어가기</button>
    </form>
    <div class="gate-foot"><a class="linkbtn" href="./">운영진 화면으로</a></div>`;
  g.appendChild(card);
  const m = card.querySelector("#aMsg"); if(msg) m.textContent = msg;
  card.querySelector("#aForm").onsubmit = async ev => {
    ev.preventDefault();
    const code = card.querySelector("#aCode").value.trim(); if(!code) return;
    const btn = card.querySelector("#aBtn"); btn.disabled = true; btn.textContent = "확인 중…"; m.textContent = "";
    CODE = code;
    const ok = await load(false, t => { m.textContent = t; });
    btn.disabled = false; btn.textContent = "들어가기";
    if(ok){ try{ sessionStorage.setItem(ADMIN_KEY, code); }catch(e){} }
  };
  if(ORG.API_URL) card.querySelector("#aCode").focus();
}
async function load(keepTab, onError){
  try{
    const r = await api({action:"admin", code:CODE});
    if(!r.ok){
      const t = AERR[r.error] || ("불러오지 못했습니다(" + r.error + ").");
      if(onError) onError(t); else renderGate(t);
      return false;
    }
    DATA = r;
    document.getElementById("adminSync").textContent = "불러옴 " + hhmm(new Date());
    showAdmin(keepTab ? TAB : (TABS.includes((location.hash || "").slice(1)) ? location.hash.slice(1) : "dash"), keepTab);
    return true;
  }catch(e){
    if(onError) onError(AERR.network); else toast(AERR.network);
    return false;
  }
}
function showAdmin(tab, keepScroll){
  const g = document.getElementById("adminGate"); g.hidden = true; g.innerHTML = "";
  document.getElementById("adminTop").hidden = false;
  TAB = tab;
  try{ history.replaceState(null, "", "#" + tab); }catch(e){}
  document.querySelectorAll("#adminNav button").forEach(b => { if(b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const a = app(); const y = keepScroll ? window.scrollY : 0; a.innerHTML = "";
  const v = el("section", {class:"view admin-shell"}); a.appendChild(v);
  ({dash:tabDash, roster:tabRoster, cohort:tabCohort, notice:tabNotice})[tab](v);
  window.scrollTo({top:y});
}
function head(title, desc, right){
  const h = el("div", {class:"admin-top"}, `<div class="section-head"><p class="eyebrow">${esc(ORG.ORG_NAME ? ORG.ORG_NAME + " · " : "")}관리자</p><h2>${title}</h2>${desc ? `<p class="muted">${desc}</p>` : ""}</div>`);
  if(right) h.appendChild(right);
  return h;
}
function reloadBtn(){ const b = el("button", {class:"btn ghost sm", type:"button"}, "새로고침"); b.onclick = () => load(true); return b; }

/* ---------- 대시보드 ---------- */
let DASH = {cohort:"__all", showLeft:false};
function tabDash(v){
  const all = people(), act = all.filter(x => x.state !== "left");
  v.appendChild(head("대시보드", "완료 조건은 8단계 모두 통과(각 80점 이상)와 최종 심사 합격입니다.", reloadBtn()));
  const cnt = s => act.filter(x => x.state === s).length;
  v.appendChild(el("div", {class:"sheet"}, `<div class="stats">
    <div><b>${act.length}</b><span>재직 인원</span></div>
    <div><b>${cnt("done")}</b><span>온보딩 완료</span></div>
    <div><b>${cnt("active") + cnt("idle")}</b><span>진행 중·미시작</span></div>
    <div><b style="color:${cnt("late") ? "var(--stamp)" : "inherit"}">${cnt("late")}</b><span>마감 지남</span></div></div>`));
  const f = el("div", {class:"filter"});
  const cohorts = [["__all", "전체 기수"]].concat((DATA.cohorts || []).map(c => [c.name, c.name]), [["", "기수 없음"]]);
  f.innerHTML = `<div class="field"><label for="fCoh">기수</label><select id="fCoh">${cohorts.map(c => `<option value="${esc(c[0])}"${c[0] === DASH.cohort ? " selected" : ""}>${esc(c[1])}</option>`).join("")}</select></div>
    <label class="check" style="align-self:flex-end;padding-bottom:10px"><input type="checkbox" id="fLeft"${DASH.showLeft ? " checked" : ""}>퇴사자도 보기</label>`;
  v.appendChild(f);
  f.querySelector("#fCoh").onchange = e => { DASH.cohort = e.target.value; showAdmin("dash", true); };
  f.querySelector("#fLeft").onchange = e => { DASH.showLeft = e.target.checked; showAdmin("dash", true); };
  const rows = all.filter(x => (DASH.showLeft || x.state !== "left") && (DASH.cohort === "__all" || x.cohort === DASH.cohort))
    .sort((a, b) => (STATE[a.state][2] - STATE[b.state][2]) || ((b.p ? b.p.cleared : 0) - (a.p ? a.p.cleared : 0)) || a.name.localeCompare(b.name, "ko"));
  const wrap = el("div", {class:"tablewrap"});
  wrap.innerHTML = `<table class="adt"><thead><tr><th>이름</th><th>기수·마감</th><th>상태</th>${CURR.map(m => `<th title="${esc(m.title)}">${m.no}</th>`).join("")}<th>최종 심사</th><th>레벨</th><th>마지막 학습</th></tr></thead><tbody></tbody></table>`;
  const tb = wrap.querySelector("tbody");
  if(!rows.length) tb.innerHTML = `<tr><td colspan="${CURR.length + 6}" class="empty">표시할 운영진이 없습니다. 운영진 명단에서 먼저 등록하세요.</td></tr>`;
  rows.forEach(x => {
    const tr = el("tr", {class:x.state === "left" ? "left" : ""});
    const best = x.p ? x.p.best : [];
    tr.innerHTML = `<td class="nm"></td><td><span class="coh"></span>${x.c ? `<br><small class="muted mono">${fmtYmd(x.c.due)} ${x.done ? "" : dday(x.n)}</small>` : ""}</td><td>${pill(x.state)}</td>` +
      CURR.map((m, i) => { const s = Number(best[i]) || 0; return `<td class="sc ${s >= 80 ? "ok" : s > 0 ? "mid" : ""}">${s || "·"}</td>`; }).join("") +
      `<td>${x.p && x.p.finalPassed ? `<b class="pass">합격</b> <span class="mono">${x.p.finalBest}</span>` : x.p && x.p.finalBest ? `<span class="mono">${x.p.finalBest}점</span>` : "-"}</td>
       <td><span class="lv"></span></td><td class="mono">${x.p ? fmtTime(x.p.last) : "-"}</td>`;
    tr.querySelector(".nm").textContent = x.name + (x.inRoster ? "" : " *");
    tr.querySelector(".coh").textContent = x.cohort || "-";
    tr.querySelector(".lv").textContent = x.p ? (x.p.level || "-") : "-";
    tb.appendChild(tr);
  });
  v.appendChild(wrap);
  v.appendChild(el("p", {class:"note"}, "칸의 숫자는 단계별 최고 점수입니다(80점 이상 통과). 이름 옆 *는 명단에 없이 들어온 사람입니다(명단 제한을 끈 경우). 원본은 구글 시트에 있습니다."));
}

/* ---------- 운영진 명단 ---------- */
let ROSTER_Q = "";
function cohortOptions(sel){ return (DATA.cohorts || []).map(c => `<option value="${esc(c.name)}"${c.name === sel ? " selected" : ""}>${esc(c.name)}</option>`).join(""); }
function tabRoster(v){
  v.appendChild(head("운영진 명단", "이름은 운영진이 입장할 때 쓰는 이름과 똑같아야 합니다. 퇴사 처리하면 입장이 막히고 기록은 남습니다.", reloadBtn()));
  const set = el("div", {class:"sheet pad", style:"display:grid;gap:6px"});
  set.innerHTML = `<label class="check"><input type="checkbox" id="rReq"${DATA.settings && DATA.settings.rosterRequired ? " checked" : ""}><b>명단에 등록된 사람만 입장</b></label>
    <p class="note">끄면 접속 코드만 알면 누구나 새 이름으로 들어올 수 있고, 들어온 사람은 명단에 자동으로 추가됩니다.</p>`;
  set.querySelector("#rReq").onchange = e => act("settings_save", {rosterRequired:e.target.checked}, e.target.checked ? "명단 제한을 켰습니다." : "명단 제한을 껐습니다.");
  v.appendChild(set);

  const form = el("form", {class:"sheet pad", novalidate:""});
  form.innerHTML = `<h3>운영진 등록</h3><div class="form-grid" style="margin-top:10px">
      <div class="field" style="grid-column:1/-1"><label for="rNames">이름(한 줄에 한 명씩, 여러 명 가능)</label><textarea id="rNames" placeholder="홍길동&#10;김운영"></textarea></div>
      <div class="field"><label for="rCoh">기수</label><select id="rCoh"><option value="">기수 없음</option>${cohortOptions("")}</select></div>
      <div class="field"><label for="rMemo">메모(선택)</label><input id="rMemo" maxlength="100" placeholder="예: 행정팀"></div>
      <button class="btn" type="submit">등록</button></div>`;
  form.onsubmit = async ev => {
    ev.preventDefault();
    const names = form.querySelector("#rNames").value.split(/\n/).map(s => s.trim()).filter(Boolean);
    if(!names.length){ toast("이름을 입력하세요."); return; }
    await act("roster_add", {names, cohort:form.querySelector("#rCoh").value, memo:form.querySelector("#rMemo").value},
      r => r.added.length + "명 등록" + (r.skipped.length ? " · 이미 있는 " + r.skipped.length + "명은 건너뜀" : ""));
  };
  v.appendChild(form);

  const pins = {}; (DATA.progress || []).forEach(p => { pins[p.name] = p.hasPin; });
  const search = el("div", {class:"filter"}, `<div class="field"><label for="rQ">이름 찾기</label><input id="rQ" value="${esc(ROSTER_Q)}" autocomplete="off"></div><span class="note" style="align-self:flex-end;padding-bottom:10px">${(DATA.roster || []).filter(r => r.status !== "퇴사").length}명 재직 · ${(DATA.roster || []).filter(r => r.status === "퇴사").length}명 퇴사</span>`);
  v.appendChild(search);
  const wrap = el("div", {class:"tablewrap"});
  wrap.innerHTML = `<table class="adt"><thead><tr><th>이름</th><th>기수</th><th>상태</th><th>PIN</th><th>등록일</th><th>메모</th><th>관리</th></tr></thead><tbody></tbody></table>`;
  v.appendChild(wrap);
  const tb = wrap.querySelector("tbody");
  const draw = () => {
    tb.innerHTML = "";
    const list = (DATA.roster || []).filter(r => !ROSTER_Q || r.name.includes(ROSTER_Q)).sort((a, b) => (a.status === "퇴사") - (b.status === "퇴사") || a.name.localeCompare(b.name, "ko"));
    if(!list.length){ tb.innerHTML = `<tr><td colspan="7" class="empty">${(DATA.roster || []).length ? "찾는 이름이 없습니다." : "아직 등록된 운영진이 없습니다. 위에서 이름을 등록하세요."}</td></tr>`; return; }
    list.forEach(r => {
      const left = r.status === "퇴사", tr = el("tr", {class:left ? "left" : ""});
      tr.innerHTML = `<td class="nm"></td><td><select aria-label="기수"><option value="">기수 없음</option>${cohortOptions(r.cohort)}</select></td>
        <td>${left ? '<span class="pill off">퇴사</span>' : '<span class="pill ok">재직</span>'}</td>
        <td>${pins[r.name] ? '<span class="pill">설정됨</span>' : '<span class="pill off">없음</span>'}</td>
        <td class="mono">${fmtYmd(r.registered)}</td><td><input class="memo" aria-label="메모" maxlength="100" style="font:inherit;font-size:13px;padding:4px 6px;border:1px solid var(--rule);border-radius:6px;background:var(--sheet);color:var(--ink);width:140px"></td>
        <td></td>`;
      tr.querySelector(".nm").textContent = r.name;
      const memo = tr.querySelector(".memo"); memo.value = r.memo || "";
      memo.onchange = () => act("roster_update", {name:r.name, memo:memo.value}, "메모를 저장했습니다.");
      tr.querySelector("select").onchange = e => act("roster_update", {name:r.name, cohort:e.target.value}, r.name + "님 기수를 바꿨습니다.");
      const cell = tr.lastElementChild;
      const st = el("button", {class:"btn ghost sm", type:"button"}, left ? "복직" : "퇴사 처리");
      st.onclick = () => {
        if(!left && !confirm(r.name + "님을 퇴사 처리할까요? 입장이 막히고 학습 기록은 남습니다.")) return;
        act("roster_update", {name:r.name, status:left ? "재직" : "퇴사"}, left ? r.name + "님을 복직 처리했습니다." : r.name + "님을 퇴사 처리했습니다.");
      };
      cell.appendChild(st);
      if(pins[r.name]){
        const pb = el("button", {class:"btn ghost sm", type:"button"}, "PIN 초기화");
        pb.onclick = () => { if(confirm(r.name + "님의 PIN을 초기화할까요? 다음 입장 때 새 PIN을 정합니다.")) act("pin_reset", {name:r.name}, "PIN을 초기화했습니다."); };
        cell.appendChild(pb);
      }
      tb.appendChild(tr);
    });
  };
  search.querySelector("#rQ").oninput = e => { ROSTER_Q = e.target.value.trim(); draw(); };
  draw();
}

/* ---------- 기수·일정 ---------- */
let COH_EDIT = "";
function tabCohort(v){
  v.appendChild(head("기수·일정", "기수별 온보딩 기간을 정하면 운영진 홈에 마감 D-day가 뜨고, 대시보드에서 마감이 지난 미완료자를 볼 수 있습니다.", reloadBtn()));
  const e = COH_EDIT ? (DATA.cohorts || []).find(c => c.name === COH_EDIT) : null;
  const t = new Date(), t2 = new Date(); t2.setDate(t2.getDate() + 13);
  const form = el("form", {class:"sheet pad", novalidate:""});
  form.innerHTML = `<h3>${e ? "기수 수정" : "새 기수"}</h3><div class="form-grid" style="margin-top:10px">
      <div class="field"><label for="cName">기수 이름</label><input id="cName" maxlength="30" placeholder="예: 2026년 10월 입사"></div>
      <div class="field"><label for="cStart">시작일</label><input id="cStart" type="date"></div>
      <div class="field"><label for="cDue">마감일</label><input id="cDue" type="date"></div>
      <div class="field"><label for="cMemo">메모(선택)</label><input id="cMemo" maxlength="100"></div>
      <div class="row"><button class="btn" type="submit">저장</button>${e ? '<button class="btn ghost" type="button" id="cCancel">취소</button>' : ""}</div></div>
    ${e ? "" : '<p class="note" style="margin-top:8px">권장 기간은 2주입니다(가이드 1주 + 선임과 함께 처리 1주).</p>'}`;
  form.querySelector("#cName").value = e ? e.name : "";
  form.querySelector("#cStart").value = e ? e.start : ymd(t);
  form.querySelector("#cDue").value = e ? e.due : ymd(t2);
  form.querySelector("#cMemo").value = e ? e.memo : "";
  if(e) form.querySelector("#cCancel").onclick = () => { COH_EDIT = ""; showAdmin("cohort", true); };
  form.onsubmit = async ev => {
    ev.preventDefault();
    const name = form.querySelector("#cName").value.trim();
    if(!name){ toast("기수 이름을 입력하세요."); return; }
    const original = COH_EDIT;
    const ok = await act("cohort_save", {original, name, start:form.querySelector("#cStart").value, due:form.querySelector("#cDue").value, memo:form.querySelector("#cMemo").value}, "기수를 저장했습니다.");
    if(ok){ COH_EDIT = ""; showAdmin("cohort", true); }
  };
  v.appendChild(form);

  const all = people();
  const wrap = el("div", {class:"tablewrap"});
  wrap.innerHTML = `<table class="adt"><thead><tr><th>기수</th><th>기간</th><th>마감까지</th><th>인원</th><th>완료</th><th>마감 지남</th><th>관리</th></tr></thead><tbody></tbody></table>`;
  const tb = wrap.querySelector("tbody");
  const list = (DATA.cohorts || []).slice().sort((a, b) => (a.start < b.start ? 1 : -1));
  if(!list.length) tb.innerHTML = `<tr><td colspan="7" class="empty">아직 기수가 없습니다. 위에서 첫 기수를 만드세요.</td></tr>`;
  list.forEach(c => {
    const mem = all.filter(x => x.cohort === c.name && x.state !== "left"), n = daysUntil(c.due);
    const tr = el("tr");
    tr.innerHTML = `<td class="nm"></td><td class="mono">${fmtYmd(c.start)} ~ ${fmtYmd(c.due)}</td><td class="mono">${n === null ? "-" : n < 0 ? "종료" : dday(n)}</td>
      <td class="mono">${mem.length}</td><td class="mono">${mem.filter(x => x.done).length}</td><td class="mono">${mem.filter(x => x.state === "late").length}</td><td></td>`;
    tr.querySelector(".nm").textContent = c.name;
    const cell = tr.lastElementChild;
    const ed = el("button", {class:"btn ghost sm", type:"button"}, "수정"); ed.onclick = () => { COH_EDIT = c.name; showAdmin("cohort"); };
    const del = el("button", {class:"btn ghost sm", type:"button"}, "삭제");
    del.onclick = () => { if(confirm("'" + c.name + "' 기수를 삭제할까요? 배정된 " + mem.length + "명은 '기수 없음'이 됩니다.")) act("cohort_delete", {name:c.name}, "기수를 삭제했습니다."); };
    cell.append(ed, del);
    tb.appendChild(tr);
  });
  v.appendChild(wrap);
}

/* ---------- 공지사항 ---------- */
let NOTICE_EDIT = "";
function tabNotice(v){
  v.appendChild(head("공지사항", "게시 중인 공지는 운영진 홈 맨 위에 보입니다. 중요 공지가 먼저, 그다음 최신순이며 홈에는 3건까지 먼저 보입니다.", reloadBtn()));
  const e = NOTICE_EDIT ? (DATA.notices || []).find(n => n.id === NOTICE_EDIT) : null;
  const form = el("form", {class:"sheet pad", novalidate:""});
  form.innerHTML = `<h3>${e ? "공지 수정" : "새 공지"}</h3><div class="form-grid" style="margin-top:10px">
      <div class="field" style="grid-column:1/-1"><label for="nTitle">제목</label><input id="nTitle" maxlength="60" placeholder="예: 2027년 심사평가 계획 공고 확인"></div>
      <div class="field" style="grid-column:1/-1"><label for="nBody">내용</label><textarea id="nBody" maxlength="1000"></textarea></div>
      <label class="check"><input type="checkbox" id="nImp">중요 공지(맨 위, 빨간 표시)</label>
      <label class="check"><input type="checkbox" id="nVis" checked>바로 게시</label>
      <div class="row"><button class="btn" type="submit">저장</button>${e ? '<button class="btn ghost" type="button" id="nCancel">취소</button>' : ""}</div></div>`;
  if(e){ form.querySelector("#nTitle").value = e.title; form.querySelector("#nBody").value = e.body; form.querySelector("#nImp").checked = e.important; form.querySelector("#nVis").checked = e.visible;
    form.querySelector("#nCancel").onclick = () => { NOTICE_EDIT = ""; showAdmin("notice", true); }; }
  form.onsubmit = async ev => {
    ev.preventDefault();
    const title = form.querySelector("#nTitle").value.trim();
    if(!title){ toast("제목을 입력하세요."); return; }
    const ok = await act("notice_save", {id:NOTICE_EDIT, title, body:form.querySelector("#nBody").value, important:form.querySelector("#nImp").checked, visible:form.querySelector("#nVis").checked}, "공지를 저장했습니다.");
    if(ok){ NOTICE_EDIT = ""; showAdmin("notice", true); }
  };
  v.appendChild(form);

  const wrap = el("div", {class:"tablewrap"});
  wrap.innerHTML = `<table class="adt"><thead><tr><th>제목</th><th>작성일</th><th>구분</th><th>게시</th><th>관리</th></tr></thead><tbody></tbody></table>`;
  const tb = wrap.querySelector("tbody");
  const list = DATA.notices || [];
  if(!list.length) tb.innerHTML = `<tr><td colspan="5" class="empty">아직 공지가 없습니다.</td></tr>`;
  list.forEach(n => {
    const tr = el("tr", {class:n.visible ? "" : "left"});
    tr.innerHTML = `<td class="nm" style="white-space:normal;min-width:220px"></td><td class="mono">${fmtYmd(n.date)}</td><td>${n.important ? '<span class="pill bad">중요</span>' : '<span class="pill">일반</span>'}</td>
      <td>${n.visible ? '<span class="pill ok">게시 중</span>' : '<span class="pill off">숨김</span>'}</td><td></td>`;
    tr.querySelector(".nm").textContent = n.title;
    const cell = tr.lastElementChild;
    const ed = el("button", {class:"btn ghost sm", type:"button"}, "수정"); ed.onclick = () => { NOTICE_EDIT = n.id; showAdmin("notice"); };
    const tg = el("button", {class:"btn ghost sm", type:"button"}, n.visible ? "숨기기" : "게시");
    tg.onclick = () => act("notice_save", {id:n.id, title:n.title, body:n.body, important:n.important, visible:!n.visible}, n.visible ? "공지를 숨겼습니다." : "공지를 게시했습니다.");
    const del = el("button", {class:"btn ghost sm", type:"button"}, "삭제");
    del.onclick = () => { if(confirm("'" + n.title + "' 공지를 삭제할까요?")) act("notice_delete", {id:n.id}, "공지를 삭제했습니다."); };
    cell.append(ed, tg, del);
    tb.appendChild(tr);
  });
  v.appendChild(wrap);
}

/* ---------- boot ---------- */
function boot(){
  document.title = (ORG.ORG_NAME ? ORG.ORG_NAME + " " : "") + "운영진 온보딩 관리자";
  document.getElementById("brandName").textContent = (ORG.ORG_NAME || "운영진 온보딩") + " 관리";
  document.querySelectorAll("#adminNav button").forEach(b => b.onclick = () => showAdmin(b.dataset.tab));
  document.getElementById("adminLogout").onclick = () => { CODE = ""; DATA = null; try{ sessionStorage.removeItem(ADMIN_KEY); }catch(e){} renderGate("로그아웃했습니다."); };
  let saved = ""; try{ saved = sessionStorage.getItem(ADMIN_KEY) || ""; }catch(e){}
  if(saved && ORG.API_URL){ CODE = saved; load(false, t => renderGate(t)); } else renderGate();
}
document.addEventListener("DOMContentLoaded", boot);
