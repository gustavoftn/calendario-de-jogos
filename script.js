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

// ---------- Detalhes da partida ----------
const HISTORY_API = "/api/history";
const DETAILS_API = "/api/match-details";

function installMatchModal(){
  if(document.getElementById("matchDetailsModal")) return;
  const style = document.createElement("style");
  style.textContent = `
    .match-modal-backdrop.hidden{display:none!important}.match-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(7px)}
    .match-modal{width:min(680px,100%);max-height:min(88vh,900px);overflow:auto;background:#151515;color:#f5f5f5;border:1px solid #303030;border-radius:20px;box-shadow:0 24px 80px #0009}
    .match-modal-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #2b2b2b;position:sticky;top:0;background:#151515;z-index:2}
    .match-modal-head h2{font:800 18px Manrope, sans-serif;margin:0}.match-modal-close{border:0;background:#292929;color:#fff;border-radius:50%;width:36px;height:36px;font-size:22px;cursor:pointer}
    .match-modal-body{padding:22px}.match-modal-comp{color:#a4c639;text-transform:uppercase;font-size:11px;font-weight:800;letter-spacing:1.3px;text-align:center}
    .match-modal-score{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:20px 0 24px}.match-modal-team{text-align:center;min-width:0}.match-modal-team img{width:54px;height:54px;object-fit:contain;display:block;margin:0 auto 9px}.match-modal-team strong{font-size:14px;display:block;overflow-wrap:anywhere}.match-modal-result{font-size:27px;font-weight:800;white-space:nowrap}.match-modal-time{text-align:center;color:#aaa;font-size:12px;margin-top:7px}
    .match-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}.match-info-item{background:#202020;border:1px solid #303030;border-radius:12px;padding:13px}.match-info-item span{display:block;color:#999;font-size:10px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}.match-info-item strong{font-size:13px;line-height:1.45;overflow-wrap:anywhere}
    .match-modal-section{border-top:1px solid #303030;padding-top:18px;margin-top:18px}.match-modal-section h3{font:800 13px Manrope,sans-serif;margin:0 0 13px}.match-broadcast{display:inline-flex;background:#252b18;color:#d8ee8c;border:1px solid #46531f;border-radius:8px;padding:7px 10px;margin:0 6px 6px 0;font-size:12px}.match-h2h-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.match-h2h-stat{background:#202020;border-radius:10px;padding:12px;text-align:center}.match-h2h-stat strong{display:block;font-size:22px}.match-h2h-stat span{font-size:10px;color:#aaa}.match-h2h-list{list-style:none;padding:0;margin:12px 0 0}.match-h2h-list li{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #292929;font-size:12px}.match-modal-muted{color:#999;font-size:12px;line-height:1.5}.match-modal-loading{color:#aaa;text-align:center;padding:18px}.match-clickable{cursor:pointer}.match-clickable:hover{filter:brightness(1.15)}.match-open-hint{display:block;text-align:right;color:#a4c639;font-size:10px;margin-top:8px;font-weight:700}.match-calendar-clickable{cursor:pointer}
    @media(max-width:520px){.match-modal-backdrop{padding:8px}.match-modal{border-radius:15px}.match-modal-body{padding:16px}.match-info-grid{grid-template-columns:1fr}.match-modal-score{gap:5px}.match-modal-result{font-size:21px}.match-modal-team strong{font-size:12px}}
  `;
  document.head.appendChild(style);
  const modal = document.createElement("div");
  modal.id = "matchDetailsModal";
  modal.className = "match-modal-backdrop hidden";
  modal.setAttribute("aria-hidden","true");
  modal.innerHTML = `<section class="match-modal" role="dialog" aria-modal="true" aria-labelledby="matchModalTitle"><header class="match-modal-head"><h2 id="matchModalTitle">Detalhes da partida</h2><button class="match-modal-close" type="button" aria-label="Fechar">×</button></header><div class="match-modal-body" id="matchModalBody"></div></section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e=>{if(e.target===modal || e.target.closest(".match-modal-close")){e.preventDefault();e.stopPropagation();closeMatchDetails();}});
  document.addEventListener("keydown", e=>{if(e.key==="Escape") closeMatchDetails();});
}

function closeMatchDetails(){
  const modal=$("#matchDetailsModal");
  if(!modal) return;
  modal.classList.add("hidden"); modal.setAttribute("aria-hidden","true");
}

function matchTeamName(team){return team?.name || team?.shortName || "Equipe";}
function renderHistory(history, match){
  if(!history) return `<p class="match-modal-muted">Histórico indisponível para esta partida.</p>`;
  if(history.message) return `<p class="match-modal-muted">${esc(history.message)}</p>`;
  const stats=history.stats || {};
  const recent=Array.isArray(history.matches)?history.matches:[];
  const list=recent.length?`<ul class="match-h2h-list">${recent.slice(0,10).map(g=>`<li><span>${esc(localDate(g.utcDate,{day:"2-digit",month:"short",year:"numeric"}))} · ${esc(g.homeTeam||"—")} x ${esc(g.awayTeam||"—")}</span><strong>${g.homeGoals ?? "-"} × ${g.awayGoals ?? "-"}</strong></li>`).join("")}</ul>`:"";
  if(stats.homeWins==null && stats.draws==null && stats.awayWins==null && !recent.length) return `<p class="match-modal-muted">A API não retornou confrontos anteriores.</p>`;
  return `<div class="match-h2h-stats"><div class="match-h2h-stat"><strong>${stats.homeWins ?? 0}</strong><span>Vitórias ${esc(matchTeamName(match.homeTeam))}</span></div><div class="match-h2h-stat"><strong>${stats.draws ?? 0}</strong><span>Empates</span></div><div class="match-h2h-stat"><strong>${stats.awayWins ?? 0}</strong><span>Vitórias ${esc(matchTeamName(match.awayTeam))}</span></div></div>${list}<p class="match-modal-muted">${history.totalMatches ?? recent.length ?? 0} confrontos considerados. Dados: football-data.org.</p>`;
}

async function openMatchDetails(matchId){
  const match=state.matches.find(m=>String(m.id)===String(matchId));
  if(!match) return;
  installMatchModal();
  const modal=$("#matchDetailsModal"), body=$("#matchModalBody");
  const home=match.homeTeam||{}, away=match.awayTeam||{}, score=match.score?.fullTime;
  const hasScore=score?.home!=null && score?.away!=null;
  const hLogo=home.crest||home.logo||"", aLogo=away.crest||away.logo||"";
  $("#matchModalTitle").textContent=`${matchTeamName(home)} x ${matchTeamName(away)}`;
  modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false");
  body.innerHTML=`<div class="match-modal-comp">${esc(match.competition?.name||"Partida")}</div><div class="match-modal-score"><div class="match-modal-team">${hLogo?`<img src="${esc(hLogo)}" alt="">`:""}<strong>${esc(matchTeamName(home))}</strong></div><div><div class="match-modal-result">${hasScore?`${score.home} × ${score.away}`:"VS"}</div><div class="match-modal-time">${esc(localTime(match.utcDate))} · ${esc(statusNames[match.status]||match.status||"A confirmar")}</div></div><div class="match-modal-team">${aLogo?`<img src="${esc(aLogo)}" alt="">`:""}<strong>${esc(matchTeamName(away))}</strong></div></div><div class="match-info-grid"><div class="match-info-item"><span>Data e horário</span><strong>${esc(localDate(match.utcDate,{weekday:"long",day:"2-digit",month:"long",year:"numeric"}))}<br>${esc(localTime(match.utcDate))} · Brasília</strong></div><div class="match-info-item"><span>Estádio</span><strong id="matchVenue">${esc(match.venue||"A confirmar")}</strong></div><div class="match-info-item"><span>Cidade</span><strong id="matchCity">Consultando ESPN…</strong></div><div class="match-info-item"><span>Transmissão</span><strong id="matchBroadcast">Consultando ESPN…</strong></div></div><section class="match-modal-section"><h3>Histórico de confrontos</h3><div id="matchHistory" class="match-modal-loading">Consultando football-data.org…</div></section>`;

  const requests=[];
  if(match.eventId && match.leagueCode){
    requests.push(fetch(`${DETAILS_API}?event=${encodeURIComponent(match.eventId)}&league=${encodeURIComponent(match.leagueCode)}`).then(r=>r.json().then(d=>{if(!r.ok) throw new Error(d.error||"Falha ao consultar ESPN");return d;})).then(data=>{
      const city=data.city || data.venue?.city || "Não informado pela ESPN";
      const venue=data.venue?.name || data.venueName || match.venue || "A confirmar";
      const broadcasts=Array.isArray(data.broadcasts)?data.broadcasts:[];
      $("#matchVenue").textContent=venue; $("#matchCity").textContent=city;
      $("#matchBroadcast").innerHTML=broadcasts.length?broadcasts.map(b=>`<span class="match-broadcast">${esc(typeof b==="string"?b:(b.name||b.shortName||b.market||"Transmissão"))}</span>`).join(""):'<span class="match-modal-muted">Não informado pela ESPN</span>';
    }).catch(()=>{$("#matchCity").textContent="Não disponível";$("#matchBroadcast").textContent="Não informado pela ESPN";}));
  } else {
    $("#matchCity").textContent="Não informado"; $("#matchBroadcast").textContent="Não disponível para jogos manuais";
  }
  if(home.name && away.name){
    const qs=new URLSearchParams({home:home.name,away:away.name,date:match.utcDate||""});
    requests.push(fetch(`${HISTORY_API}?${qs}`).then(r=>r.json().then(d=>{if(!r.ok) throw new Error(d.error||"Falha ao consultar histórico");return d;})).then(data=>{$("#matchHistory").innerHTML=renderHistory(data,match);}).catch(err=>{$("#matchHistory").innerHTML=`<p class="match-modal-muted">${esc(err.message||"Histórico indisponível")}</p>`;}));
  } else $("#matchHistory").textContent="Não há equipes suficientes para consultar o histórico.";
  await Promise.allSettled(requests);
}

function showNotice(msg){$("#notice").textContent=msg;$("#notice").classList.remove("hidden")}
function hideNotice(){$("#notice").classList.add("hidden")}
function setConnection(text){$("#connectionText").textContent=text}
function normalizeName(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}

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
  $("#listView").insertAdjacentElement("afterend", sec);
}

function renderAddView(msg = ""){
  const box = $("#addView");
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
    return {
      id: `manual-${row.id}`,
      utcDate,
      status,
      homeTeam: { name: row.mandante, shortName: row.mandante },
      awayTeam: { name: row.visitante, shortName: row.visitante },
      competition: { name: competitionName, code: competitionCode, label: competitionName.slice(0,3).toUpperCase() },
      venue: row.estadio || "Estádio a confirmar",
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
  $("#refreshBtn").disabled = true;
  const errors = [];
  let noticeText = "";
function updateNotice(){
  if(authToken && noticeText) showNotice(noticeText);
  else hideNotice();
}
  let apiMatches = [];
  let manualMatches = [];

  try {
    const data = await api({});
    apiMatches = data.matches || [];
    if (data.errors?.length) errors.push(`ESPN: ${data.errors.join("; ")}`);

    state.team = { name: "Clube Atlético Mineiro", shortName: "Atlético-MG" };
    const crest = data.crest || "https://media.api-sports.io/football/teams/1062.png";
    $("#clubCrest").innerHTML = `<img src="${esc(crest)}" alt="Escudo do Atlético-MG" style="width:34px;height:34px;object-fit:contain;display:block">`;
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
  manualMatches.forEach(m => { const key = matchIdentity(m); if(!combined.has(key)) combined.set(key, m); });

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
  $("#refreshBtn").disabled = false;
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
  $("#listCount").textContent=`${ms.length} partidas`;
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
  const label=(g)=>{const r=resultOf(g);return `<span role="button" tabindex="0" data-match-id="${esc(g.id)}" class="day-match-label match-calendar-clickable ${colorClass(g)}">${esc(g.competition?.label||g.competition?.code||"JOGO")} · ${esc(g.homeTeam?.shortName||g.homeTeam?.name||"—")} x ${esc(g.awayTeam?.shortName||g.awayTeam?.name||"—")}</span>`};
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
  bindMatchDetailClicks($("#calendarGrid"));
}

function renderSelectedDay(){
  const d=new Date(`${state.selectedDate}T12:00:00`);
  $("#selectedDateTitle").textContent=d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
  const matches=visibleMatches().filter(m=>matchDate(m)===state.selectedDate);
  if(!matches.length){$("#selectedDayMatches").innerHTML='<p class="empty-state">Não há partidas do Atlético-MG nesta data com os filtros selecionados.</p>';return}
  $("#selectedDayMatches").innerHTML=matches.map(matchCard).join("");
  bindMatchDetailClicks($("#selectedDayMatches"));
}

function matchCard(m){
  const h=m.homeTeam?.shortName||m.homeTeam?.name||"—",a=m.awayTeam?.shortName||m.awayTeam?.name||"—";
  const score=m.score?.fullTime;
  const hasScore=score?.home!=null&&score?.away!=null;
  const r=resultOf(m);
  return `<article role="button" tabindex="0" aria-label="Ver detalhes de ${esc(h)} x ${esc(a)}" data-match-id="${esc(m.id)}" class="day-match match-clickable ${colorClass(m)}"><div class="match-comp">${esc(m.competition?.name||"Competição")}</div><div class="match-teams"><span>${esc(h)}</span><span class="versus">${hasScore?`${score.home} × ${score.away}`:"×"}</span><span>${esc(a)}</span></div><div class="match-meta"><span>${localTime(m.utcDate)} · ${esc(statusNames[m.status]||m.status||"—")} ${r?`<span class="result-badge ${r}">${resultLabel[r]}</span>`:""}</span><span>${esc(m.venue||"Estádio a confirmar")}</span></div><small class="match-open-hint">Ver detalhes ↗</small></article>`;
}
function colorClass(m){
  const r = resultOf(m);
  if(r) return `result-${r}`;
  if(["SCHEDULED","TIMED"].includes(m.status)) return "status-scheduled";
  return "";
}

function bindMatchDetailClicks(container){
  if(!container) return;
  container.querySelectorAll("[data-match-id]").forEach(el=>{
    el.addEventListener("click",e=>{e.stopPropagation();openMatchDetails(el.dataset.matchId);});
    el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openMatchDetails(el.dataset.matchId);}});
  });
}

function renderList(){
  const matches=[...visibleMatches()].reverse();
  if(!matches.length){$("#matchesList").innerHTML='<p class="empty-state">Nenhuma partida encontrada com os filtros selecionados.</p>';return}
  const grouped=new Map();
  matches.forEach(m=>{const key=matchDate(m);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(m)});
  const hoje=localDateKey(new Date().toISOString());
  const chaves=[...grouped.keys()];
  const alvo=chaves.find(k=>k>=hoje)||chaves[chaves.length-1];
  let html="";
  [...grouped.entries()].forEach(([key,items])=>{
    const d=new Date(`${key}T12:00:00`);
    html+=`<div class="date-group"${key===alvo?' id="lista-alvo"':""}>${d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>`;
    items.forEach(m=>{
      const h=m.homeTeam?.shortName||m.homeTeam?.name||"—",a=m.awayTeam?.shortName||m.awayTeam?.name||"—",s=m.score?.fullTime;
      const has=s?.home!=null&&s?.away!=null, r=resultOf(m);
      html+=`<article role="button" tabindex="0" data-match-id="${esc(m.id)}" class="list-match match-clickable ${colorClass(m)}"><div class="list-date">${localTime(m.utcDate)}<small class="status-tag">${esc(statusNames[m.status]||m.status||"—")}</small></div><div class="list-teams">${esc(h)} <span style="color:#888">×</span> ${esc(a)}<small>${esc(m.venue||"Estádio a confirmar")}</small></div><div class="list-comp">${esc(m.competition?.name||"Competição")}</div><div class="list-score">${has?`${s.home} × ${s.away}`:"—"}${r?`<span class="result-badge ${r}">${resultLabel[r]}</span>`:""}</div></article>`;
    });
  });
  $("#matchesList").innerHTML=html;
  bindMatchDetailClicks($("#matchesList"));
}

function calendarParts(){
  const parts=[];
  const cv=$("#calendarView"); if(cv) parts.push(cv);
  const g=$("#calendarGrid"), s=$("#selectedDayMatches"), lv=$("#listView");
  if(g&&s){
    let el=g; while(el&&!el.contains(s)) el=el.parentElement;
    if(el && el!==document.body && !(lv&&el.contains(lv))) parts.push(el);
    else parts.push(g.parentElement, s.parentElement);
  }
  return parts.filter(Boolean);
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
  if(view==="list") setTimeout(()=>document.getElementById("lista-alvo")?.scrollIntoView({block:"start"}),0);
  else window.scrollTo({top:0});
}

// ---------- Inicialização ----------
installMatchModal();
buildAddUI();

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
// Cole este bloco no FINAL do script.js (depois de loadMatches();).
// Não precisa mexer no HTML nem no CSS: o estilo é injetado por aqui.
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

  setTimeout(fechar, 2800);           // fecha sozinha
  el.addEventListener("click", fechar); // ou ao clicar
  document.addEventListener("keydown", e => { if(e.key === "Escape") fechar(); });
})();