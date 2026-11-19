const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const LIGAS = [
  { nome: "Brasileirão Série A", sigla: "BRA", codigo: "bra.1" },
  { nome: "Copa do Brasil", sigla: "CDB", codigo: "bra.copa_do_brazil" },
  { nome: "Copa Libertadores", sigla: "LIB", codigo: "conmebol.libertadores" },
  { nome: "Copa Sul-Americana", sigla: "SUL", codigo: "conmebol.sudamericana" },
];

const norm = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const ehGalo = (t) =>
  [t?.displayName, t?.shortDisplayName, t?.name, t?.location].some((n) =>
    /atletico[\s-]*(mg|mineiro)/.test(norm(n))
  );

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function mapStatus(tipo) {
  const mapa = {
    STATUS_SCHEDULED: "TIMED",
    STATUS_IN_PROGRESS: "IN_PLAY",
    STATUS_FIRST_HALF: "IN_PLAY",
    STATUS_SECOND_HALF: "IN_PLAY",
    STATUS_EXTRA_TIME: "IN_PLAY",
    STATUS_HALFTIME: "PAUSED",
    STATUS_FINAL: "FINISHED",
    STATUS_FULL_TIME: "FINISHED",
    STATUS_FINAL_AET: "FINISHED",
    STATUS_FINAL_PEN: "FINISHED",
    STATUS_POSTPONED: "POSTPONED",
    STATUS_SUSPENDED: "SUSPENDED",
    STATUS_CANCELED: "CANCELLED",
    STATUS_ABANDONED: "CANCELLED",
  };
  if (mapa[tipo?.name]) return mapa[tipo.name];
  if (tipo?.state === "post") return "FINISHED";
  if (tipo?.state === "in") return "IN_PLAY";
  return "SCHEDULED";
}

// O placar pode vir como número, texto ou objeto { value, displayValue }
function lerGols(score) {
  if (score == null) return null;
  const v = typeof score === "object" ? score.value ?? score.displayValue : score;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const logo = (t) => t?.logo || t?.logos?.[0]?.href || null;

const time = (c) => ({
  name: c?.team?.displayName,
  shortName: c?.team?.shortDisplayName || c?.team?.displayName,
  crest: logo(c?.team),
});

module.exports = async function handler(req, res) {
  const errors = [];
  const avisos = [];
  let matches = [];
  let crest = null;
  let teamId = null;

  try {
    // 1) Descobre o ID do Atlético-MG na ESPN
    const lista = await getJson(`${BASE}/bra.1/teams`);
    const times = (lista.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team);
    const galo = times.find(ehGalo);
    if (!galo) throw new Error("Atlético-MG não encontrado na lista de times da ESPN");
    teamId = galo.id;
    crest = logo(galo);

    // 2) Agenda do Galo em cada competição
    const resultados = await Promise.allSettled(
      LIGAS.map(async (liga) => {
        const json = await getJson(`${BASE}/${liga.codigo}/teams/${teamId}/schedule`);
        return (json.events || []).map((e) => {
          const comp = e.competitions?.[0] || {};
          const casa = comp.competitors?.find((c) => c.homeAway === "home");
          const fora = comp.competitors?.find((c) => c.homeAway === "away");
          const tipo = comp.status?.type || e.status?.type;
          const comPlacar = tipo?.state !== "pre";

          return {
            id: `espn-${e.id}`,
            utcDate: new Date(e.date || comp.date).toISOString(),
            status: mapStatus(tipo),
            homeTeam: time(casa),
            awayTeam: time(fora),
            competition: { name: liga.nome, code: liga.sigla },
            venue: comp.venue?.fullName || "Estádio a confirmar",
            score: {
              fullTime: {
                home: comPlacar ? lerGols(casa?.score) : null,
                away: comPlacar ? lerGols(fora?.score) : null,
              },
            },
            source: "espn",
          };
        });
      })
    );

    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") {
        matches.push(...r.value);
      } else {
        const msg = `${LIGAS[i].nome}: ${r.reason?.message || "falha"}`;
        // O Galo pode não disputar uma competição neste ano: só o Brasileirão é erro de verdade
        (i === 0 ? errors : avisos).push(msg);
      }
    });
  } catch (e) {
    errors.push(e.message);
  }

  const vistos = new Set();
  matches = matches
    .filter((m) => (vistos.has(m.id) ? false : vistos.add(m.id)))
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ matches, errors, avisos, crest, teamId });
};