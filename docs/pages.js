/*
 * 운영진 화면의 추가 페이지: 운영 가이드, 업무 도구, 자료실
 * (app.js의 el, esc, go, toast 등을 함께 씁니다)
 */
function prefGet(k, d){ try{ const v = localStorage.getItem(KEY + ":pref:" + k); return v === null ? d : v; }catch(e){ return d; } }
function prefSet(k, v){ try{ localStorage.setItem(KEY + ":pref:" + k, v); }catch(e){} }
function sectionHead(eyebrow, title, desc){
  return el("div", {class:"section-head"}, `<p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${desc ? `<p class="muted">${desc}</p>` : ""}`);
}

/* ---------- 운영 가이드 ---------- */
function guideBlock(b){
  const box = el("div", {class:"gblock"});
  if(b.h) box.appendChild(el("h3", {}, b.h));
  if(b.p) box.appendChild(el("p", {}, b.p));
  if(b.table){
    const w = el("div", {class:"gtable"});
    w.innerHTML = `<table><thead><tr>${b.table.head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${b.table.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    box.appendChild(w);
  }
  if(b.list) box.appendChild(el(b.ordered ? "ol" : "ul", {class:"glist"}, b.list.map(x => `<li>${x}</li>`).join("")));
  if(b.ref) box.appendChild(el("p", {class:"gref"}, b.ref));
  return box;
}
function viewGuide(v, arg){
  v.appendChild(sectionHead("운영 가이드", "같은 기준으로 일하기 위한 운영 기준",
    "2026.9.23. 현행 고시로 정리했습니다. 규정이 바뀌면 원문이 우선이며, 원문은 자료실에서 열 수 있습니다."));
  const wrap = el("div", {class:"guide"}), toc = el("nav", {class:"toc", "aria-label":"가이드 목차"}), body = el("article", {class:"chap"});
  wrap.append(toc, body); v.appendChild(wrap);
  let cur = GUIDE.find(c => c.id === (arg || prefGet("guide", ""))) ? (arg || prefGet("guide", "")) : GUIDE[0].id;
  GUIDE.forEach(c => {
    const b = el("button", {type:"button"}, c.title);
    b.onclick = () => { cur = c.id; draw(true); };
    b.dataset.id = c.id; toc.appendChild(b);
  });
  const draw = scroll => {
    prefSet("guide", cur);
    toc.querySelectorAll("button").forEach(b => b.setAttribute("aria-current", b.dataset.id === cur ? "true" : "false"));
    const i = GUIDE.findIndex(c => c.id === cur), c = GUIDE[i];
    body.innerHTML = `<h2>${c.title}</h2><p class="lead">${c.lead}</p>`;
    c.blocks.forEach(b => body.appendChild(guideBlock(b)));
    const foot = el("div", {class:"chap-foot"});
    const mod = c.mod && CURR.find(m => m.id === c.mod);
    if(mod){ const q = el("button", {class:"btn", type:"button"}, `이 내용 문제로 풀기 · ${mod.no}단계`); q.onclick = () => go("module", mod.id); foot.appendChild(q); }
    if(i > 0){ const p = el("button", {class:"btn ghost", type:"button"}, "이전 장"); p.onclick = () => { cur = GUIDE[i - 1].id; draw(true); }; foot.appendChild(p); }
    if(i < GUIDE.length - 1){ const n = el("button", {class:"btn ghost", type:"button"}, "다음 장"); n.onclick = () => { cur = GUIDE[i + 1].id; draw(true); }; foot.appendChild(n); }
    body.appendChild(foot);
    if(scroll) wrap.scrollIntoView({block:"start", behavior:"smooth"});
  };
  draw(false);
}

/* ---------- 자료실 ---------- */
function viewLibrary(v){
  v.appendChild(sectionHead("자료실", "규정 원문과 공고 모음", "링크는 새 창으로 열립니다. 법령·고시 링크는 항상 그때의 현행본을 엽니다."));
  const lib = el("div", {class:"lib"});
  LIBRARY.forEach(g => {
    const grp = el("section", {class:"lib-group"});
    grp.appendChild(el("h3", {}, g.group));
    g.items.forEach(it => {
      const a = el("a", {class:"lib-item", href:it.url, target:"_blank", rel:"noopener"});
      a.innerHTML = `<b></b><span></span><em></em>`;
      a.querySelector("b").textContent = it.t; a.querySelector("span").textContent = it.d; a.querySelector("em").textContent = it.src;
      grp.appendChild(a);
    });
    lib.appendChild(grp);
  });
  v.appendChild(lib);
}

/* ---------- 업무 도구 ---------- */
const TOOL_TABS = [{id:"sched", t:"과정 일정 계산기"}, {id:"pay", t:"장려금·수당 계산기"}, {id:"check", t:"운영 점검표"}];
function viewTools(v, arg){
  v.appendChild(sectionHead("업무 도구", "기한 계산과 점검표",
    "날짜는 고시대로 달력 날짜로 셉니다. 공휴일은 반영하지 않으니 HRD-Net에 표시된 날짜를 우선하세요."));
  const tabs = el("div", {class:"tabs", role:"tablist"}), panel = el("div", {class:"panel"});
  v.append(tabs, panel);
  let cur = TOOL_TABS.find(t => t.id === (arg || prefGet("tool", ""))) ? (arg || prefGet("tool", "")) : "sched";
  const draw = () => {
    prefSet("tool", cur);
    tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.id === cur ? "true" : "false"));
    panel.innerHTML = "";
    ({sched:toolSchedule, pay:toolPay, check:toolChecklist})[cur](panel);
  };
  TOOL_TABS.forEach(t => { const b = el("button", {type:"button", role:"tab"}, t.t); b.dataset.id = t.id; b.onclick = () => { cur = t.id; draw(); }; tabs.appendChild(b); });
  draw();
}

/* 운영 점검표: 매일·매주·매월 항목은 기간이 바뀌면 새로 시작합니다 */
const CHECKLISTS = [
  {id:"daily", t:"매일", period:"d", items:[
    "과정별 입실·퇴실 출결이 모두 찍혔는지 확인(지각·조퇴·외출 3회 = 결석 1일)",
    "카드 분실·단말기 고장 등은 다음 날까지 출석입력 요청하고 출석입력요청대장에 기록",
    "대리출석·대리수강 의심 사례는 즉시 관할 고용센터에 신고",
    "오늘 강사·강의실·시간표가 인정(신고)된 내용과 같은지 확인. 내일 바뀔 내용은 오늘 변경신고",
    "제적 사유가 생긴 훈련생은 다음 날 제적 처리"]},
  {id:"weekly", t:"매주", period:"w", items:[
    "훈련생별 누적 결석 점검. 단위기간 50%·전체 20% 기준에 가까운 훈련생 상담",
    "다음 주 강사 일정과 대체 강사 필요 여부 확인(임시 대체는 15일 이내)",
    "개강 예정 과정의 과정정보 입력, 실시신고(개시 전일), 명단 등록 기한 확인",
    "개설 일정 변경은 개시 3일 전까지 입력하고 수강신청자에게 개별 통지"]},
  {id:"monthly", t:"매월(단위기간)", period:"m", items:[
    "마감일부터 3일(토·공휴일 제외) 안에 훈련비·장려금 산정내역 확인·신청",
    "단위기간 출석률 80% 미만 훈련생 확인(훈련비 감액, 장려금 미지급)",
    "출결관리대장·출석입력요청대장·증빙 정리(5년 보관)"]},
  {id:"end", t:"과정 종료 때", period:"x", items:[
    "종료일부터 10일 안 수료보고와 수료증 발급",
    "만족도 조사 입력 안내(미입력 시 마지막 달 장려금 미지급)",
    "수강철회·미수료 사유 확인 후 HRD-Net 등록"]},
  {id:"after", t:"종료 후 7개월까지", period:"x", items:[
    "실업 상태 수료생에게 최소 6개월 취업지원",
    "종료일부터 7개월 안 취업상황 입력·증빙 제출(고용보험 피보험자는 생략)"]},
  {id:"yearly", t:"연간", period:"x", items:[
    "연말: 다음 해 심사평가 계획 공고 확인, 담당자 배정",
    "연초: 훈련기관 관리번호·실시가능직종 확인",
    "봄(2026년은 4~5월): 기관 평가·과정 심사 신청, 현장평가 대비",
    "과정 유효기간(1년) 만료 전 재인정 여부 결정",
    "기관 평가 등급·유효기간 만료일 확인",
    "교·강사 자격과 보수교육 이수 현황 점검",
    "안전대책·배상보험(공제) 갱신, 게시판 게시 확인",
    "심사평가원 부정훈련 예방 콘텐츠로 전 직원 교육"]}
];
function periodKey(p){
  const d = new Date();
  if(p === "d") return ymd(d);
  if(p === "m") return ymd(d).slice(0, 7);
  if(p === "w"){ const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return "w" + ymd(t); }
  return "keep";
}
function toolChecklist(panel){
  panel.appendChild(el("p", {class:"note"}, "체크 표시는 이 브라우저에만 저장됩니다. 매일·매주·매월 항목은 날짜·주·달이 바뀌면 새로 시작합니다."));
  CHECKLISTS.forEach(g => {
    const key = KEY + ":chk:" + (USER ? USER.name : "guest") + ":" + g.id + ":" + periodKey(g.period);
    let st = {}; try{ st = JSON.parse(localStorage.getItem(key) || "{}"); }catch(e){}
    const box = el("section", {class:"gblock"});
    const head = el("div", {class:"row", style:"justify-content:space-between"}, `<h3>${g.t}</h3>`);
    const count = el("span", {class:"pill"}); head.appendChild(count);
    box.appendChild(head);
    const list = el("div", {class:"chklist"});
    const paint = () => { const n = g.items.filter((_, i) => st[i]).length; count.textContent = n + "/" + g.items.length; count.className = "pill" + (n === g.items.length ? " ok" : ""); };
    g.items.forEach((t, i) => {
      const id = "chk-" + g.id + "-" + i;
      const lab = el("label", {for:id}, `<input type="checkbox" id="${id}"><span></span>`);
      lab.querySelector("span").textContent = t;
      const cb = lab.querySelector("input"); cb.checked = !!st[i];
      cb.onchange = () => { st[i] = cb.checked; try{ localStorage.setItem(key, JSON.stringify(st)); }catch(e){} paint(); };
      list.appendChild(lab);
    });
    box.appendChild(list);
    if(g.period === "x"){
      const rb = el("button", {class:"linkbtn", type:"button"}, "이 목록 체크 지우기");
      rb.onclick = () => { st = {}; try{ localStorage.removeItem(key); }catch(e){} list.querySelectorAll("input").forEach(c => c.checked = false); paint(); };
      box.appendChild(rb);
    }
    paint();
    panel.appendChild(box);
  });
}

/* ---------- 날짜 도우미: 기간은 달력 날짜로 센다(운영규정 제2조제2항) ---------- */
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function parseYmd(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysInMonth(y, m){ return new Date(y, m + 1, 0).getDate(); }
function isWeekend(d){ return d.getDay() === 0 || d.getDay() === 6; }
// 개시일부터 k개월째 단위기간의 마지막 날: 대응일의 전날, 대응일이 없으면 그 달 말일
function unitEnd(start, k){
  const t = new Date(start.getFullYear(), start.getMonth() + k, 1), dim = daysInMonth(t.getFullYear(), t.getMonth());
  return start.getDate() > dim ? new Date(t.getFullYear(), t.getMonth(), dim) : new Date(t.getFullYear(), t.getMonth(), start.getDate() - 1);
}
function nextWeekday(d){ let x = new Date(d); while(isWeekend(x)) x = addDays(x, 1); return x; }
// d부터(d 포함) 평일 n일째
function nthBizFrom(d, n){ let x = nextWeekday(d), c = 1; while(c < n){ x = nextWeekday(addDays(x, 1)); c++; } return x; }
function monthLabel(d){ return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월"; }
function fmtD(d){
  const s = d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + ".(" + WD[d.getDay()] + ")";
  return isWeekend(d) ? `<span class="we">${s}</span>` : s;
}
function won(n){ return Math.max(0, Math.floor(n / 10) * 10).toLocaleString("ko-KR") + "원"; }
function field(id, label, control){ return `<div class="field"><label for="${id}">${label}</label>${control}</div>`; }
function opts(list, sel){ return list.map(o => `<option value="${o[0]}"${o[0] === sel ? " selected" : ""}>${o[1]}</option>`).join(""); }
function dl(rows){ return `<dl class="dl">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}${r[2] ? `<small>${r[2]}</small>` : ""}</dd>`).join("")}</dl>`; }

/* ---------- 과정 일정 계산기 ---------- */
function rosterDeadline(method, start, end, days){
  if(method === "remote") return {d:start, rule:"원격: 훈련개시일까지"};
  if(days > 180 || end >= unitEnd(start, 6)) return {d:addDays(start, 14), rule:"180일 초과 또는 훈련기간 6개월 이상: 개시일부터 14일 이내"};
  if(days < 10) return {d:start, rule:"소정훈련일수 10일 미만: 훈련개시일까지"};
  if(days < 30) return {d:addDays(start, 1), rule:"10일 이상 30일 미만: 개시일 다음 날까지"};
  return {d:addDays(start, 7), rule:"30일 이상 180일 이하: 개시일부터 7일 이내"};
}
function toolSchedule(panel){
  let saved = {}; try{ saved = JSON.parse(prefGet("sched", "{}")); }catch(e){}
  const s0 = nextWeekday(addDays(new Date(), 14)); s0.setDate(s0.getDate() + ((8 - s0.getDay()) % 7)); // 2주 뒤 월요일(예시)
  const d = Object.assign({method:"class", start:ymd(s0), end:ymd(unitEnd(s0, 5)), days:"100", gukgi:true}, saved);
  const form = el("form", {class:"sheet pad", novalidate:""});
  form.innerHTML = `<p class="note">${Object.keys(saved).length ? "마지막에 입력한 값입니다." : "예시 값이 들어 있습니다. 우리 과정 날짜로 바꾸세요."}</p>
    <div class="form-grid">
      ${field("sMethod", "훈련 방법", `<select id="sMethod">${opts([["class", "집체·비대면실시간"], ["remote", "원격(비대면실시간 제외)"], ["mixed", "혼합"]], d.method)}</select>`)}
      ${field("sStart", "훈련개시일", `<input id="sStart" type="date" value="${d.start}">`)}
      ${field("sEnd", "훈련종료일", `<input id="sEnd" type="date" value="${d.end}">`)}
      ${field("sDays", "소정훈련일수(집체·실시간 일수)", `<input id="sDays" type="number" min="1" max="999" value="${d.days}">`)}
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="sGukgi"${d.gukgi ? " checked" : ""}>국기·KDT 위탁 과정(위탁계약 요청서 기한 표시)</label>`;
  const out = el("div", {class:"result"});
  panel.append(form, out);
  const q = id => form.querySelector("#" + id);
  const calc = () => {
    const v = {method:q("sMethod").value, start:q("sStart").value, end:q("sEnd").value, days:q("sDays").value, gukgi:q("sGukgi").checked};
    prefSet("sched", JSON.stringify(v));
    const start = parseYmd(v.start), end = parseYmd(v.end), days = Number(v.days) || 0;
    if(!start || !end){ out.innerHTML = `<p class="gate-msg">개시일과 종료일을 넣으세요.</p>`; return; }
    if(end < start){ out.innerHTML = `<p class="gate-msg">종료일이 개시일보다 빠릅니다.</p>`; return; }
    const rd = rosterDeadline(v.method, start, end, days), rdAdj = nextWeekday(rd.d);
    const before = [];
    if(v.gukgi) before.push(["위탁계약 체결 요청서", fmtD(addDays(start, -14)), "개시 14일 전(제30조)"]);
    before.push(["개설 일정 변경 입력", fmtD(addDays(start, -3)) + "까지", "변경 시 수강신청자 개별 통지(제27조)"]);
    before.push(["실시신고", fmtD(addDays(start, -1)) + "까지", "개시 전일(제32조)"]);
    before.push(["훈련생 명단 등록", fmtD(rd.d) + "까지" + (+rdAdj !== +rd.d ? ` → 주말이라 ${fmtD(rdAdj)}까지 가능` : ""), rd.rule + "(제32조)"]);
    // 단위기간
    const units = [];
    if(v.method === "remote") units.push([start, end]);
    else { let k = 1, us = start; while(us <= end && k <= 36){ const ue = unitEnd(start, k); units.push([us, ue < end ? ue : end]); us = addDays(ue, 1); k++; } }
    const rows = units.map((u, i) => {
      const e = u[1], ws = e.getDate() <= 15 ? new Date(e.getFullYear(), e.getMonth(), 16) : new Date(e.getFullYear(), e.getMonth() + 1, 1);
      const we = nthBizFrom(ws, 3), ap = nthBizFrom(addDays(we, 1), 3);
      return `<tr><td class="mono">${i + 1}</td><td>${fmtD(u[0])} ~ ${fmtD(e)}</td><td>${fmtD(nextWeekday(ws))} ~ ${fmtD(we)}</td><td>${fmtD(ap)}</td></tr>`;
    }).join("");
    const after = [
      ["수료보고", fmtD(addDays(end, 10)) + "까지", "종료일부터 10일 안(제38조)"],
      ["만족도 조사(훈련생 입력)", fmtD(addDays(end, 30)) + "까지", "종료 1일 후부터 30일 안(제33조)"],
      ["취업지원 제공", fmtD(addMonthsSafe(end, 6)) + "까지", "실업 상태 수료생, 최소 6개월(제40조)"],
      ["취업상황 입력·증빙", fmtD(addMonthsSafe(end, 7)) + "까지", "종료일부터 7개월 안(제40조)"],
      ["수료율 집계", monthLabel(new Date(end.getFullYear(), end.getMonth() + 2, 1)) + " 마감 자료", "종료 1개월 뒤의 다음 달(제39조)"],
      ["취업률 집계", monthLabel(new Date(end.getFullYear(), end.getMonth() + 7, 1)) + " 마감 자료", "종료 6개월 뒤의 다음 달(제41조)"]
    ];
    out.innerHTML = `<div class="gblock"><h3>개강 전</h3>${dl(before)}</div>
      <div class="gblock"><h3>단위기간별 청구 일정</h3>
        ${v.method === "mixed" ? `<p class="note">혼합과정은 집체 부분 기준입니다. 인터넷원격 부분은 훈련기간 전체가 하나의 단위기간입니다.</p>` : ""}
        <div class="gtable"><table><thead><tr><th>단위기간</th><th>기간</th><th>마감·산정(3영업일)</th><th>기관 확인·신청 늦어도</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="note">마감은 단위기간 종료일이 1~15일이면 그달 16일부터, 16일 이후면 다음 달 1일부터 3일(토·공휴일 제외) 안에 합니다. 신청 기한은 마감이 그 창구의 마지막 날에 끝났다고 보고 계산한 가장 늦은 날입니다(제53조).</p></div>
      <div class="gblock"><h3>종료 후</h3>${dl(after)}</div>
      <p class="note">빨간 날짜는 토·일입니다. 공휴일은 반영하지 않았으니 HRD-Net에 표시된 날짜를 우선하세요.</p>`;
  };
  form.addEventListener("input", calc); form.addEventListener("change", calc);
  form.addEventListener("submit", e => e.preventDefault());
  calc();
}
function addMonthsSafe(d, n){
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(d.getDate(), daysInMonth(t.getFullYear(), t.getMonth())));
  return t;
}

/* ---------- 장려금·수당 계산기 ---------- */
const PAY_GROUPS = [
  ["gukgi", "국가기간산업직종(국기)"], ["kdt", "K-디지털 트레이닝(KDT)"], ["sandae", "산업구조변화 대응 등 특화훈련"],
  ["short", "KDT 단기·산대특 단기·일반고 특화"], ["general", "일반계좌제·과정평가형·돌봄서비스"]
];
const PAY_RATES = {A:{hi:[10000, 200000], lo:[4300, 86000]}, B:{hi:[5800, 116000], lo:[2500, 50000]}, SELF:{hi:[18000, 360000], lo:[9000, 180000]}};
const PAY_SPECIAL = {pop:[15000, 300000, "인구감소지역"], non:[10000, 200000, "비수도권"], cap:[5000, 100000, "수도권"]};
function toolPay(panel){
  let saved = {}; try{ saved = JSON.parse(prefGet("pay", "{}")); }catch(e){}
  const d = Object.assign({group:"kdt", type:"normal", method:"class", hours:"hi", total:"600", unit:"20", attend:"19", region:"cap", meal:false}, saved);
  const form = el("form", {class:"sheet pad", novalidate:""});
  form.innerHTML = `<p class="note">${Object.keys(saved).length ? "마지막에 입력한 값입니다." : "예시 값이 들어 있습니다."} 한 명의 한 단위기간 금액을 계산합니다.</p>
    <div class="form-grid">
      ${field("pGroup", "과정", `<select id="pGroup">${opts(PAY_GROUPS, d.group)}</select>`)}
      ${field("pType", "훈련생", `<select id="pType">${opts([["normal", "일반(근로계약·사업자 아님 등)"], ["self", "자영업자인 고용보험 피보험자"]], d.type)}</select>`)}
      ${field("pMethod", "훈련 방법", `<select id="pMethod">${opts([["class", "집체"], ["live", "비대면실시간"], ["remote", "원격"]], d.method)}</select>`)}
      ${field("pHours", "1일 소정훈련시간", `<select id="pHours">${opts([["hi", "5시간 이상"], ["lo", "5시간 미만"]], d.hours)}</select>`)}
      ${field("pTotal", "총 훈련시간", `<input id="pTotal" type="number" min="1" value="${d.total}">`)}
      ${field("pUnit", "단위기간 소정훈련일수", `<input id="pUnit" type="number" min="1" value="${d.unit}">`)}
      ${field("pAttend", "출석(인정)일수", `<input id="pAttend" type="number" min="0" value="${d.attend}">`)}
      ${field("pRegion", "주된 훈련장소", `<select id="pRegion">${opts([["cap", "수도권"], ["non", "비수도권"], ["pop", "인구감소지역"]], d.region)}</select>`)}
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="pMeal"${d.meal ? " checked" : ""}>기관 급식 이용에 동의(장려금 1일 3,300원 감액)</label>`;
  const out = el("div", {class:"result"});
  panel.append(form, out);
  const q = id => form.querySelector("#" + id);
  const calc = () => {
    const v = {group:q("pGroup").value, type:q("pType").value, method:q("pMethod").value, hours:q("pHours").value, total:q("pTotal").value,
               unit:q("pUnit").value, attend:q("pAttend").value, region:q("pRegion").value, meal:q("pMeal").checked};
    prefSet("pay", JSON.stringify(v));
    const total = Number(v.total) || 0, unit = Number(v.unit) || 0, att = Math.min(Number(v.attend) || 0, unit);
    const rate = unit ? Math.round((att / unit) * 1000) / 10 : 0;
    let inc = 0, incWhy = "", sp = 0, spWhy = "";
    const rates = v.type === "self" ? PAY_RATES.SELF : v.group === "general" ? PAY_RATES.B : PAY_RATES.A;
    const [u, cap] = rates[v.hours];
    if(v.method === "remote") incWhy = "원격훈련은 지원 대상이 아닙니다(제49조④).";
    else if(total < 140) incWhy = "총 훈련시간 140시간 이상 과정만 대상입니다(제49조①).";
    else if(rate < 80) incWhy = "단위기간 출석률 80% 미만이라 지급되지 않습니다(제49조①).";
    else {
      inc = Math.min(u * att, cap);
      incWhy = `${u.toLocaleString("ko-KR")}원 × ${att}일, 월 ${cap.toLocaleString("ko-KR")}원 한도`;
      if(v.meal){ inc = Math.max(0, inc - 3300 * att); incWhy += ` − 급식 감액 3,300원 × ${att}일`; }
    }
    const spGroup = ["gukgi", "kdt", "sandae"].includes(v.group);
    if(!spGroup) spWhy = "국기·KDT·산대특 과정만 대상입니다(제49조의2).";
    else if(v.type === "self") spWhy = "자영업자인 고용보험 피보험자는 대상이 아닙니다(제49조의2①).";
    else if(v.method === "remote") spWhy = "원격훈련은 대상이 아닙니다(제49조의2①).";
    else if(total < 350) spWhy = "총 훈련시간 350시간 이상 과정만 대상입니다(제49조의2①).";
    else if(v.hours !== "hi") spWhy = "1일 소정훈련시간 5시간 이상인 훈련일만 계산합니다(제49조의2③).";
    else if(rate < 80) spWhy = "단위기간 출석률 80% 미만이라 지급되지 않습니다.";
    else {
      const [su, scap, label] = PAY_SPECIAL[v.method === "live" ? "cap" : v.region];
      sp = Math.min(su * att, scap);
      spWhy = `${label} ${su.toLocaleString("ko-KR")}원 × ${att}일, 월 ${scap.toLocaleString("ko-KR")}원 한도${v.method === "live" ? " (비대면실시간은 수도권으로 봄)" : ""}`;
    }
    out.innerHTML = dl([
      ["단위기간 출석률", rate + "%", rate >= 80 ? "80% 이상" : "80% 미만"],
      ["훈련장려금", won(inc), incWhy],
      ["특별훈련수당", won(sp), spWhy],
      ["합계(훈련생에게 직접 지급)", won(inc + sp), "지방고용노동관서가 훈련생에게 지급(제53조)"]
    ]) + `<p class="note">구직급여·산재 휴업급여·구직활동 수당 수급 기간, 공공근로 참여 기간, 기관 기숙사 이용 기간, 만족도 조사 미입력(마지막 달)은 반영하지 않았습니다. 실제 금액은 고용센터 산정이 기준입니다.</p>`;
  };
  form.addEventListener("input", calc); form.addEventListener("change", calc);
  form.addEventListener("submit", e => e.preventDefault());
  calc();
}
