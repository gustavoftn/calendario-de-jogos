const API_BASE = "/api/football";
// Supabase: chave publicável. A proteção dos dados é feita pelas políticas RLS.
const SUPABASE_URL = "https://pxjgybtipdgxamchzpbh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fK6QyLga4HbsRg104vg_Iw_6UCsXXbB";

const state = {
  matches: [],
  team: null,
  standings: [],
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
    .day-match.status-scheduled,.list-match.status-scheduled{border-left:4px solid #76797c}
    .day-match-label.result-win{color:#4ade80!important}
    .day-match-label.result-draw{color:#facc15!important}
    .day-match-label.result-loss{color:#f87171!important}
    .day-match-label.status-scheduled{color:#76797c!important}
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
    .modal-title{margin:22px 0 8px;font-size:15px;display:flex;justify-content:center}
    .modal-muted{color:#888;font-size:12px}
    .modal-sum{font-size:13px}
    .modal-sum .win{color:#4ade80}.modal-sum .draw{color:#facc15}.modal-sum .loss{color:#f87171}
    .h2h-list{list-style:none;margin:8px 0;padding:0;display:grid;gap:6px}
    .h2h-row{display:grid;grid-template-columns:90px 1fr;gap:4px 10px;padding:8px 10px;background:#0e0e0e;border-radius:10px;border-left:4px solid #444;font-size:13px}
    .h2h-row .h2h-comp{grid-column:2;color:#888;font-size:11px}
    .h2h-row.result-win{border-left-color:#22c55e}
    .h2h-row.result-draw{border-left-color:#eab308}
    .h2h-row.result-loss{border-left-color:#ef4444}
    .standings-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:15px}
    .standings-heading h2{font:800 21px Manrope;margin:0}
    .standings-actions{display:flex;gap:8px}
    .simulate-btn,.reset-sim-btn{border:0;border-radius:9px;padding:11px 14px;font-weight:800;font-size:12px}
    .simulate-btn{background:#d71920;color:#fff}
    .reset-sim-btn{background:#252525;border:1px solid #444;color:#ddd}
    .simulation-notice{padding:10px 12px;border-radius:9px;border:1px solid #5a4820;background:#2d2617;color:#f4d795;font-size:12px}
    .standings-panel{background:#181818;border:1px solid #2c2c2c;border-radius:12px;padding:10px}
    .standings-table-wrap{overflow-x:auto}
    .standings-table{width:100%;border-collapse:collapse;min-width:620px}
    .standings-table th{padding:10px 12px;color:#888;font-size:9px;text-transform:uppercase;text-align:right;border-bottom:1px solid #333}
    .standings-table th:nth-child(1),.standings-table th:nth-child(2){text-align:left}
    .standings-table td{padding:12px;color:#ddd;font-size:12px;text-align:right;border-bottom:1px solid #292929}
    .standings-table td:nth-child(1),.standings-table td:nth-child(2){text-align:left}
    .standings-club{display:flex;align-items:center;gap:9px;font-weight:700}
    .standings-club img{width:26px;height:26px;object-fit:contain}
    .standings-table tr.galo td{background:rgba(215,25,32,.09)}
    .standings-rank{color:#aaa;font-weight:800}
    .points-cell{color:#fff;font-weight:900}
    @media(max-width:720px){.standings-heading{align-items:flex-start;flex-direction:column}.standings-actions{width:100%}.simulate-btn,.reset-sim-btn{flex:1}}
    /* Sidebar responsivo */
    /* Abas do menu no celular: só a faixa rola, a página não */
html,body{max-width:100%}
body{overflow-x:clip}
@media(max-width:480px){
.nav-scroll{
  display:flex!important;flex-wrap:nowrap!important;gap:8px;
  overflow-x:auto;overflow-y:hidden;max-width:100%;
  -webkit-overflow-scrolling:touch;scrollbar-width:none;
  scroll-snap-type:x proximity;padding-bottom:4px}
.nav-scroll::-webkit-scrollbar{display:none}
.nav-scroll .nav-item{flex:0 0 auto;white-space:nowrap;scroll-snap-align:start}
}
.app-sidebar-fix{min-width:0;max-width:100%}
@media(min-width:901px){
  .sidebar-sticky{position:sticky!important;top:0;align-self:start;height:100vh;overflow-y:auto}
}
@media(max-width:900px){
  /* No celular/tablet a sidebar vira o topo da página: ocupa a largura toda */
  .sidebar-sticky{position:static!important;width:100%!important;max-width:100%!important;min-width:0!important;
    height:auto!important;grid-column:1/-1;justify-self:stretch;align-self:stretch;box-sizing:border-box}
  .nav-scroll{width:100%;min-width:0}
}

/* Aproveitamento (cores neutras; o style.css do site tem prioridade) */
:where(.perf-grid){display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
:where(.perf-card){padding:18px;color:inherit;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.28);border-radius:14px;display:grid;gap:12px}
:where(.perf-card.perf-total){background:rgba(215,25,32,.07);border-color:rgba(215,25,32,.4)}
:where(.perf-card header){display:flex;align-items:center;justify-content:space-between;gap:10px}
:where(.perf-card h3){margin:0;font-size:16px;color:inherit}
:where(.perf-pct){font-size:26px;font-weight:900;color:inherit}
:where(.perf-bar){height:10px;background:rgba(127,127,127,.25);border-radius:999px;overflow:hidden}
:where(.perf-bar i){display:block;height:100%;border-radius:999px}
:where(.perf-bar i.tier-high){background:#22c55e}
:where(.perf-bar i.tier-mid){background:#eab308}
:where(.perf-bar i.tier-low){background:#ef4444}
:where(.perf-stats){display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0}
:where(.perf-stats>div){text-align:center;padding:8px 4px;background:rgba(127,127,127,.12);border-radius:9px}
:where(.perf-stats dt){font-size:10px;letter-spacing:.08em;opacity:.65}
:where(.perf-stats dd){margin:2px 0 0;font-weight:800;font-size:15px;color:inherit}
:where(.perf-card small){font-size:12px;opacity:.65}

    /* Escalações / campinho único (2 times) */
    .lineup-wrap{display:grid;gap:12px;margin:8px 0 4px}
    .lineup-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .lineup-head-team{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800}
    .lineup-formation{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(215,25,32,.15);color:#f87171;font-size:11px;font-weight:800;letter-spacing:.04em}
    .pitch-full{position:relative;width:100%;aspect-ratio:16/10;min-height:280px;border-radius:12px;overflow:hidden;
      background:repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 7%,transparent 7% 14%),linear-gradient(90deg,#1a7a42 0%,#146b38 50%,#1a7a42 100%);
      border:2px solid rgba(255,255,255,.22);box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
    .pitch-full-marks{position:absolute;inset:5% 3%;border:1.5px solid rgba(255,255,255,.32);border-radius:3px;pointer-events:none}
    .pitch-full-marks::before{content:"";position:absolute;top:0;bottom:0;left:50%;border-left:1.5px solid rgba(255,255,255,.32)}
    .pitch-full-marks::after{content:"";position:absolute;left:50%;top:50%;width:14%;aspect-ratio:1;border:1.5px solid rgba(255,255,255,.32);border-radius:50%;transform:translate(-50%,-50%)}
    .pitch-box-l,.pitch-box-r{position:absolute;top:50%;transform:translateY(-50%);height:48%;width:12%;border:1.5px solid rgba(255,255,255,.32);pointer-events:none}
    .pitch-box-l{left:0;border-right:none;border-radius:2px 0 0 2px}
    .pitch-box-r{right:0;border-left:none;border-radius:0 2px 2px 0}
    .pitch-halves{position:absolute;inset:6% 2%;display:grid;grid-template-columns:1fr 1fr;gap:2%;z-index:1}
    .pitch-half{display:flex;justify-content:space-between;align-items:stretch;min-width:0}
    .pitch-half.is-away{flex-direction:row-reverse}
    .pitch-col{display:flex;flex-direction:column;justify-content:space-evenly;align-items:center;flex:1;min-width:0;gap:2px}
    .pitch-player{display:flex;flex-direction:column;align-items:center;gap:2px;max-width:70px;min-width:0}
    .pitch-num{width:26px;height:26px;border-radius:50%;background:#fff;color:#111;font-weight:900;font-size:11px;
      display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid rgba(0,0,0,.1);flex-shrink:0}
    .pitch-player.is-galo .pitch-num{background: repeating-linear-gradient(
        90deg,
        #111111,
        #111111 6px,
        #ffffff 6px,
        #ffffff 12px
    );
    color: #ffd700;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 2px #000;
    border-color: rgba(255, 255, 255, 0.35);}
    .pitch-player.is-away-team .pitch-num{background:#1e293b;color:#fff;border-color:rgba(255,255,255,.25)}
    .pitch-name{font-size:9px;line-height:1.15;text-align:center;color:#fff;font-weight:700;
      text-shadow:0 1px 2px rgba(0,0,0,.85);max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
    .bench-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .lineup-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
    .lineup-list li{display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center;padding:5px 6px;border-radius:8px;font-size:12px;background:rgba(127,127,127,.08)}
    .lineup-jersey{font-weight:800;color:#aaa;text-align:center}
    .lineup-pos{color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    .lineup-bench-title{margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em}
    .lineup-empty{color:#888;font-size:12px;margin:0}
    @media(max-width:560px){
      .pitch-full{aspect-ratio:4/3;min-height:220px}
      .pitch-name{font-size:8px}.pitch-num{width:22px;height:22px;font-size:10px}
      .bench-grid{grid-template-columns:1fr}
    }
    `;
  const style = document.createElement("style");
  style.id = "app-extra-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

// Aviso de carregamento: só aparece para o admin (logado)
let noticeText = "";
function updateNotice(){
  hideNotice(); // sem login de admin, o aviso técnico fica oculto
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
    state.standings = Array.isArray(data.standings) ? data.standings : [];

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
function renderAll(){
  renderSummary();
  renderCompetitionFilter();
  renderCalendar();
  renderSelectedDay();
  renderList();
  renderStandings();
  renderPerformance();
}

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

// ---------- Classificação ----------
// ---------- Aproveitamento por competição ----------
function renderPerformance(){
  const box=$("#performanceBody"); if(!box) return;
  const groups=new Map();
  const bump=(key,name,r,gf,gc)=>{
    if(!groups.has(key)) groups.set(key,{name,j:0,v:0,e:0,d:0,gp:0,gc:0});
    const g=groups.get(key);
    g.j++; g.gp+=gf; g.gc+=gc;
    if(r==="win") g.v++; else if(r==="draw") g.e++; else g.d++;
  };
  state.matches.forEach(m=>{
    const r=resultOf(m); if(!r) return;
    const s=m.score.fullTime, casa=isGalo(m.homeTeam);
    const gf=casa?s.home:s.away, gc=casa?s.away:s.home;
    bump("__geral","Geral",r,gf,gc);
    bump(m.competition?.code||m.competition?.name||"outros",m.competition?.name||"Outros",r,gf,gc);
  });
  if(!groups.size){ box.innerHTML='<p class="empty-state">Ainda não há jogos finalizados para calcular o aproveitamento.</p>'; return; }
  const geral=groups.get("__geral"); groups.delete("__geral");
  const list=[geral,...[...groups.values()].sort((a,b)=>b.j-a.j||a.name.localeCompare(b.name))];
  box.innerHTML=list.map((g,i)=>{
    const pts=g.v*3+g.e, max=g.j*3, pct=max?pts/max*100:0;
    const tier=pct>=60?"high":pct>=40?"mid":"low";
    const sg=g.gp-g.gc;
    return `<article class="perf-card${i===0?" perf-total":""}">
      <header><h3>${esc(g.name)}</h3><strong class="perf-pct">${pct.toFixed(1).replace(".",",")}%</strong></header>
      <div class="perf-bar" role="img" aria-label="Aproveitamento de ${pct.toFixed(1)}%"><i class="tier-${tier}" style="width:${pct}%"></i></div>
      <dl class="perf-stats">
        <div><dt>J</dt><dd>${g.j}</dd></div><div><dt>V</dt><dd>${g.v}</dd></div><div><dt>E</dt><dd>${g.e}</dd></div><div><dt>D</dt><dd>${g.d}</dd></div>
        <div><dt>GM</dt><dd>${g.gp}</dd></div><div><dt>GC</dt><dd>${g.gc}</dd></div><div><dt>SG</dt><dd>${sg>0?"+":""}${sg}</dd></div><div><dt>PTS</dt><dd>${pts}</dd></div>
      </dl>
      <small>${pts} de ${max} pontos possíveis</small>
    </article>`;
  }).join("");
}

function renderStandings(){
  const body = $("#standingsBody");
  if(!body) return;

  const list = state.standings || [];
  if(!list.length){
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#888;padding:24px">Classificação ainda não disponível.</td></tr>`;
    return;
  }

  body.innerHTML = list.map(c => {
    const galo = isGalo({ name: c.name });
    const crest = c.crest
      ? `<img src="${esc(c.crest)}" alt="" loading="lazy">`
      : "";
    return `<tr class="${galo ? "galo" : ""}">
      <td class="standings-rank">${c.rank ?? "—"}</td>
      <td>
        <div class="standings-club">
          ${crest}
          <span>${esc(c.shortName || c.name)}</span>
        </div>
      </td>
      <td class="points-cell">${c.points ?? 0}</td>
      <td>${c.played ?? 0}</td>
      <td>${c.wins ?? 0}</td>
      <td>${c.draws ?? 0}</td>
      <td>${c.losses ?? 0}</td>
      <td>${c.goalDifference ?? 0}</td>
    </tr>`;
  }).join("");
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

// Linha tática a partir da posição ESPN (0=GK … 5=ataque)
function tacticalLine(pos){
  const p = String(pos || "").toUpperCase();
  if(/^G|GK|GOL/.test(p)) return 0;
  if(/RB|LB|CB|CD|WB|RWB|LWB|DEF|BACK|^D$/.test(p)) return 1;
  if(/DM|CDM|VOL|MDC/.test(p)) return 2;
  if(/AM|CAM|OM|SA|MEI.*ATA|ATA.*MEI/.test(p)) return 4;
  if(/F|ST|CF|SS|FW|ATA|W$|LW|RW|PON/.test(p)) return 5;
  // CM, LM, RM, M e afins
  return 3;
}

// Ordena lateralmente: esquerda → direita
function sideRank(pos){
  const p = String(pos || "").toUpperCase();
  if(/LB|LWB|LM|LW|CD-L|LCB|CM-L|AM-L|^L$/.test(p)) return 0;
  if(/CD-R|RCB|CM-R|AM-R|RB|RWB|RM|RW|^R$/.test(p)) return 4;
  return 2;
}

function shortPlayerName(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(parts.length <= 1) return parts[0] || "—";
  const last = parts[parts.length - 1];
  if(last.length >= 3) return last;
  return parts.slice(-2).join(" ");
}

function teamLines(side){
  const starters = side?.starters || [];
  const buckets = [[], [], [], [], [], []];
  starters.forEach(p => {
    buckets[Math.min(5, Math.max(0, tacticalLine(p.position)))].push(p);
  });
  // Fallback se não houver posições
  const onlyGkOrEmpty = buckets.slice(1).every(b => !b.length);
  if(onlyGkOrEmpty && starters.length){
    buckets.forEach((_, i) => { buckets[i] = []; });
    starters.forEach(p => {
      const fp = Number(p.formationPlace) || 99;
      if(fp <= 1) buckets[0].push(p);
      else if(fp <= 5) buckets[1].push(p);
      else if(fp <= 7) buckets[2].push(p);
      else if(fp <= 10) buckets[3].push(p);
      else buckets[5].push(p);
    });
  }
  return buckets
    .map(list => [...list].sort((a, b) =>
      sideRank(a.position) - sideRank(b.position) ||
      (a.formationPlace ?? 99) - (b.formationPlace ?? 99)
    ))
    .filter(list => list.length);
}

function halfPitchHtml(side, { away = false } = {}){
  const lines = teamLines(side); // GK → ataque
  const galo = /atletico[\s-]*(mg|mineiro)/i.test(normalizeName(side?.teamName));
  const playerCls = galo ? "pitch-player is-galo" : (away ? "pitch-player is-away-team" : "pitch-player");

  const cols = lines.map(list => {
    const players = list.map(p =>
      `<div class="${playerCls}" title="${esc(p.name)}">
        <span class="pitch-num">${esc(p.jersey || "·")}</span>
        <span class="pitch-name">${esc(shortPlayerName(p.name))}</span>
      </div>`
    ).join("");
    return `<div class="pitch-col">${players}</div>`;
  }).join("");

  return `<div class="pitch-half${away ? " is-away" : ""}">${cols || `<p class="lineup-empty">—</p>`}</div>`;
}

function benchListHtml(side){
  const bench = side?.bench || [];
  if(!bench.length) return "";
  const items = bench.map(p =>
    `<li><span class="lineup-jersey">${esc(p.jersey || "—")}</span><span>${esc(p.name)}</span><span class="lineup-pos">${esc(p.position || "")}</span></li>`
  ).join("");
  return `<div>
    <div class="lineup-bench-title">Reservas · ${esc(side.teamName || "")}</div>
    <ul class="lineup-list">${items}</ul>
  </div>`;
}

function lineupSection(m, det, loading){
  if(loading) return `<p class="modal-muted">Carregando escalações…</p>`;
  const list = det?.lineups || [];
  if(!list.length){
    if(det?.erro){
      return `<p class="modal-muted">Não foi possível carregar a escalação (${esc(det.erro)}).</p>`;
    }
    return `<p class="modal-muted">Escalação ainda não disponível (geralmente sai perto do horário do jogo ou após o apito inicial).</p>`;
  }

  const homeName = normalizeName(m.homeTeam?.name || m.homeTeam?.shortName);
  const ordered = [...list].sort((a, b) => {
    const aHome = normalizeName(a.teamName) === homeName ? 0 : 1;
    const bHome = normalizeName(b.teamName) === homeName ? 0 : 1;
    return aHome - bHome;
  });
  const home = ordered[0] || null;
  const away = ordered[1] || null;

  const head = `
    <div class="lineup-head">
      <div class="lineup-head-team">
        <span>${esc(home?.teamName || m.homeTeam?.name || "Mandante")}</span>
        ${home?.formation ? `<span class="lineup-formation">${esc(home.formation)}</span>` : ""}
      </div>
      <div class="lineup-head-team" style="margin-left:auto;text-align:right">
        ${away?.formation ? `<span class="lineup-formation">${esc(away.formation)}</span>` : ""}
        <span>${esc(away?.teamName || m.awayTeam?.name || "Visitante")}</span>
      </div>
    </div>`;

  const pitch = `
    <div class="pitch-full">
      <div class="pitch-full-marks">
        <div class="pitch-box-l"></div>
        <div class="pitch-box-r"></div>
      </div>
      <div class="pitch-halves">
        ${halfPitchHtml(home, { away: false })}
        ${halfPitchHtml(away, { away: true })}
      </div>
    </div>`;

  const benches = [benchListHtml(home), benchListHtml(away)].filter(Boolean).join("");

  return `<div class="lineup-wrap">
    ${head}
    ${pitch}
    ${benches ? `<div class="bench-grid">${benches}</div>` : ""}
  </div>`;
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
    </dl>
    ${aviso}
    <h4 class="modal-title">Escalação</h4>
    ${lineupSection(m, det, loading)}`;
}

// Código ESPN da competição a partir do code/sigla usado no calendário
const LIGA_ESPN = {
  BRA: "bra.1",
  CDB: "bra.copa_do_brazil",
  LIB: "conmebol.libertadores",
  SUL: "conmebol.sudamericana",
  "bra.1": "bra.1",
  "bra.copa_do_brazil": "bra.copa_do_brazil",
  "conmebol.libertadores": "conmebol.libertadores",
  "conmebol.sudamericana": "conmebol.sudamericana",
};

function resolveLiga(m){
  if(m.liga) return m.liga;
  const code = m.competition?.code || m.competition?.name || "";
  if(LIGA_ESPN[code]) return LIGA_ESPN[code];
  const upper = String(code).toUpperCase();
  if(LIGA_ESPN[upper]) return LIGA_ESPN[upper];
  // fallback comum para o Brasileirão
  if(/brasil|serie\s*a|bra\.?1/i.test(String(m.competition?.name || ""))) return "bra.1";
  return null;
}

function parseEspnSummary(data){
  const competition = data?.header?.competitions?.[0] || {};
  const venue = competition.venue || data?.gameInfo?.venue || {};
  const broadcasts = [];
  (data?.broadcasts || competition.broadcasts || []).forEach(b => {
    if(typeof b === "string") broadcasts.push(b);
    else if(b?.names) broadcasts.push(...b.names);
    else if(b?.media?.shortName) broadcasts.push(b.media.shortName);
  });

  const lineups = (data?.rosters || []).map(rosterEntry => {
    const team = rosterEntry?.team || {};
    const players = (rosterEntry?.roster || []).map(p => {
      const athlete = p?.athlete || {};
      return {
        id: athlete.id || null,
        name: athlete.displayName || athlete.fullName || athlete.shortName || "—",
        shortName: athlete.shortName || athlete.displayName || "—",
        jersey: p?.jersey != null ? String(p.jersey) : null,
        position: p?.position?.abbreviation || p?.position?.name || null,
        formationPlace: p?.formationPlace != null ? Number(p.formationPlace) : null,
        starter: Boolean(p?.starter),
      };
    });
    return {
      teamId: team.id || null,
      teamName: team.displayName || team.name || "—",
      formation: rosterEntry?.formation || null,
      starters: players.filter(p => p.starter).sort((a,b) => (a.formationPlace ?? 99) - (b.formationPlace ?? 99)),
      bench: players.filter(p => !p.starter),
    };
  });

  return {
    success: true,
    venue: {
      name: venue.fullName || venue.displayName || null,
      city: venue.address?.city || venue.city || null,
    },
    broadcasts: [...new Set(broadcasts.filter(Boolean))],
    lineups,
    h2h: [],
  };
}

async function fetchMatchDetails(m){
  const liga = resolveLiga(m);
  const eventId = m.eventId || String(m.id || "").replace(/^[A-Z]+-/, "");

  // 1) Tenta a API própria (se existir no projeto)
  if(liga && eventId){
    try{
      const res = await fetch(`/api/jogo?event=${encodeURIComponent(eventId)}&liga=${encodeURIComponent(liga)}`);
      if(res.ok){
        const det = await res.json().catch(() => null);
        if(det && (det.lineups?.length || det.success)) return det;
      }
    }catch(_){ /* segue para fallback ESPN */ }
  }

  // 2) Fallback direto na ESPN (CORS liberado)
  if(!liga || !eventId) throw new Error("Jogo sem identificador ESPN (eventId/liga)");
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(liga)}/summary?event=${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if(!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = await res.json();
  return parseEspnSummary(data);
}

async function openMatch(id){
  const m = state.matches.find(x => x.id === id);
  if(!m) return;
  currentModalId = id;
  $("#matchModal").classList.remove("hidden");
  const body = $("#modalBody");

  const canFetch = m.source === "espn" && (m.eventId || m.id) && (m.liga || resolveLiga(m));
  if(!canFetch){ body.innerHTML = modalHTML(m, null, false); return; }
  if(detailCache.has(id)){ body.innerHTML = modalHTML(m, detailCache.get(id), false); return; }

  body.innerHTML = modalHTML(m, null, true);
  try{
    const det = await fetchMatchDetails(m);
    detailCache.set(id, det);
    if(currentModalId === id) body.innerHTML = modalHTML(m, det, false);
  }catch(err){
    if(currentModalId === id) body.innerHTML = modalHTML(m, { erro: err.message, lineups: [] }, false);
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
    if(on) el.removeAttribute("hidden"); else el.setAttribute("hidden","");
    el.style.display=on?"":"none";
  };
  calendarParts().forEach(el=>toggle(el,view==="calendar"));
  toggle($("#listView"),view==="list");
  toggle($("#standingsView"),view==="standings");
  toggle($("#performanceView"),view==="performance");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="standings") renderStandings();
  if(view==="performance") renderPerformance();
  window.scrollTo({top:0});
}

// ---------- Menu e tela de Aproveitamento ----------
function buildResponsiveSidebar(){
  const first = document.querySelector(".nav-item");
  const nav = first?.parentElement;
  if(nav){
    nav.classList.add("nav-scroll");
    nav.parentElement?.classList.add("app-sidebar-fix");
    // Sidebar = o ancestral do menu que está no mesmo nível do conteúdo principal
    const grid = $("#calendarGrid");
    let side = nav;
    while(side?.parentElement && grid && !side.parentElement.contains(grid)) side = side.parentElement;
    if(side && side !== document.body) side.classList.add("sidebar-sticky");
    if(!nav.querySelector('[data-view="performance"]')){
      const b = document.createElement("button");
      b.className = "nav-item"; b.dataset.view = "performance";
      b.textContent = "Aproveitamento";
      nav.appendChild(b);
    }
  }
  let sec = $("#performanceView");
  if(!sec){
    sec = document.createElement("section");
    sec.id = "performanceView";
    sec.innerHTML = `<div class="standings-heading"><h2>Aproveitamento por competição</h2></div>`;
  }
  if(!$("#performanceBody")){
    sec.insertAdjacentHTML("beforeend", `<div id="performanceBody" class="perf-grid"></div>`);
  }
  sec.classList.add("hidden"); sec.style.display = "none";
  // Fica logo depois da Classificação (que já aparece corretamente)
  const anchor = $("#standingsView") || $("#listView");
  if(anchor && anchor.nextElementSibling !== sec) anchor.insertAdjacentElement("afterend", sec);
  else if(!sec.parentElement) document.body.appendChild(sec);
}

// ---------- Inicialização ----------
injectStyles();
buildResponsiveSidebar();
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