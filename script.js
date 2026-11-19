const API_BASE = "/api/football";
// Supabase: chave publicável. A proteção dos dados é feita pela políticas RLS.
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

function showNotice(msg){$("#notice").textContent=msg;$("#notice").classList.remove("hidden")}
function hideNotice(){$("#notice").classList.add("hidden")}
function setConnection(text){$("#connectionText").textContent=text}
function normalizeName(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}

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
    const status = statusMap[normalizeName(row.status)] || "SCHEDULED";
    const hasScore = row.gols_mandante !== null && row.gols_mandante !== undefined &&
      row.gols_visitante !== null && row.gols_visitante !== undefined;
    return {
      id: `manual-${row.id}`,
      utcDate,
      status,
      homeTeam: { name: row.mandante, shortName: row.mandante },
      awayTeam: { name: row.visitante, shortName: row.visitante },
      competition: { name: competitionName, code: competitionCode },
      venue: row.estadio || "Estádio a confirmar",
      score: { fullTime: { home: hasScore ? row.gols_mandante : null, away: hasScore ? row.gols_visitante : null } },
      source: "supabase"
    };
  });
}

function matchIdentity(m){
  return [matchDate(m), normalizeName(m.homeTeam?.name), normalizeName(m.awayTeam?.name), normalizeName(m.competition?.name)].join("|");
}

async function loadMatches(){
  hideNotice(); setConnection("Carregando partidas…");
  $("#refreshBtn").disabled = true;
  const errors = [];
  let apiMatches = [];
  let manualMatches = [];
  
  try {
    // 1062 é o ID oficial do Atlético-MG na API-Football
    const teamId = "1062";
    const year = new Date().getFullYear();
    const data = await api({id: teamId, season: String(year) });
    
    apiMatches = data.matches || [];
    
    state.team = { id: 1062, name: "Clube Atlético Mineiro", shortName: "Atlético-MG" };
    $("#clubCrest").innerHTML = `<img src="https://media.api-sports.io/football/teams/1062.png" alt="Escudo do Atlético-MG">`;
  } catch(e) {
    errors.push(`API-Football: ${e.message}`);
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
    showNotice(`${state.matches.length} partidas carregadas (${apiCount} da API e ${manualCount} do Supabase). ${errors.join(" | ")}`);
  }else if(!state.matches.length){
    showNotice("Nenhuma partida encontrada. Cadastre jogos manualmente na tabela jogos_manuais do Supabase ou verifique a cobertura da API.");
  }else{
    showNotice(`Calendário carregado: ${state.matches.length} partidas — ${apiCount} da API e ${manualCount} cadastradas no Supabase.`);
  }
  $("#refreshBtn").disabled = false;
}

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
  let html="";
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
    const games=byDate.get(key)||[];
    const classes=["calendar-day",d.getMonth()!==m?"outside":"",key===today?"today":"",key===state.selectedDate?"selected":"",games.length?"has-match":""].filter(Boolean).join(" ");
    html+=`<button class="${classes}" data-date="${key}"><span class="day-number">${d.getDate()}</span>${games.slice(0,2).map(g=>`<span class="day-match-label">${esc(g.competition?.code||"JOGO")} · ${esc(g.homeTeam?.shortName||g.homeTeam?.name||"—")} x ${esc(g.awayTeam?.shortName||g.awayTeam?.name||"—")}</span>`).join("")}${games.length>2?`<span class="day-match-label">+${games.length-2} jogos</span>`:""}</button>`;
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
  return `<article class="day-match"><div class="match-comp">${esc(m.competition?.name||"Competição")}</div><div class="match-teams"><span>${esc(h)}</span><span class="versus">${hasScore?`${score.home} × ${score.away}`:"×"}</span><span>${esc(a)}</span></div><div class="match-meta"><span>${localTime(m.utcDate)} · ${esc(statusNames[m.status]||m.status||"—")}</span><span>${esc(m.venue||"Estádio a confirmar")}</span></div></article>`;
}

function renderList(){
  const matches=visibleMatches();
  if(!matches.length){$("#matchesList").innerHTML='<p class="empty-state">Nenhuma partida encontrada com os filtros selecionados.</p>';return}
  const grouped=new Map();
  matches.forEach(m=>{const key=matchDate(m);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(m)});
  let html="";
  [...grouped.entries()].forEach(([key,items])=>{
    const d=new Date(`${key}T12:00:00`);
    html+=`<div class="date-group">${d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>`;
    items.forEach(m=>{
      const h=m.homeTeam?.shortName||m.homeTeam?.name||"—",a=m.awayTeam?.shortName||m.awayTeam?.name||"—",s=m.score?.fullTime;
      const has=s?.home!=null&&s?.away!=null;
      html+=`<article class="list-match"><div class="list-date">${localTime(m.utcDate)}<small class="status-tag">${esc(statusNames[m.status]||m.status||"—")}</small></div><div class="list-teams">${esc(h)} <span style="color:#888">×</span> ${esc(a)}<small>${esc(m.venue||"Estádio a confirmar")}</small></div><div class="list-comp">${esc(m.competition?.name||"Competição")}</div><div class="list-score">${has?`${s.home} × ${s.away}`:"—"}</div></article>`;
    });
  });
  $("#matchesList").innerHTML=html;
}

function setView(view){
  state.view=view;
  $("#calendarView").classList.toggle("hidden",view!=="calendar");
  $("#listView").classList.toggle("hidden",view!=="list");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
}

document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
$("#prevMonth").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar()});
$("#nextMonth").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar()});
$("#todayBtn").addEventListener("click",()=>{const now=new Date();state.month=new Date(now.getFullYear(),now.getMonth(),1);state.selectedDate=localDateKey(now.toISOString());renderCalendar();renderSelectedDay()});
$("#competitionFilter").addEventListener("change",e=>{state.competition=e.target.value;renderAll()});
$("#statusFilter").addEventListener("change",e=>{state.status=e.target.value;renderAll()});
$("#refreshBtn").addEventListener("click",loadMatches);
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));

loadMatches();
