
/* ---------- constants ---------- */
const KEY = "hrd-gyeoljae-v1";
const ORG = Object.assign({ORG_NAME:"", ORG_LOGO:"", API_URL:""}, window.ORG_CONFIG || {});
let USER = null; // {name, code, pin} after login
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
const PASS = 0.8;
const LEVELS = [
  {min:0, name:"수습"},
  {min:120, name:"실시신고 담당"},
  {min:300, name:"출결 지킴이"},
  {min:550, name:"청구 마스터"},
  {min:850, name:"심사평가 대비반"},
  {min:1200, name:"운영 총괄"}
];
const SPECIAL = [
  {id:"sp_streak", name:"연속 승인 10", seal:"연속<br>10", how:"10문항 연속 정답"},
  {id:"sp_speed", name:"스피드 결재왕", seal:"스피드<br>결재", how:"스피드 결재 15개 이상"},
  {id:"sp_wrong", name:"오답 정복", seal:"오답<br>정복", how:"오답 노트 10문항 해결"},
  {id:"sp_final", name:"최종 심사 통과", seal:"최종<br>통과", how:"최종 심사 80점 이상"}
];
const LETTERS = ["가","나","다","라","마"];

/* index questions */
const QMAP = {};
CURR.forEach(m => m.qs.forEach((q, i) => { q.id = m.id + "-" + (i + 1); q.mod = m.id; QMAP[q.id] = q; }));
const ALLQ = Object.values(QMAP);

/* ---------- state ---------- */
function freshState(){
  return {name:"", xp:0, streak:0, bestStreak:0, mods:{}, wrong:{}, cleared:{}, speedBest:0,
          final:{best:0, passed:false, date:""}, badges:{}, wrongFixed:0};
}
function storeKey(){ return KEY + ":" + (USER ? USER.name : "guest"); }
function loadState(){
  try{ const raw = localStorage.getItem(storeKey()); if(raw){ return Object.assign(freshState(), JSON.parse(raw)); } }catch(e){}
  return freshState();
}
let S = freshState();
function save(){
  try{ localStorage.setItem(storeKey(), JSON.stringify(S)); }catch(e){}
  if(typeof queueSync === "function") queueSync();
}

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel);
const app = () => document.getElementById("app");
function el(tag, attrs, html){
  const n = document.createElement(tag);
  if(attrs) for(const k in attrs){ if(k === "class") n.className = attrs[k]; else if(k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); }
  if(html !== undefined) n.innerHTML = html;
  return n;
}
function shuffle(a){ const b = a.slice(); for(let i = b.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function today(){ const d = new Date(); return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + "."; }
let toastTimer;
function toast(msg){
  const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function level(){ let L = 0; LEVELS.forEach((l, i) => { if(S.xp >= l.min) L = i; }); return L; }
function modState(id){ return S.mods[id] || (S.mods[id] = {best:0, attempts:0, read:false}); }
function cleared(id){ return (S.mods[id] && S.mods[id].best >= PASS * 100); }
function clearedCount(){ return CURR.filter(m => cleared(m.id)).length; }
function badgeCount(){ return Object.keys(S.badges).length; }
function totalBadges(){ return CURR.length + SPECIAL.length; }

function addXP(n){
  const before = level();
  S.xp += n; save(); renderTop();
  if(level() > before) toast("레벨 업! Lv." + (level() + 1) + " " + LEVELS[level()].name);
}
function award(id, label){
  if(S.badges[id]) return false;
  S.badges[id] = today(); save();
  toast("배지 획득: " + label);
  return true;
}

/* ---------- top bar ---------- */
function renderTop(){
  const L = level(), cur = LEVELS[L], next = LEVELS[L + 1];
  $("#lvlChip").textContent = "Lv." + (L + 1) + " " + cur.name;
  const pct = next ? ((S.xp - cur.min) / (next.min - cur.min)) * 100 : 100;
  $("#xpFill").style.width = Math.max(0, Math.min(100, pct)) + "%";
  $("#xpText").textContent = S.xp + " XP";
  $("#streak").textContent = S.streak >= 2 ? "연속 " + S.streak : "";
}
let ROUTE = "home";
function setNav(r){
  document.querySelectorAll("#nav button").forEach(b => { if(b.dataset.go === r) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
}
function go(r, arg){
  ROUTE = r; setNav(r);
  const a = app(); a.innerHTML = "";
  const v = el("section", {class:"view"}); a.appendChild(v);
  ({home:viewHome, path:viewPath, module:viewModule, wrong:viewWrong, badges:viewBadges, speed:viewSpeed, final:viewFinalIntro,
    guide:viewGuide, tools:viewTools, library:viewLibrary})[r](v, arg);
  window.scrollTo({top:0});
}

/* ---------- home ---------- */
function viewHome(v){
  homeTop(v);
  const c = clearedCount(), started = CURR.some(m => modState(m.id).attempts > 0);
  const boxes = [
    {h:"담당", on:started, s:"착수", cap:"학습 시작"},
    {h:"검토", on:c >= 4, s:"검토", cap:"4단계 통과"},
    {h:"승인", on:c >= 8, s:"승인", cap:"8단계 통과"},
    {h:"결재", on:S.final.passed, s:"결재", cap:"최종 심사 합격"}
  ];
  const next = CURR.find(m => !cleared(m.id)) || CURR[0];
  const hero = el("div", {class:"sheet pad hero"});
  hero.innerHTML = `
    <div>
      <p class="eyebrow">${esc(ORG.ORG_NAME ? ORG.ORG_NAME + " " : "")}운영진 온보딩 · 8단계 커리큘럼</p>
      <h1>오늘의 결재함에 <span style="color:var(--stamp)">${ALLQ.length}건</span>이 올라와 있습니다</h1>
      <p class="lead">HRD-Net 행정과 심사평가 기준을 문제로 익힙니다. 정답이면 <b>승인</b>, 틀리면 <b>반려</b>. 단계마다 80% 이상이면 통과, 수료 기준과 같습니다.</p>
      <div class="row" style="margin-top:18px">
        <button class="btn" type="button" id="goNext">${cleared(next.id) ? "처음부터 복습" : next.no + "단계 " + next.title}</button>
        <button class="btn ghost" type="button" id="goPath">전체 학습 경로</button>
      </div>
    </div>
    <div>
      <div class="gyeoljae" role="img" aria-label="결재란 진행 상황">
        ${boxes.map(b => `<div><span>${b.h}</span><em>${b.on ? `<i class="seal-mini">${b.s}</i>` : ""}<small>${b.cap}</small></em></div>`).join("")}
      </div>
      <p class="gcap">결재란이 모두 찍히면 온보딩 완료입니다.</p>
    </div>`;
  v.appendChild(hero);
  hero.querySelector("#goNext").onclick = () => go("module", next.id);
  hero.querySelector("#goPath").onclick = () => go("path");

  const stats = el("div", {class:"sheet"});
  const solved = Object.keys(S.cleared).length;
  stats.innerHTML = `<div class="stats">
    <div><b>${c}/8</b><span>통과한 단계</span></div>
    <div><b>${solved}/${ALLQ.length}</b><span>맞혀 본 문항</span></div>
    <div><b>${badgeCount()}/${totalBadges()}</b><span>배지</span></div>
    <div><b>${Object.keys(S.wrong).length}</b><span>오답 노트</span></div></div>`;
  v.appendChild(stats);

  const modes = el("div", {class:"grid2"});
  const tiles = [
    {k:"60초", h:"스피드 결재", p:"OX 문항을 60초 안에 최대한 많이 처리합니다.", fn:() => go("speed")},
    {k:"20문항", h:"최종 심사", p:"전 단계에서 무작위 20문항. 80점 이상이면 인증서가 나옵니다.", fn:() => go("final")},
    {k:Object.keys(S.wrong).length + "건", h:"오답 노트", p:"반려된 문항만 다시 풀어 하나씩 지웁니다.", fn:() => go("wrong")},
    {k:"Lv." + (level() + 1), h:"배지·레벨", p:"모은 배지와 다음 레벨까지 남은 경험치를 봅니다.", fn:() => go("badges")}
  ];
  tiles.forEach(t => { const b = el("button", {class:"mode", type:"button"}, `<span class="k">${t.k}</span><span class="st">${t.h}</span><span class="sd">${t.p}</span>`); b.onclick = t.fn; modes.appendChild(b); });
  v.appendChild(modes);
}

/* ---------- home: my cohort deadline and notices ---------- */
let HOMEINFO = {profile:null, notices:[]};
function homeKey(){ return KEY + ":home:" + (USER ? USER.name : "guest"); }
function setHomeInfo(r){
  HOMEINFO = {profile:(r && r.profile) || null, notices:(r && Array.isArray(r.notices)) ? r.notices : []};
  try{ localStorage.setItem(homeKey(), JSON.stringify(HOMEINFO)); }catch(e){}
}
function loadHomeInfo(){
  HOMEINFO = {profile:null, notices:[]};
  try{ const raw = localStorage.getItem(homeKey()); if(raw) HOMEINFO = JSON.parse(raw); }catch(e){}
}
function ymd(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtYmd(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? m[1] + "." + Number(m[2]) + "." + Number(m[3]) + "." : String(s || ""); }
function daysUntil(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if(!m) return null;
  const due = new Date(+m[1], +m[2] - 1, +m[3]), t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((due - t) / 86400000);
}
function onboardDone(){ return clearedCount() >= CURR.length && S.final.passed; }
function previewHomeInfo(){
  const t = new Date(), d = new Date(); d.setDate(d.getDate() + 14);
  return {profile:{cohort:"예시 1기", start:ymd(t), due:ymd(d)},
    notices:[{id:"ex", date:ymd(t), title:"미리보기 예시 공지", body:"관리자 화면(admin.html)에서 쓴 공지가 여기에 나옵니다.", important:true}]};
}
function homeTop(v){
  const P = HOMEINFO.profile, N = HOMEINFO.notices || [];
  if(P && P.cohort){
    const done = onboardDone(), n = daysUntil(P.due), c = clearedCount();
    const dd = done ? "완료" : n === null ? "" : n > 0 ? "D-" + n : n === 0 ? "D-day" : "D+" + (-n);
    const card = el("div", {class:"sheet cohort"});
    card.innerHTML = `<div><p class="eyebrow">내 온보딩 · <span class="coh"></span></p>
      <p style="font-size:15px;margin-top:4px">${P.start ? fmtYmd(P.start) + " 시작 · " : ""}${P.due ? "마감 " + fmtYmd(P.due) : "마감일 미정"}${!done && n !== null && n < 0 ? " · 마감이 지났습니다" : ""}</p>
      <div class="checks"><span class="pill ${c >= CURR.length ? "ok" : ""}">8단계 통과 ${c}/${CURR.length}</span><span class="pill ${S.final.passed ? "ok" : ""}">최종 심사 ${S.final.passed ? "합격" : "전"}</span></div></div>
      <div class="dday ${done ? "done" : n !== null && n < 0 ? "late" : ""}">${dd}</div>`;
    card.querySelector(".coh").textContent = P.cohort;
    v.appendChild(card);
  }
  if(N.length){
    const box = el("div", {class:"notices", "aria-label":"공지사항"});
    const draw = all => {
      box.innerHTML = "";
      (all ? N : N.slice(0, 3)).forEach(x => {
        const it = el("div", {class:"notice" + (x.important ? " imp" : "")});
        it.innerHTML = `<div class="nt">${x.important ? '<span class="pill bad">중요</span>' : ""}<b></b><small>${fmtYmd(x.date)}</small></div><p></p>`;
        it.querySelector("b").textContent = x.title; it.querySelector("p").textContent = x.body;
        box.appendChild(it);
      });
      if(!all && N.length > 3){ const more = el("button", {class:"linkbtn", type:"button"}, "공지 " + (N.length - 3) + "건 더 보기"); more.onclick = () => draw(true); box.appendChild(more); }
    };
    draw(false);
    v.appendChild(box);
  }
}

/* ---------- curriculum path ---------- */
function viewPath(v){
  v.appendChild(el("div", {}, `<p class="eyebrow">학습 경로</p><h2>일의 순서대로 8단계</h2><p class="muted" style="margin-top:6px">개강 전부터 성과관리까지 실제 업무 순서입니다. 순서대로 풀기를 권하지만 어느 단계든 바로 열 수 있습니다.</p>`));
  const box = el("div", {class:"sheet path"});
  CURR.forEach(m => {
    const st = modState(m.id), on = cleared(m.id);
    const b = el("button", {class:"step", type:"button"});
    b.innerHTML = `<span class="no">${m.no}</span>
      <span><span class="st">${m.title}</span><span class="sd">${m.sub} · ${m.qs.length}문항${st.attempts ? " · 최고 " + st.best + "%" : ""}</span>
      <span class="meter" style="display:block"><i style="width:${st.best}%"></i></span></span>
      <span class="badge-seal ${on ? "on" : ""}" title="${m.badge.name}">${m.badge.seal}</span>`;
    b.onclick = () => go("module", m.id);
    box.appendChild(b);
  });
  v.appendChild(box);
}

/* ---------- module: cards then quiz ---------- */
function viewModule(v, id){
  const m = CURR.find(x => x.id === id), st = modState(id);
  const head = el("div", {}, `<p class="eyebrow">${m.no}단계</p><h2>${m.title}</h2><p class="muted" style="margin-top:6px">핵심 카드를 읽고 문제를 풉니다. 80% 이상이면 배지 <b>${m.badge.name}</b>를 받습니다.</p>`);
  v.appendChild(head);
  const cards = el("div", {class:"cards"});
  m.cards.forEach((c, i) => cards.appendChild(el("div", {class:"card"}, `<span class="n">${String(i + 1).padStart(2, "0")}</span><div><p>${c.t}</p><span class="ref">근거 · ${c.r}</span></div>`)));
  v.appendChild(cards);
  const row = el("div", {class:"row"});
  const start = el("button", {class:"btn", type:"button"}, `문제 풀기 (${m.qs.length}문항)`);
  start.onclick = () => { st.read = true; save(); startQuiz({kind:"module", mod:m, list:shuffle(m.qs)}); };
  const back = el("button", {class:"btn ghost", type:"button"}, "학습 경로");
  back.onclick = () => go("path");
  row.append(start, back);
  if(st.attempts) row.appendChild(el("span", {class:"muted"}, `최고 ${st.best}% · ${st.attempts}회 응시`));
  v.appendChild(row);
}

/* ---------- quiz engine ---------- */
let Q = null; // {kind, mod, list, i, correct, xp, answers:[]}
function startQuiz(cfg){
  Q = Object.assign({i:0, correct:0, xp:0, answers:[]}, cfg);
  ROUTE = "quiz"; setNav(cfg.kind === "wrong" ? "wrong" : cfg.kind === "module" ? "path" : "");
  renderQ();
}
function prepOptions(q){
  if(q.type === "ox") return [{t:"O", ok:q.a === true}, {t:"X", ok:q.a === false}];
  return shuffle(q.o.map((t, i) => ({t, ok:i === q.a})));
}
function renderQ(){
  const a = app(); a.innerHTML = "";
  const v = el("section", {class:"view"}); a.appendChild(v);
  const q = Q.list[Q.i], n = Q.list.length, exam = Q.kind === "final";
  const title = Q.kind === "module" ? Q.mod.no + "단계 · " + Q.mod.title : Q.kind === "wrong" ? "오답 노트 다시 풀기" : "최종 심사";
  const sheet = el("div", {class:"sheet pad", style:"display:grid;gap:16px"});
  sheet.innerHTML = `<div class="qhead"><span class="eyebrow">${title}</span><span class="mono muted">문항 ${Q.i + 1} / ${n}</span></div>
    <div class="qprog"><i style="width:${(Q.i / n) * 100}%"></i></div>
    <div class="row"><span class="tag ${q.sit ? "sit" : ""}">${q.type === "ox" ? "OX" : q.sit ? "상황 판단" : "선택형"}</span></div>
    <p class="qtext">${q.q}</p>`;
  const opts = prepOptions(q);
  const box = el("div", {class:q.type === "ox" ? "ox" : "opts"});
  opts.forEach((o, i) => {
    const b = el("button", {class:"opt", type:"button", id:"opt" + i});
    b.innerHTML = q.type === "ox" ? o.t : `<span class="lt">${LETTERS[i]}.</span><span>${o.t}</span>`;
    b.onclick = () => answer(o, b, box, opts, sheet);
    box.appendChild(b);
  });
  sheet.appendChild(box);
  sheet.appendChild(el("p", {class:"muted", style:"font-size:12.5px"}, exam ? "최종 심사는 끝난 뒤 한꺼번에 채점합니다." : "숫자키 1~4로 고르고 Enter로 넘어갈 수 있습니다."));
  v.appendChild(sheet);
  const quit = el("button", {class:"btn ghost", type:"button"}, "그만두고 나가기");
  quit.onclick = () => { const k = Q.kind, m = Q.mod; Q = null; if(k === "module") go("module", m.id); else if(k === "wrong") go("wrong"); else go("home"); };
  v.appendChild(el("div", {class:"row"})).appendChild(quit);
}
function answer(o, btn, box, opts, sheet){
  if(box.dataset.done) return; box.dataset.done = "1";
  const q = Q.list[Q.i], exam = Q.kind === "final";
  Q.answers.push({q, ok:o.ok});
  box.querySelectorAll("button").forEach((b, i) => { b.disabled = true; if(!exam && opts[i].ok) b.classList.add("right"); });
  if(!exam && !o.ok) btn.classList.add("wrong");
  if(exam) btn.classList.add("picked");
  if(o.ok){
    Q.correct++;
    let gain = S.cleared[q.id] ? 2 : 10; S.cleared[q.id] = 1;
    if(Q.kind === "wrong" && S.wrong[q.id]){ delete S.wrong[q.id]; S.wrongFixed++; gain += 3; if(S.wrongFixed >= 10) award("sp_wrong", "오답 정복"); }
    S.streak++; if(S.streak > S.bestStreak) S.bestStreak = S.streak;
    if(S.streak % 5 === 0){ gain += 10; toast("연속 " + S.streak + "문항 승인 · 보너스 10 XP"); }
    if(S.streak >= 10) award("sp_streak", "연속 승인 10");
    Q.xp += gain; addXP(gain);
  } else {
    S.wrong[q.id] = 1; S.streak = 0; save(); renderTop();
  }
  const next = el("button", {class:"btn", type:"button", id:"nextBtn"}, Q.i + 1 < Q.list.length ? "다음 문항" : "결과 보기");
  next.onclick = () => { Q.i++; if(Q.i < Q.list.length) renderQ(); else finishQuiz(); };
  if(exam){ sheet.appendChild(next); next.focus(); return; }
  const fb = el("div", {class:"fb"});
  fb.innerHTML = `<div class="stampbox"><span class="stamp ${o.ok ? "yes" : "no"}">${o.ok ? "승인" : "반려"}</span></div>
    <div><p>${q.e}</p><p class="ref">근거 · ${q.r}</p></div>`;
  sheet.appendChild(fb); sheet.appendChild(next); next.focus();
}
document.addEventListener("keydown", e => {
  if(ROUTE !== "quiz" || !Q) return;
  if(/^[1-5]$/.test(e.key)){ const b = document.getElementById("opt" + (Number(e.key) - 1)); if(b && !b.disabled) b.click(); }
  else if(e.key === "Enter"){ const n = document.getElementById("nextBtn"); if(n && document.activeElement !== n){ e.preventDefault(); n.click(); } }
});

/* ---------- results ---------- */
function finishQuiz(){
  const n = Q.list.length, pct = Math.round((Q.correct / n) * 100), pass = pct >= PASS * 100;
  let extra = "";
  if(Q.kind === "module"){
    const st = modState(Q.mod.id), firstClear = pass && st.best < PASS * 100, firstPerfect = pct === 100 && st.best < 100;
    st.attempts++; st.best = Math.max(st.best, pct); save();
    if(firstClear){ addXP(50); Q.xp += 50; award(Q.mod.id, Q.mod.badge.name); extra += `<p>첫 통과 보너스 50 XP · 배지 <b>${Q.mod.badge.name}</b> 획득</p>`; }
    if(firstPerfect){ addXP(30); Q.xp += 30; extra += `<p>만점 보너스 30 XP</p>`; }
  }
  if(Q.kind === "final"){
    if(pct > S.final.best) S.final.best = pct;
    if(pass){ const first = !S.final.passed; S.final.passed = true; S.final.date = today(); if(first){ addXP(100); Q.xp += 100; } award("sp_final", "최종 심사 통과"); }
    save();
  }
  const a = app(); a.innerHTML = ""; ROUTE = "result";
  const v = el("section", {class:"view"}); a.appendChild(v);
  const sheet = el("div", {class:"sheet pad", style:"display:grid;gap:14px"});
  const head = Q.kind === "module" ? Q.mod.no + "단계 결과" : Q.kind === "final" ? "최종 심사 결과" : "오답 노트 결과";
  sheet.innerHTML = `<p class="eyebrow">${head}</p>
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div><span class="big">${pct}</span><span class="muted"> 점 · ${Q.correct}/${n} 정답</span></div>
      <div class="stampbox"><span class="stamp ${pass ? "yes" : "no"}">${pass ? "통과" : "보완"}</span></div>
    </div>
    <div class="passline"><i style="width:${pct}%"></i><b class="mk"></b><em class="lb">통과선 80</em></div>
    <div style="margin-top:14px;display:grid;gap:4px"><p>획득 경험치 <b class="mono">+${Q.xp} XP</b></p>${extra}</div>`;
  v.appendChild(sheet);
  if(Q.kind === "final"){
    const miss = Q.answers.filter(x => !x.ok);
    if(miss.length){
      const list = el("div", {class:"list"});
      list.appendChild(el("h3", {}, "반려된 문항 해설"));
      miss.forEach(x => list.appendChild(el("div", {class:"wrongitem"}, `<b>${x.q.q}</b><p class="muted">${x.q.e}</p><small>근거 · ${x.q.r}</small>`)));
      v.appendChild(list);
    }
  }
  const row = el("div", {class:"row"});
  const btn = (t, fn, ghost) => { const b = el("button", {class:"btn" + (ghost ? " ghost" : ""), type:"button"}, t); b.onclick = fn; row.appendChild(b); };
  if(Q.kind === "module"){
    const idx = CURR.indexOf(Q.mod), nextM = CURR[idx + 1], m = Q.mod;
    if(pass && nextM) btn(nextM.no + "단계로", () => go("module", nextM.id));
    btn("다시 풀기", () => startQuiz({kind:"module", mod:m, list:shuffle(m.qs)}), pass && nextM);
    btn("학습 경로", () => go("path"), true);
  } else if(Q.kind === "final"){
    if(pass) btn("인증서 보기", () => viewCert());
    btn("다시 응시", () => go("final"), pass);
    btn("홈", () => go("home"), true);
  } else {
    if(Object.keys(S.wrong).length) btn("남은 오답 풀기", () => go("wrong"));
    btn("홈", () => go("home"), true);
  }
  v.appendChild(row);
  Q = null;
}

/* ---------- wrong note ---------- */
function viewWrong(v){
  const ids = Object.keys(S.wrong).filter(id => QMAP[id]);
  v.appendChild(el("div", {}, `<p class="eyebrow">오답 노트</p><h2>반려된 문항 ${ids.length}건</h2><p class="muted" style="margin-top:6px">다시 맞히면 목록에서 지워지고 3 XP를 더 받습니다. 누적 10문항을 해결하면 배지를 받습니다(현재 ${S.wrongFixed}문항).</p>`));
  if(!ids.length){ v.appendChild(el("div", {class:"sheet pad"}, "<p>반려된 문항이 없습니다. 학습 경로나 스피드 결재로 새 문항을 풀어 보세요.</p>")); return; }
  const b = el("button", {class:"btn", type:"button"}, "오답 전부 다시 풀기"); b.onclick = () => startQuiz({kind:"wrong", list:shuffle(ids.map(id => QMAP[id]))});
  v.appendChild(el("div", {class:"row"})).appendChild(b);
  const list = el("div", {class:"list"});
  ids.forEach(id => { const q = QMAP[id], m = CURR.find(x => x.id === q.mod); list.appendChild(el("div", {class:"wrongitem"}, `<small>${m.no}단계 · ${m.title}</small><b>${q.q}</b>`)); });
  v.appendChild(list);
}

/* ---------- speed round ---------- */
let SP = null;
function viewSpeed(v){
  const pool = ALLQ.filter(q => q.type === "ox");
  v.appendChild(el("div", {}, `<p class="eyebrow">스피드 결재 · 60초</p><h2>OX ${pool.length}문항 중 무작위</h2><p class="muted" style="margin-top:6px">맞힐 때마다 1 XP. 틀린 문항은 오답 노트로 갑니다. 15개 이상 맞히면 배지. 최고 기록 ${S.speedBest}개.</p>`));
  const b = el("button", {class:"btn", type:"button"}, "시작"); b.onclick = () => runSpeed(pool);
  v.appendChild(el("div", {class:"row"})).appendChild(b);
}
function runSpeed(pool){
  if(SP && SP.timer) clearInterval(SP.timer);
  SP = {deck:shuffle(pool), i:0, ok:0, n:0, end:Date.now() + 60000};
  const a = app(); a.innerHTML = "";
  const v = el("section", {class:"view"}); a.appendChild(v);
  const sheet = el("div", {class:"sheet pad", style:"display:grid;gap:16px"});
  sheet.innerHTML = `<div class="qhead"><span class="eyebrow">스피드 결재</span><span class="mono" id="spScore">승인 0</span></div>
    <div class="timer"><i id="spBar" style="width:100%"></i></div><p class="qtext" id="spQ"></p>
    <div class="ox"><button class="opt" type="button" id="spO">O</button><button class="opt" type="button" id="spX">X</button></div>
    <p class="muted" id="spFb" style="min-height:1.6em"></p>`;
  v.appendChild(sheet);
  const show = () => { if(SP.i >= SP.deck.length){ SP.deck = shuffle(pool); SP.i = 0; } document.getElementById("spQ").innerHTML = SP.deck[SP.i].q; };
  const pick = val => {
    if(!SP || Date.now() > SP.end) return;
    const q = SP.deck[SP.i]; SP.n++;
    const fb = document.getElementById("spFb");
    if(q.a === val){ SP.ok++; S.cleared[q.id] = S.cleared[q.id] || 1; fb.textContent = "승인"; fb.style.color = "var(--ok)"; }
    else { S.wrong[q.id] = 1; fb.textContent = "반려 · " + q.e; fb.style.color = "var(--no)"; }
    document.getElementById("spScore").textContent = "승인 " + SP.ok;
    save(); SP.i++; show();
  };
  document.getElementById("spO").onclick = () => pick(true);
  document.getElementById("spX").onclick = () => pick(false);
  show();
  SP.timer = setInterval(() => {
    const left = Math.max(0, SP.end - Date.now()), bar = document.getElementById("spBar");
    if(bar) bar.style.width = (left / 600) + "%";
    if(left <= 0 || !bar){ clearInterval(SP.timer); if(bar) endSpeed(); }
  }, 200);
}
function endSpeed(){
  const r = SP; SP = null;
  if(r.ok > S.speedBest) S.speedBest = r.ok;
  save(); if(r.ok) addXP(r.ok);
  if(r.ok >= 15) award("sp_speed", "스피드 결재왕");
  const a = app(); a.innerHTML = "";
  const v = el("section", {class:"view"}); a.appendChild(v);
  v.appendChild(el("div", {class:"sheet pad", style:"display:grid;gap:10px"}, `<p class="eyebrow">스피드 결재 결과</p><p><span class="big">${r.ok}</span><span class="muted"> 건 승인 · ${r.n}건 처리</span></p><p class="muted">최고 기록 ${S.speedBest}건 · +${r.ok} XP</p>`));
  const row = el("div", {class:"row"});
  const again = el("button", {class:"btn", type:"button"}, "한 번 더"); again.onclick = () => runSpeed(ALLQ.filter(q => q.type === "ox"));
  const home = el("button", {class:"btn ghost", type:"button"}, "홈"); home.onclick = () => go("home");
  row.append(again, home); v.appendChild(row);
}

/* ---------- final exam & certificate ---------- */
function viewFinalIntro(v){
  v.appendChild(el("div", {}, `<p class="eyebrow">최종 심사</p><h2>8단계에서 무작위 20문항</h2><p class="muted" style="margin-top:6px">문항마다 정답을 보여 주지 않고 끝에서 한꺼번에 채점합니다. 80점 이상이면 합격, 결재란의 마지막 칸이 찍힙니다. 최고 ${S.final.best}점.</p>`));
  const b = el("button", {class:"btn", type:"button"}, "심사 시작");
  b.onclick = () => { const per = {}; const pick = shuffle(ALLQ).filter(q => { per[q.mod] = (per[q.mod] || 0) + 1; return per[q.mod] <= 3; }).slice(0, 20); startQuiz({kind:"final", list:shuffle(pick)}); };
  v.appendChild(el("div", {class:"row"})).appendChild(b);
}
function viewCert(){
  ROUTE = "cert"; setNav("");
  const a = app(); a.innerHTML = "";
  const v = el("section", {class:"view"}); a.appendChild(v);
  const cert = el("div", {class:"cert"});
  cert.innerHTML = `${ORG.ORG_LOGO ? `<img src="${esc(ORG.ORG_LOGO)}" alt="" class="cert-logo">` : ""}<p class="eyebrow">${esc(ORG.ORG_NAME || "사내")} 운영진 온보딩 학습 인증</p><h2>인 증 서</h2>
    <p class="body"><b id="certName"></b><br>위 사람은 운영진 온보딩 최종 심사에서 <b>${S.final.best}점</b>을 받아 HRD-Net 행정과 심사평가 운영 기준을 익혔음을 확인합니다.</p>
    <p class="muted mono">${S.final.date}</p><p><b>${esc(ORG.ORG_NAME)}</b></p><span class="seal-big">결재<br>완료</span>`;
  cert.querySelector("#certName").textContent = (USER && USER.name) || S.name || "이름 미입력";
  v.appendChild(cert);
  const row = el("div", {class:"row"});
  const cp = el("button", {class:"btn", type:"button"}, "결과 문구 복사"); cp.onclick = copyResult;
  const bd = el("button", {class:"btn ghost", type:"button"}, "배지·레벨"); bd.onclick = () => go("badges");
  row.append(cp, bd); v.appendChild(row);
  v.appendChild(el("textarea", {id:"copyBox", hidden:"", readonly:"", rows:"2", style:"width:100%;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--rule);background:var(--paper);color:var(--ink)"}));
}
function resultText(){
  const L = level();
  return `[${ORG.ORG_NAME || "훈련운영"} 운영진 온보딩] ${(USER && USER.name) || S.name || "이름 미입력"} · Lv.${L + 1} ${LEVELS[L].name} · ${S.xp} XP · 통과 ${clearedCount()}/8단계 · 배지 ${badgeCount()}/${totalBadges()} · 최종 심사 ${S.final.passed ? S.final.best + "점 합격" : "미응시/미합격"}`;
}
function copyResult(){
  const txt = resultText();
  const done = () => toast("복사했습니다. 팀 채팅에 붙여 넣으세요.");
  const fallback = () => { const box = document.getElementById("copyBox"); if(box){ box.hidden = false; box.value = txt; box.select(); } toast("아래 칸의 문구를 선택해 복사하세요."); };
  try{ navigator.clipboard.writeText(txt).then(done, fallback); }catch(e){ fallback(); }
}

/* ---------- badges & levels ---------- */
function viewBadges(v){
  const L = level();
  v.appendChild(el("div", {}, `<p class="eyebrow">배지·레벨</p><h2>Lv.${L + 1} ${LEVELS[L].name} · ${S.xp} XP</h2>`));
  const me = el("div", {class:"sheet pad", style:"display:grid;gap:14px"});
  me.innerHTML = `<div class="row" style="justify-content:space-between"><div><p class="eyebrow">로그인한 사람</p><p style="font-size:17px"><b id="meName"></b></p><p class="muted" style="font-size:13px" id="meSync"></p></div>
    <button class="btn ghost" type="button" id="logoutBtn">로그아웃</button></div>
    <div class="row"><button class="btn" type="button" id="copyBtn">결과 문구 복사</button><button class="btn ghost" type="button" id="certBtn">인증서 보기</button></div>
    <textarea id="copyBox" hidden readonly rows="2" style="width:100%;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--rule);background:var(--paper);color:var(--ink)"></textarea>`;
  v.appendChild(me);
  me.querySelector("#meName").textContent = (USER && USER.name) || "미리보기 모드";
  me.querySelector("#meSync").textContent = syncLabel();
  me.querySelector("#logoutBtn").onclick = logout;
  me.querySelector("#copyBtn").onclick = copyResult;
  const cb = me.querySelector("#certBtn"); cb.disabled = !S.final.passed; cb.onclick = viewCert;
  if(!S.final.passed) cb.title = "최종 심사 80점 이상이면 열립니다";

  const grid = el("div", {class:"badges"});
  CURR.forEach(m => grid.appendChild(badgeTile(m.id, m.badge.name, m.badge.seal, m.badge.how)));
  SPECIAL.forEach(s => grid.appendChild(badgeTile(s.id, s.name, s.seal, s.how)));
  v.appendChild(el("h3", {}, `배지 ${badgeCount()}/${totalBadges()}`)); v.appendChild(grid);

  const lv = el("div", {class:"sheet pad"});
  lv.innerHTML = `<h3>레벨</h3><div class="levels" style="margin-top:8px">${LEVELS.map((l, i) => `<div class="${i === L ? "cur" : ""}"><span class="mono">Lv.${i + 1}</span><span>${l.name}</span><span class="mono muted">${l.min} XP</span></div>`).join("")}</div>
    <p class="muted" style="font-size:13px;margin-top:10px">첫 정답 10 XP · 다시 맞힌 문항 2 XP · 5문항 연속 정답마다 10 XP · 단계 첫 통과 50 XP · 만점 30 XP · 최종 심사 합격 100 XP</p>`;
  v.appendChild(lv);

  const reset = el("div", {class:"row"});
  const rb = el("button", {class:"btn danger", type:"button"}, "진행 기록 초기화");
  rb.onclick = () => {
    if(document.getElementById("confirmBox")) return;
    const c = el("div", {class:"confirm", id:"confirmBox"}, `<p>경험치·배지·오답 노트를 모두 지웁니다. 서버에 저장된 내 기록도 초기화되며 되돌릴 수 없습니다.</p>`);
    const r2 = el("div", {class:"row"});
    const yes = el("button", {class:"btn danger", type:"button"}, "모두 지우기"); yes.onclick = () => { S = freshState(); save(); renderTop(); toast("기록을 지웠습니다."); go("home"); };
    const no = el("button", {class:"btn ghost", type:"button"}, "취소"); no.onclick = () => c.remove();
    r2.append(yes, no); c.appendChild(r2); reset.after(c);
  };
  reset.appendChild(rb); v.appendChild(reset);
  v.appendChild(el("p", {class:"muted", style:"font-size:12.5px"}, "진행 기록은 기관 서버(구글 시트)에 저장돼 다른 기기에서 같은 이름·PIN으로 들어오면 이어집니다. 미리보기 모드에서는 이 브라우저에만 남습니다. 문항은 2026.9.23. 기준 현행 고시로 만들었으니, 고시가 바뀌면 원문을 우선합니다."));
}
function badgeTile(id, name, seal, how){
  const on = !!S.badges[id];
  return el("div", {class:"bdg"}, `<span class="badge-seal ${on ? "on" : ""}">${seal}</span><b>${name}</b><small>${on ? S.badges[id] + " 획득" : how}</small>`);
}


/* ---------- server: Google Apps Script web app ---------- */
const SESSION_KEY = "hrd-gyeoljae-session";
const PREVIEW = !ORG.API_URL;
const SYNC = {state: PREVIEW ? "preview" : "idle", at: null, timer: null};
const ERR = {
  bad_code: "접속 코드가 맞지 않습니다. 관리자에게 확인하세요.",
  bad_pin: "이 이름으로 처음 정한 PIN과 다릅니다. 잊었다면 관리자에게 PIN 초기화를 요청하세요.",
  bad_pin_format: "PIN은 숫자 4자리로 입력하세요.",
  no_name: "이름을 입력하세요.",
  no_user: "등록되지 않은 이름입니다. 로그아웃 후 다시 들어오세요.",
  not_configured: "관리자 설정이 끝나지 않았습니다. Apps Script의 스크립트 속성(ACCESS_CODE, ADMIN_CODE)을 확인하세요.",
  not_in_roster: "운영진 명단에 없는 이름입니다. 관리자에게 명단 등록을 요청하세요(이름을 명단과 똑같이 입력).",
  inactive: "퇴사 처리된 이름이라 들어올 수 없습니다. 관리자에게 문의하세요.",
  pin_reset: "관리자가 PIN을 초기화했습니다. 이름과 새로 쓸 PIN을 입력해 다시 들어오세요.",
  network: "서버에 연결하지 못했습니다. 인터넷 연결과 config.js의 API_URL을 확인하세요."
};

async function api(body){
  const res = await fetch(ORG.API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), redirect:"follow"});
  if(!res.ok) throw new Error("http_" + res.status);
  return res.json();
}
function cleanName(v){ return String(v || "").replace(/\s+/g, " ").trim().replace(/^[=+\-@]+/, "").slice(0, 20); }
function summary(){
  const L = level();
  return {level:"Lv." + (L + 1) + " " + LEVELS[L].name, xp:S.xp, cleared:clearedCount(),
    best:CURR.map(m => (S.mods[m.id] ? S.mods[m.id].best : 0)),
    finalBest:S.final.best, finalPassed:S.final.passed, finalDate:S.final.date,
    badges:badgeCount(), wrong:Object.keys(S.wrong).length};
}
function savePayload(){ return {action:"save", code:USER.code, name:USER.name, pin:USER.pin, summary:summary(), progress:S}; }

/* ---------- progress sync ---------- */
function queueSync(){
  if(PREVIEW || !USER) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(pushSync, 1500);
}
async function pushSync(){
  SYNC.timer = null;
  if(PREVIEW || !USER) return;
  SYNC.state = "saving"; paintSync();
  try{
    const r = await api(savePayload());
    if(r.ok){ SYNC.state = "saved"; SYNC.at = new Date(); }
    else SYNC.state = FORCE_OUT[r.error] ? "denied" : "failed";
  }catch(e){ SYNC.state = "failed"; }
  if(SYNC.state === "failed"){ clearTimeout(SYNC.timer); SYNC.timer = setTimeout(pushSync, 30000); }
  paintSync();
}
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState !== "hidden" || !SYNC.timer || !USER || PREVIEW) return;
  clearTimeout(SYNC.timer); SYNC.timer = null;
  try{ navigator.sendBeacon(ORG.API_URL, new Blob([JSON.stringify(savePayload())], {type:"text/plain;charset=utf-8"})); }catch(e){}
});
function hhmm(d){ return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function syncLabel(){
  return ({preview:"미리보기 모드 · 서버에 저장하지 않음", idle:"", saving:"저장 중…",
    saved:"서버에 저장됨 " + (SYNC.at ? hhmm(SYNC.at) : ""), failed:"저장 실패 · 30초 뒤 다시 시도",
    denied:"서버가 저장을 거부했습니다(접속 코드 변경, 명단 제외 등). 로그아웃 후 다시 들어오세요."})[SYNC.state] || "";
}
function paintSync(){
  const t = syncLabel();
  const a = document.getElementById("sync"); if(a) a.textContent = t;
  const b = document.getElementById("meSync"); if(b) b.textContent = t;
}
function mergeProgress(server){
  if(!server || typeof server !== "object") return;
  const remote = Object.assign(freshState(), server);
  const base = (remote.xp || 0) > (S.xp || 0) ? remote : S, other = base === S ? remote : S;
  base.cleared = Object.assign({}, other.cleared, base.cleared);
  base.badges = Object.assign({}, other.badges, base.badges);
  for(const id in other.mods){
    const a = base.mods[id] || (base.mods[id] = {best:0, attempts:0, read:false}), b = other.mods[id] || {};
    a.best = Math.max(a.best || 0, b.best || 0); a.attempts = Math.max(a.attempts || 0, b.attempts || 0); a.read = !!(a.read || b.read);
  }
  if((other.final || {}).best > (base.final || {}).best) base.final = other.final;
  base.speedBest = Math.max(base.speedBest || 0, other.speedBest || 0);
  S = base;
}

/* ---------- gate: access code + name + PIN ---------- */
function renderGate(msg){
  document.getElementById("topbar").hidden = true; app().innerHTML = "";
  const g = document.getElementById("gate"); g.hidden = false; g.innerHTML = "";
  const card = el("div", {class:"sheet gate-card"});
  card.innerHTML = `${ORG.ORG_LOGO ? `<img class="gate-logo" src="${esc(ORG.ORG_LOGO)}" alt="">` : `<span class="gate-seal">결재</span>`}
    <p class="eyebrow">${esc(ORG.ORG_NAME ? ORG.ORG_NAME + " · " : "")}운영진 전용</p>
    <h1>운영진 온보딩 챌린지</h1>
    <p class="muted">HRD-Net 행정과 심사평가 기준을 8단계 ${ALLQ.length}문항으로 익힙니다. ${PREVIEW ? "" : "기관에서 받은 접속 코드와 내 이름, 개인 PIN을 입력하세요."}</p>
    ${PREVIEW ? `<p class="gate-note">config.js에 API_URL이 비어 있어 <b>미리보기 모드</b>입니다. 접속 코드 없이 들어가며, 진도는 이 브라우저에만 남습니다.</p>` : ""}
    <form id="gateForm" class="gate-form" novalidate>
      ${PREVIEW ? "" : `<div class="field"><label for="gCode">접속 코드</label><input id="gCode" type="password" autocomplete="off"></div>`}
      <div class="field"><label for="gName">이름</label><input id="gName" maxlength="20" autocomplete="name"></div>
      ${PREVIEW ? "" : `<div class="field"><label for="gPin">개인 PIN (숫자 4자리)</label><input id="gPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"><small class="muted">처음 들어올 때 정한 번호가 내 PIN이 됩니다. 다른 기기에서도 같은 이름과 PIN으로 이어서 합니다.</small></div>`}
      <p class="gate-msg" id="gMsg" role="alert"></p>
      <button class="btn" type="submit" id="gBtn">${PREVIEW ? "미리보기로 입장" : "입장"}</button>
    </form>`;
  g.appendChild(card);
  const m = card.querySelector("#gMsg"); if(msg) m.textContent = msg;
  const show = t => { m.textContent = t; };
  card.querySelector("#gateForm").onsubmit = async ev => {
    ev.preventDefault();
    const name = cleanName(card.querySelector("#gName").value);
    if(PREVIEW){ enter({name:name || "미리보기", code:"", pin:""}, null); return; }
    const code = card.querySelector("#gCode").value.trim(), pin = card.querySelector("#gPin").value.trim();
    if(!code || !name) return show("접속 코드와 이름을 입력하세요.");
    if(!/^\d{4}$/.test(pin)) return show(ERR.bad_pin_format);
    const btn = card.querySelector("#gBtn"); btn.disabled = true; btn.textContent = "확인 중…"; show("");
    try{
      const r = await api({action:"login", code, name, pin});
      if(!r.ok){ show(ERR[r.error] || ("들어가지 못했습니다(" + r.error + ").")); return; }
      enter({name, code, pin}, r);
    }catch(e){ show(ERR.network); }
    finally{ btn.disabled = false; btn.textContent = "입장"; }
  };
  (card.querySelector(PREVIEW ? "#gName" : "#gCode")).focus();
}
function enter(user, r){
  USER = user;
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }catch(e){}
  S = loadState();
  if(r && r.progress) mergeProgress(r.progress);
  S.name = user.name;
  try{ localStorage.setItem(storeKey(), JSON.stringify(S)); }catch(e){}
  setHomeInfo(PREVIEW ? previewHomeInfo() : r);
  showApp();
  if(r && r.isNew) toast(user.name + "님이 등록됐습니다. PIN을 기억해 두세요.");
  queueSync();
}
const ROUTES_FROM_HASH = ["path", "wrong", "badges", "speed", "final", "guide", "tools", "library"];
function showApp(){
  const g = document.getElementById("gate"); g.hidden = true; g.innerHTML = "";
  document.getElementById("topbar").hidden = false;
  renderTop(); paintSync();
  const h = (location.hash || "").slice(1);
  go(ROUTES_FROM_HASH.includes(h) ? h : "home");
}
const FORCE_OUT = {bad_code:"접속 코드가 바뀌었습니다. 새 코드로 다시 들어오세요.", bad_pin:ERR.bad_pin, not_in_roster:ERR.not_in_roster,
  inactive:ERR.inactive, pin_reset:ERR.pin_reset, no_user:"기록을 찾지 못했습니다. 이름과 PIN으로 다시 들어오세요."};
function logout(msg){
  if(SYNC.timer){ clearTimeout(SYNC.timer); SYNC.timer = null; if(USER && !PREVIEW) api(savePayload()).catch(() => {}); }
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  USER = null; S = freshState(); HOMEINFO = {profile:null, notices:[]}; SYNC.state = PREVIEW ? "preview" : "idle";
  renderGate(typeof msg === "string" ? msg : "로그아웃했습니다.");
}

/* ---------- boot ---------- */
function boot(){
  document.title = (ORG.ORG_NAME ? ORG.ORG_NAME + " " : "") + "운영진 온보딩";
  document.getElementById("brandName").textContent = ORG.ORG_NAME || "운영진 온보딩";
  if(ORG.ORG_LOGO){ const s = document.getElementById("brandSeal"); const img = el("img", {class:"brand-logo", src:ORG.ORG_LOGO, alt:""}); s.replaceWith(img); }
  document.getElementById("goHome").onclick = () => go("home");
  document.querySelectorAll("#nav button").forEach(b => b.onclick = () => go(b.dataset.go));
  let sess = null; try{ sess = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }catch(e){}
  if(PREVIEW){
    if(sess && sess.name){ USER = sess; S = loadState(); setHomeInfo(previewHomeInfo()); showApp(); } else renderGate();
    return;
  }
  if(!(sess && sess.code && sess.name && sess.pin)){ renderGate(); return; }
  USER = sess; S = loadState(); loadHomeInfo(); showApp();
  // 저장된 세션으로 바로 들어간 뒤, 서버에서 코드·명단·공지를 다시 확인합니다.
  api({action:"login", code:sess.code, name:sess.name, pin:sess.pin, resume:true}).then(r => {
    if(r.ok){
      if(r.progress) mergeProgress(r.progress);
      try{ localStorage.setItem(storeKey(), JSON.stringify(S)); }catch(e){}
      setHomeInfo(r); renderTop();
      if(ROUTE === "home") go("home");
      queueSync();
    } else if(FORCE_OUT[r.error]){
      logout(FORCE_OUT[r.error]);
    }
  }).catch(() => { SYNC.state = "failed"; paintSync(); });
}
document.addEventListener("DOMContentLoaded", boot);
