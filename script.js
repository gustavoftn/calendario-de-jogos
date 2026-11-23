const API_BASE = "/api/football";
// Supabase: chave publicável. A proteção dos dados é feita pelas políticas RLS.
const SUPABASE_URL = "https://pxjgybtipdgxamchzpbh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fK6QyLga4HbsRg104vg_Iw_6UCsXXbB";

const state = {
  matches: [],
  team: null,
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: new Date().toISOString().slice(0,10),
  view: "calendar",
  competition: "all",
  status: "all"
};

const $ = (s) => document.querySelector(s);

const statusNames = {
  SCHEDULED:"Agendado", TIMED:"Horário definido", IN_PLAY:"Ao vivo", PAUSED:"Intervalo",
  FINISHED:"Finalizado", POSTPONED:"Adiado", SUSPENDED:"Suspenso", CANCELLED:"Cancelado",
  AWARDED:"Resultado atribuído"
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const localDateKey = (iso) => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
};

const localDate = (iso, opts={day:"2-digit",month:"short"}) =>
  new Date(iso).toLocaleDateString("pt-BR",{...opts,timeZone:"America/Sao_Paulo"});

const localTime = (iso) => new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});

const matchDate = (m) => localDateKey(m.utcDate);

const visibleMatches = () => state.matches.filter(m => {
  const compOk = state.competition === "all" || m.competition?.code === state.competition;
  const statusOk = state.status === "all" || (state.status === "upcoming" ? !["FINISHED","CANCELLED","POSTPONED","AWARDED"].includes(m.status) : m.status === state.status);
  return compOk && statusOk;
});

async function api(params) {
  const url = `${API_BASE}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Falha na API (HTTP ${res.status}).`);
  return data;
}

function showNotice(msg){const n=$("#notice"); if(!n) return; n.textContent=msg; n.classList.remove("hidden"); n.style.display=""}
function hideNotice(){const n=$("#notice"); if(!n) return; n.classList.add("hidden"); n.style.display="none"}
function setConnection(text){const c=$("#connectionText"); if(c) c.textContent=text}
function normalizeName(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}

// ---------- Estilos dos recursos novos (embutidos, não dependem do style.css) ----------
function injectStyles(){
  const css = `
    .hidden{display:none!important}

    /* Resultado e agendado */
    .day-match.result-win,.list-match.result-win{border-left:4px solid #22c55e}
    .day-match.result-draw,.list-match.result-draw{border-left:4px solid #eab308}
    .day-match.result-loss,.list-match.result-loss{border-left:4px solid #ef4444}
    .day-match.status-scheduled,.list-match.status-scheduled{border-left:4px solid #3b82f6}
    .day-match-label.result-win{color:#4ade80!important}
    .day-match-label.result-draw{color:#facc15!important}
    .day-match-label.result-loss{color:#f87171!important}
    .day-match-label.status-scheduled{color:#60a5fa!important}
    .result-badge{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
    .result-badge.win{background:rgba(34,197,94,.15);color:#4ade80}
    .result-badge.draw{background:rgba(234,179,8,.15);color:#facc15}
    .result-badge.loss{background:rgba(239,68,68,.15);color:#f87171}
    .day-match.clickable,.list-match.clickable{cursor:pointer}
    .day-match.clickable:hover,.list-match.clickable:hover{filter:brightness(1.15)}

    /* Formulário */
    .add-card{display:grid;gap:14px;max-width:760px;padding:24px;background:#161616;border:1px solid #2a2a2a;border-radius:16px}
    .add-card h3{margin:0;font-size:20px}
    .add-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
    .add-card label{display:grid;gap:6px;font-size:12px;color:#aaa}
    .add-card input,.add-card select{padding:10px 12px;background:#0e0e0e;border:1px solid #333;border-radius:10px;color:#fff;font:inherit}
    .add-actions{display:flex;gap:10px}
    .add-btn{padding:11px 18px;background:#e11d2e;border:0;border-radius:10px;color:#fff;font-weight:700;cursor:pointer}
    .add-btn.ghost{background:transparent;border:1px solid #444}
    .add-msg{min-height:1em;margin:0;font-size:13px;color:#facc15}

    /* Janela de detalhes */
    .modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px}
    .modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}
    .modal-card{position:relative;width:min(640px,100%);max-height:90vh;overflow:auto;background:#161616;border:1px solid #2a2a2a;border-radius:18px;padding:24px;color:#fff}
    .modal-close{position:absolute;top:8px;right:14px;background:none;border:0;color:#aaa;font-size:30px;line-height:1;cursor:pointer}
    .modal-head{text-align:center}
    .modal-comp{color:#999;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
    .modal-teams{display:flex;align-items:center;justify-content:center;gap:16px;margin:14px 0}
    .modal-team{display:flex;flex-direction:column;align-items:center;gap:8px;flex:1;text-align:center;font-weight:700}
    .modal-crest{width:56px;height:56px;object-fit:contain}
    .modal-score{font-size:32px;font-weight:900;white-space:nowrap}
    .modal-info{display:grid;gap:10px;margin:18px 0}
    .modal-info>div{display:grid;grid-template-columns:110px 1fr;gap:10px}
    .modal-info dt{color:#999;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    .modal-info dd{margin:0}
    .modal-title{margin:22px 0 8px;font-size:15px}
    .modal-muted{color:#888;font-size:12px}
    .modal-sum{font-size:13px}
    .modal-sum .win{color:#4ade80}.modal-sum .draw{color:#facc15}.modal-sum .loss{color:#f87171}
    .h2h-list{list-style:none;margin:8px 0;padding:0;display:grid;gap:6px}
    .h2h-row{display:grid;grid-template-columns:90px 1fr;gap:4px 10px;padding:8px 10px;background:#0e0e0e;border-radius:10px;border-left:4px solid #444;font-size:13px}
    .h2h-row .h2h-comp{grid-column:2;color:#888;font-size:11px}
    .h2h-row.result-win{border-left-color:#22c55e}
    .h2h-row.result-draw{border-left-color:#eab308}
    .h2h-row.result-loss{border-left-color:#ef4444}
  `;
  const style = document.createElement("style");
  style.id = "app-extra-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

// Aviso de carregamento: só aparece para o admin (logado)
let noticeText = "";
function updateNotice(){
  if(authToken && noticeText) showNotice(noticeText);
  else hideNotice();
}

// ---------- Resultado (vitória / empate / derrota) ----------
const isGalo = (t) => /atletico[\s-]*(mg|mineiro)/.test(normalizeName(t?.name || t?.shortName));
const resultLabel = { win: "Vitória", draw: "Empate", loss: "Derrota" };

function resultOf(m){
  if(m.status !== "FINISHED") return null;
  const s = m.score?.fullTime;
  if(s?.home == null || s?.away == null) return null;
  const casa = isGalo(m.homeTeam), fora = isGalo(m.awayTeam);
  if(!casa && !fora) return null;
  if(s.home === s.away) return "draw";
  return (casa ? s.home > s.away : s.away > s.home) ? "win" : "loss";
}

function colorClass(m){
  const r = resultOf(m);
  if(r) return `result-${r}`;
  if(["SCHEDULED","TIMED"].includes(m.status)) return "status-scheduled";
  return "";
}

// ---------- Adicionar jogo (exige login no Supabase) ----------
let authToken = sessionStorage.getItem("sb_token") || null;

function buildAddUI(){
  const nav = document.querySelector(".nav-item")?.parentElement;
  if(nav){
    const b = document.createElement("button");
    b.className = "nav-item"; b.dataset.view = "add";
    b.textContent = "＋ Adicionar jogo";
    nav.appendChild(b);
  }
  const sec = document.createElement("section");
  sec.id = "addView"; sec.className = "hidden";
  sec.style.display = "none";
  const lv = $("#listView");
  if(lv) lv.insertAdjacentElement("afterend", sec);
  else document.body.appendChild(sec);
}

function renderAddView(msg = ""){
  const box = $("#addView");
  if(!box) return;
  if(!authToken){
    box.innerHTML = `<form id="loginForm" class="add-card">
      <h3>Entrar para adicionar jogos</h3>
      <label>E-mail<input type="email" id="loginEmail" required></label>
      <label>Senha<input type="password" id="loginPass" required></label>
      <button type="submit" class="add-btn">Entrar</button>
      <p class="add-msg">${esc(msg)}</p></form>`;
    $("#loginForm").addEventListener("submit", login);
    return;
  }
  box.innerHTML = `<form id="addForm" class="add-card">
    <h3>Adicionar jogo</h3>
    <div class="add-grid">
      <label>Data<input type="date" name="data" required></label>
      <label>Horário<input type="time" name="horario" value="16:00"></label>
      <label>Mandante<input name="mandante" required placeholder="Atlético-MG"></label>
      <label>Visitante<input name="visitante" required></label>
      <label>Competição<input name="competicao" list="comps" placeholder="Brasileirão"></label>
      <datalist id="comps"><option value="Brasileirão"><option value="Copa do Brasil"><option value="Libertadores"><option value="Sul-Americana"><option value="Mineiro"><option value="Amistoso"></datalist>
      <label>Estádio<input name="estadio"></label>
      <label>Transmissão<input name="transmissao" placeholder="Globo, Premiere"></label>
      <label>Situação<select name="status">
        <option>Agendado</option><option>Ao vivo</option><option>Finalizado</option><option>Adiado</option><option>Cancelado</option>
      </select></label>
      <label>Gols mandante<input type="number" min="0" name="gols_mandante"></label>
      <label>Gols visitante<input type="number" min="0" name="gols_visitante"></label>
    </div>
    <div class="add-actions">
      <button type="submit" class="add-btn">Salvar jogo</button>
      <button type="button" id="logoutBtn" class="add-btn ghost">Sair</button>
    </div>
    <p class="add-msg">${esc(msg)}</p></form>`;
  $("#addForm").addEventListener("submit", addMatch);
  $("#logoutBtn").addEventListener("click", logout);
}

async function login(e){
  e.preventDefault();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: $("#loginEmail").value, password: $("#loginPass").value })
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok || !data.access_token) return renderAddView("E-mail ou senha incorretos.");
  authToken = data.access_token;
  sessionStorage.setItem("sb_token", authToken);
  renderAddView();
  updateNotice();
}

function logout(){
  authToken = null;
  sessionStorage.removeItem("sb_token");
  renderAddView();
  updateNotice();
}

async function addMatch(e){
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target));
  const num = (x) => (x === "" || x == null ? null : Number(x));
  const row = {
    data: v.data, horario: v.horario || null,
    mandante: v.mandante.trim(), visitante: v.visitante.trim(),
    competicao: v.competicao.trim() || null, estadio: v.estadio.trim() || null,
    status: v.status, gols_mandante: num(v.gols_mandante), gols_visitante: num(v.gols_visitante)
  };
  // Só envia a transmissão se preenchida (exige a coluna "transmissao" na tabela)
  if(v.transmissao && v.transmissao.trim()) row.transmissao = v.transmissao.trim();

  if(row.status === "Finalizado" && (row.gols_mandante == null || row.gols_visitante == null))
    return renderAddView("Para jogo finalizado, informe os dois placares.");

  const res = await fetch(`${SUPABASE_URL}/rest/v1/jogos_manuais`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(row)
  });
  if(res.status === 401 || res.status === 403){ logout(); return renderAddView("Sessão expirada. Entre de novo."); }
  if(!res.ok){
    const err = await res.json().catch(() => ({}));
    return renderAddView(`Erro ao salvar: ${err.message || res.status}`);
  }
  await loadMatches();
  renderAddView("Jogo salvo! Já aparece no calendário e na lista.");
}

// ---------- Carregar jogos ----------
async function loadManualMatches(){
  const url = `${SUPABASE_URL}/rest/v1/jogos_manuais?select=*&order=data.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    }
  });
  const rows = await res.json().catch(() => []);
  if (!res.ok) throw new Error(rows.message || rows.error || `Falha ao consultar Supabase (HTTP ${res.status}).`);
  return (Array.isArray(rows) ? rows : []).map(row => {
    const time = row.horario ? String(row.horario).slice(0,5) : "12:00";
    const utcDate = new Date(`${row.data}T${time}:00-03:00`).toISOString();
    const competitionName = row.competicao || "Partida cadastrada";
    const competitionCode = `MANUAL-${normalizeName(competitionName).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").toUpperCase()}`;
    const statusMap = {
      "agendado":"SCHEDULED", "horário definido":"TIMED", "ao vivo":"IN_PLAY",
      "intervalo":"PAUSED", "finalizado":"FINISHED", "adiado":"POSTPONED",
      "suspenso":"SUSPENDED", "cancelado":"CANCELLED"
    };
    const status = statusMap[normalizeName(row.status)] || statusMap[String(row.status||"").toLowerCase()] || "SCHEDULED";
    const hasScore = row.gols_mandante !== null && row.gols_mandante !== undefined &&
      row.gols_visitante !== null && row.gols_visitante !== undefined;
    const broadcasts = row.transmissao ? String(row.transmissao).split(",").map(s=>s.trim()).filter(Boolean) : [];
    return {
      id: `manual-${row.id}`,
      utcDate,
      status,
      homeTeam: { name: row.mandante, shortName: row.mandante },
      awayTeam: { name: row.visitante, shortName: row.visitante },
      competition: { name: competitionName, code: competitionCode, label: competitionName.slice(0,3).toUpperCase() },
      venue: row.estadio || "Estádio a confirmar",
      broadcasts,
      score: { fullTime: { home: hasScore ? row.gols_mandante : null, away: hasScore ? row.gols_visitante : null } },
      source: "supabase"
    };
  });
}

// Como o Galo joga no máximo uma vez por dia, a data basta para detectar duplicados
function matchIdentity(m){
  return matchDate(m);
}

async function loadMatches(){
  hideNotice(); setConnection("Carregando partidas…");
  const rb = $("#refreshBtn"); if(rb) rb.disabled = true;
  const errors = [];
  let apiMatches = [];
  let manualMatches = [];

  try {
    const data = await api({});
    apiMatches = data.matches || [];
    if (data.errors?.length) errors.push(`ESPN: ${data.errors.join("; ")}`);

    state.team = { name: "Clube Atlético Mineiro", shortName: "Atlético-MG" };
    const crest = data.crest || "https://media.api-sports.io/football/teams/1062.png";
    const cc = $("#clubCrest");
    if(cc) cc.innerHTML = `<img src="${esc(crest)}" alt="Escudo do Atlético-MG" style="width:34px;height:34px;object-fit:contain;display:block">`;
  } catch(e) {
    errors.push(`ESPN: ${e.message}`);
  }

  try {
    manualMatches = await loadManualMatches();
  } catch(e) {
    errors.push(`Supabase: ${e.message}`);
  }

  const combined = new Map();
  apiMatches.forEach(m => combined.set(matchIdentity(m), m));
  manualMatches.forEach(m => {
    const key = matchIdentity(m);
    const existing = combined.get(key);
    if(!existing){ combined.set(key, m); return; }
    // Se o jogo cadastrado tem transmissão e o da ESPN não, aproveita a do cadastro
    if(m.broadcasts?.length && !existing.broadcasts?.length) existing.broadcasts = m.broadcasts;
  });

  state.matches = [...combined.values()].sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  renderAll();

  setConnection(errors.length === 0 ? "Dados atualizados" : state.matches.length ? "Dados parcialmente carregados" : "Falha na conexão");
  const apiCount = apiMatches.length, manualCount = manualMatches.length;

  if(errors.length){
    noticeText = `${state.matches.length} partidas carregadas (${apiCount} da ESPN e ${manualCount} do Supabase). ${errors.join(" | ")}`;
  }else if(!state.matches.length){
    noticeText = "Nenhuma partida encontrada. Cadastre jogos manualmente na aba Adicionar jogo ou verifique a cobertura da ESPN.";
  }else{
    noticeText = `Calendário carregado: ${state.matches.length} partidas — ${apiCount} da ESPN e ${manualCount} cadastradas no Supabase.`;
  }
  updateNotice();
  if(rb) rb.disabled = false;
}

// ---------- Desenho na tela ----------
function renderAll(){renderSummary();renderCompetitionFilter();renderCalendar();renderSelectedDay();renderList()}

function renderSummary(){
  const ms=visibleMatches();
  const now=Date.now();
  const next=ms.find(m=>new Date(m.utcDate).getTime()>=now && !["CANCELLED","POSTPONED"].includes(m.status));
  $("#totalMatches").textContent=ms.length;
  $("#nextMatchDate").textContent=next?localDate(next.utcDate,{day:"2-digit",month:"short"}):"—";
  $("#nextMatchOpponent").textContent=next?`${next.homeTeam?.shortName||next.homeTeam?.name} x ${next.awayTeam?.shortName||next.awayTeam?.name}`:"Nenhum jogo futuro encontrado";
  $("#competitionCount").textContent=new Set(ms.map(m=>m.competition?.code||m.competition?.name).filter(Boolean)).size;
}

function renderCompetitionFilter(){
  const select=$("#competitionFilter"), old=state.competition;
  const comps=[...new Map(state.matches.filter(m=>m.competition).map(m=>[m.competition.code||m.competition.name,m.competition])).entries()];
  select.innerHTML='<option value="all">Todas as competições</option>'+comps.map(([key,c])=>`<option value="${esc(key)}">${esc(c.name)}</option>`).join("");
  select.value=[...select.options].some(o=>o.value===old)?old:"all";state.competition=select.value;
}

function renderCalendar(){
  const y=state.month.getFullYear(),m=state.month.getMonth();
  $("#monthTitle").textContent=state.month.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  const first=new Date(y,m,1), offset=(first.getDay()+6)%7, start=new Date(y,m,1-offset);
  const ms=visibleMatches(), byDate=new Map();
  ms.forEach(match=>{const k=matchDate(match);if(!byDate.has(k))byDate.set(k,[]);byDate.get(k).push(match)});
  const today=localDateKey(new Date().toISOString());
  const label=(g)=>`<span class="day-match-label ${colorClass(g)}">${esc(g.competition?.label||g.competition?.code||"JOGO")} · ${esc(g.homeTeam?.shortName||g.homeTeam?.name||"—")} x ${esc(g.awayTeam?.shortName||g.awayTeam?.name||"—")}</span>`;
  let html="";
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
    const games=byDate.get(key)||[];
    const classes=["calendar-day",d.getMonth()!==m?"outside":"",key===today?"today":"",key===state.selectedDate?"selected":"",games.length?"has-match":""].filter(Boolean).join(" ");
    html+=`<button class="${classes}" data-date="${key}"><span class="day-number">${d.getDate()}</span>${games.slice(0,2).map(label).join("")}${games.length>2?`<span class="day-match-label">+${games.length-2} jogos</span>`:""}</button>`;
  }
  $("#calendarGrid").innerHTML=html;
  $("#calendarGrid").querySelectorAll("[data-date]").forEach(btn=>btn.addEventListener("click",()=>{state.selectedDate=btn.dataset.date;renderCalendar();renderSelectedDay()}));
}

function renderSelectedDay(){
  const d=new Date(`${state.selectedDate}T12:00:00`);
  $("#selectedDateTitle").textContent=d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
  const matches=visibleMatches().filter(m=>matchDate(m)===state.selectedDate);
  if(!matches.length){$("#selectedDayMatches").innerHTML='<p class="empty-state">Não há partidas do Atlético-MG nesta data com os filtros selecionados.</p>';return}
  $("#selectedDayMatches").innerHTML=matches.map(matchCard).join("");
}

function matchCard(m){
  const h=m.homeTeam?.shortName||m.homeTeam?.name||"—",a=m.awayTeam?.shortName||m.awayTeam?.name||"—";
  const score=m.score?.fullTime;
  const hasScore=score?.home!=null&&score?.away!=null;
  const r=resultOf(m);
  return `<article class="day-match clickable ${colorClass(m)}" data-match-id="${esc(m.id)}" tabindex="0" title="Ver detalhes do jogo"><div class="match-comp">${esc(m.competition?.name||"Competição")}</div><div class="match-teams"><span>${esc(h)}</span><span class="versus">${hasScore?`${score.home} × ${score.away}`:"×"}</span><span>${esc(a)}</span></div><div class="match-meta"><span>${localTime(m.utcDate)} · ${esc(statusNames[m.status]||m.status||"—")} ${r?`<span class="result-badge ${r}">${resultLabel[r]}</span>`:""}</span><span>${esc(m.venue||"Estádio a confirmar")}</span></div></article>`;
}

// Lista: só jogos finalizados, do mais recente para o mais antigo
function renderList(){
  const matches=state.matches
    .filter(m=>m.status==="FINISHED" && (state.competition==="all"||m.competition?.code===state.competition))
    .sort((a,b)=>new Date(b.utcDate)-new Date(a.utcDate));
  const lc=$("#listCount"); if(lc) lc.textContent=`${matches.length} partidas finalizadas`;
  const box=$("#matchesList"); if(!box) return;
  if(!matches.length){box.innerHTML='<p class="empty-state">Nenhuma partida finalizada encontrada.</p>';return}
  const grouped=new Map();
  matches.forEach(m=>{const key=matchDate(m);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(m)});
  let html="";
  [...grouped.entries()].forEach(([key,items])=>{
    const d=new Date(`${key}T12:00:00`);
    html+=`<div class="date-group">${d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>`;
    items.forEach(m=>{
      const h=m.homeTeam?.shortName||m.homeTeam?.name||"—",a=m.awayTeam?.shortName||m.awayTeam?.name||"—",s=m.score?.fullTime;
      const has=s?.home!=null&&s?.away!=null, r=resultOf(m);
      html+=`<article class="list-match clickable ${colorClass(m)}" data-match-id="${esc(m.id)}" tabindex="0"><div class="list-date">${localTime(m.utcDate)}<small class="status-tag">${esc(statusNames[m.status]||m.status||"—")}</small></div><div class="list-teams">${esc(h)} <span style="color:#888">×</span> ${esc(a)}<small>${esc(m.venue||"Estádio a confirmar")}</small></div><div class="list-comp">${esc(m.competition?.name||"Competição")}</div><div class="list-score">${has?`${s.home} × ${s.away}`:"—"}${r?`<span class="result-badge ${r}">${resultLabel[r]}</span>`:""}</div></article>`;
    });
  });
  box.innerHTML=html;
}

// ---------- Detalhes do jogo (janela ao clicar) ----------
const detailCache = new Map();
let currentModalId = null;

function buildModal(){
  const el = document.createElement("div");
  el.id = "matchModal"; el.className = "modal hidden";
  el.innerHTML = `<div class="modal-backdrop" data-close></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <button class="modal-close" data-close aria-label="Fechar">×</button>
      <div id="modalBody"></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => { if(e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", e => { if(e.key === "Escape") closeModal(); });
}

function closeModal(){
  currentModalId = null;
  $("#matchModal")?.classList.add("hidden");
}

// Confrontos já presentes no calendário (plano B quando a ESPN não traz histórico)
function h2hFromSeason(m){
  const opp = isGalo(m.homeTeam) ? m.awayTeam : m.homeTeam;
  const key = normalizeName(opp?.name);
  if(!key) return [];
  return state.matches
    .filter(x => x.id !== m.id && x.status === "FINISHED" &&
      x.score?.fullTime?.home != null && x.score?.fullTime?.away != null &&
      [x.homeTeam, x.awayTeam].some(t => normalizeName(t?.name) === key))
    .map(x => ({
      data: x.utcDate, casa: x.homeTeam?.name, fora: x.awayTeam?.name,
      golsCasa: x.score.fullTime.home, golsFora: x.score.fullTime.away,
      competicao: x.competition?.name
    }))
    .sort((a, b) => new Date(b.data) - new Date(a.data));
}

function h2hResult(ev){
  if(ev.golsCasa == null || ev.golsFora == null) return null;
  const casa = isGalo({name: ev.casa}), fora = isGalo({name: ev.fora});
  if(!casa && !fora) return null;
  if(ev.golsCasa === ev.golsFora) return "draw";
  return (casa ? ev.golsCasa > ev.golsFora : ev.golsFora > ev.golsCasa) ? "win" : "loss";
}

function h2hSection(m, det, loading){
  if(loading) return `<p class="modal-muted">Carregando histórico…</p>`;
  let eventos = det?.h2h || [];
  let fonte = "ESPN";
  if(!eventos.length){
    eventos = h2hFromSeason(m);
    fonte = "jogos já carregados no calendário (temporada atual)";
  }
  if(!eventos.length) return `<p class="modal-muted">Sem histórico de confrontos disponível.</p>`;
  let v = 0, e = 0, d = 0;
  const rows = eventos.map(ev => {
    const r = h2hResult(ev);
    if(r === "win") v++; else if(r === "draw") e++; else if(r === "loss") d++;
    const placar = ev.golsCasa != null && ev.golsFora != null ? `${ev.golsCasa} × ${ev.golsFora}` : "—";
    return `<li class="h2h-row ${r ? `result-${r}` : ""}">
      <span class="h2h-date">${esc(localDate(ev.data, {day:"2-digit",month:"2-digit",year:"numeric"}))}</span>
      <span class="h2h-teams">${esc(ev.casa || "—")} <b>${placar}</b> ${esc(ev.fora || "—")}</span>
      <span class="h2h-comp">${esc(ev.competicao || "")}</span>
    </li>`;
  }).join("");
  const resumo = (v + e + d) ? `<p class="modal-sum">Do ponto de vista do Galo: <b class="win">${v} vitória(s)</b>, <b class="draw">${e} empate(s)</b>, <b class="loss">${d} derrota(s)</b></p>` : "";
  return `${resumo}<ul class="h2h-list">${rows}</ul><p class="modal-muted">Fonte: ${esc(fonte)}.</p>`;
}

function modalHTML(m, det, loading){
  const h = m.homeTeam, a = m.awayTeam, s = m.score?.fullTime;
  const has = s?.home != null && s?.away != null, r = resultOf(m);
  const crest = (t) => t?.crest ? `<img class="modal-crest" src="${esc(t.crest)}" alt="">` : "";
  const local = [det?.venue?.name || m.venue, det?.venue?.city].filter(Boolean).join(" · ");
  const canais = (det?.broadcasts?.length ? det.broadcasts : m.broadcasts) || [];
  const dataTxt = localDate(m.utcDate, {weekday:"long", day:"2-digit", month:"long", year:"numeric"});
  const aviso = det?.erro ? `<p class="modal-muted">Não foi possível carregar todos os detalhes (${esc(det.erro)}).</p>` : "";
  const notaCanal = m.source === "espn" && canais.length ? `<small class="modal-muted">Canais informados pela ESPN (podem ser de outro país).</small>` : "";
  return `
    <div class="modal-head">
      <div class="modal-comp">${esc(m.competition?.name || "Competição")}</div>
      <div class="modal-teams">
        <div class="modal-team">${crest(h)}<span>${esc(h?.name || h?.shortName || "—")}</span></div>
        <div class="modal-score">${has ? `${s.home} × ${s.away}` : "×"}</div>
        <div class="modal-team">${crest(a)}<span>${esc(a?.name || a?.shortName || "—")}</span></div>
      </div>
      ${r ? `<span class="result-badge ${r}">${resultLabel[r]}</span>` : ""}
    </div>
    <dl class="modal-info">
      <div><dt>Data</dt><dd>${esc(dataTxt)}</dd></div>
      <div><dt>Horário</dt><dd>${esc(localTime(m.utcDate))} (Brasília)</dd></div>
      <div><dt>Situação</dt><dd>${esc(statusNames[m.status] || m.status || "—")}</dd></div>
      <div><dt>Local</dt><dd>${esc(local || "A confirmar")}</dd></div>
      <div><dt>Transmissão</dt><dd>${canais.length ? esc(canais.join(", ")) : "Não informada"}${notaCanal ? "<br>" + notaCanal : ""}</dd></div>
    </dl>
    ${aviso}
    <h4 class="modal-title">Histórico de confrontos</h4>
    ${h2hSection(m, det, loading)}`;
}

async function openMatch(id){
  const m = state.matches.find(x => x.id === id);
  if(!m) return;
  currentModalId = id;
  $("#matchModal").classList.remove("hidden");
  const body = $("#modalBody");

  const canFetch = m.source === "espn" && m.eventId && m.liga;
  if(!canFetch){ body.innerHTML = modalHTML(m, null, false); return; }
  if(detailCache.has(id)){ body.innerHTML = modalHTML(m, detailCache.get(id), false); return; }

  body.innerHTML = modalHTML(m, null, true);
  try{
    const res = await fetch(`/api/jogo?event=${encodeURIComponent(m.eventId)}&liga=${encodeURIComponent(m.liga)}`);
    const det = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(det.error || `HTTP ${res.status}`);
    detailCache.set(id, det);
    if(currentModalId === id) body.innerHTML = modalHTML(m, det, false);
  }catch(err){
    if(currentModalId === id) body.innerHTML = modalHTML(m, { erro: err.message }, false);
  }
}

// Clique (ou Enter) em qualquer jogo abre os detalhes
document.addEventListener("click", e => {
  const card = e.target.closest("[data-match-id]");
  if(card) openMatch(card.dataset.matchId);
});
document.addEventListener("keydown", e => {
  if(e.key !== "Enter") return;
  const card = e.target.closest?.("[data-match-id]");
  if(card) openMatch(card.dataset.matchId);
});

// ---------- Trocar de aba ----------
// Descobre o bloco do calendário (grade + painel "Partidas do dia") para esconder na Lista
function calendarParts(){
  const parts=[];
  const cv=$("#calendarView"); if(cv) parts.push(cv);
  const g=$("#calendarGrid"), s=$("#selectedDayMatches"), lv=$("#listView");
  if(g&&s){
    let el=g; while(el&&!el.contains(s)) el=el.parentElement;
    if(el && el!==document.body && !(lv&&el.contains(lv))) parts.push(el);
    else parts.push(g.parentElement, s.parentElement);
  }
  return [...new Set(parts.filter(Boolean))];
}

function setView(view){
  state.view=view;
  const toggle=(el,on)=>{
    if(!el) return;
    el.classList.toggle("hidden",!on);
    el.style.display=on?"":"none";
  };
  calendarParts().forEach(el=>toggle(el,view==="calendar"));
  toggle($("#listView"),view==="list");
  toggle($("#addView"),view==="add");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="add") renderAddView();
  window.scrollTo({top:0});
}

// ---------- Inicialização ----------
injectStyles();
buildAddUI();
buildModal();

document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
$("#prevMonth").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar()});
$("#nextMonth").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar()});
$("#todayBtn").addEventListener("click",()=>{const now=new Date();state.month=new Date(now.getFullYear(),now.getMonth(),1);state.selectedDate=localDateKey(now.toISOString());renderCalendar();renderSelectedDay()});
$("#competitionFilter").addEventListener("change",e=>{state.competition=e.target.value;renderAll()});
$("#statusFilter").addEventListener("change",e=>{state.status=e.target.value;renderAll()});
$("#refreshBtn").addEventListener("click",loadMatches);
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));

loadMatches();

// ---------- Animação de entrada (sem som) ----------
(function intro(){
  // Mostra uma vez por sessão
  if(sessionStorage.getItem("intro_visto")) return;
  sessionStorage.setItem("intro_visto", "1");

  const css = `
    #intro{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;
      background:radial-gradient(circle at 50% 40%,#1c1c1c 0%,#000 70%);color:#fff;
      transition:opacity .7s ease,transform .7s ease;cursor:pointer}
    #intro.sair{opacity:0;transform:scale(1.08);pointer-events:none}
    .intro-inner{text-align:center;padding:24px}
    .intro-letters{display:flex;justify-content:center;align-items:baseline;
      font-size:clamp(64px,16vw,150px);font-weight:900;letter-spacing:.06em;line-height:1}
    .intro-letters span{opacity:0;transform:translateY(-40px) scale(1.3);
      animation:introLetra .6s cubic-bezier(.2,.9,.3,1.2) forwards}
    .intro-letters i{font-style:normal;color:#e11d2e;opacity:0;animation:introLetra .6s .95s forwards}
    .intro-line{height:4px;width:0;margin:18px auto 0;background:#e11d2e;border-radius:2px;
      animation:introLinha .8s 1s ease forwards}
    .intro-sub{margin:18px 0 0;color:#aaa;letter-spacing:.2em;text-transform:uppercase;
      font-size:12px;opacity:0;animation:introFade .6s 1.5s forwards}
    @keyframes introLetra{to{opacity:1;transform:none}}
    @keyframes introLinha{to{width:min(320px,60vw)}}
    @keyframes introFade{to{opacity:1}}
    @media (prefers-reduced-motion:reduce){
      #intro *{animation-duration:.01s!important;animation-delay:0s!important}
      #intro{transition:opacity .2s}
      #intro.sair{transform:none}
    }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "intro";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="intro-inner">
      <div class="intro-letters">${"GALODAY".split("").map((l, i) =>
        `<span style="animation-delay:${0.2 + i * 0.18}s">${l}</span>`).join("")}<i>.</i></div>
      <div class="intro-line"></div>
      <p class="intro-sub">Calendário de jogos · Atlético-MG</p>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  let fechado = false;
  function fechar(){
    if(fechado) return;
    fechado = true;
    el.classList.add("sair");
    setTimeout(() => {
      el.remove();
      document.body.style.overflow = "";
    }, 800);
  }

  setTimeout(fechar, 2800);             // fecha sozinha
  el.addEventListener("click", fechar); // ou ao clicar
  document.addEventListener("keydown", e => { if(e.key === "Escape") fechar(); });
})();