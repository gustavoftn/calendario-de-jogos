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

const time = (c) => ({
  name: c?.team?.displayName,
  shortName: c?.team?.shortDisplayName || c?.team?.displayName,
  crest: c?.team?.logo || null,
});

module.exports = async function handler(req, res) {
  const todos = req.query?.todos === "1"; // modo diagnóstico: não filtra por time
  const ano = new Date().getFullYear();
  const datas = `${ano}0101-${ano}1231`;
  let crest = null;

  const resultados = await Promise.allSettled(
    LIGAS.map(async (liga) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${liga.codigo}/scoreboard?dates=${datas}&limit=1000`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${liga.nome} (HTTP ${r.status})`);
      const json = await r.json();

      return (json.events || [])
        .map((e) => {
          const comp = e.competitions?.[0] || {};
          const casa = comp.competitors?.find((c) => c.homeAway === "home");
          const fora = comp.competitors?.find((c) => c.homeAway === "away");
          if (!todos && !ehGalo(casa?.team) && !ehGalo(fora?.team)) return null;

          if (!crest) {
            if (ehGalo(casa?.team)) crest = casa.team.logo;
            else if (ehGalo(fora?.team)) crest = fora.team.logo;
          }

          const tipo = e.status?.type;
          const comPlacar = tipo?.state !== "pre";
          const gols = (c) => (comPlacar && c?.score != null ? Number(c.score) : null);

          return {
            id: `espn-${e.id}`,
            utcDate: new Date(e.date).toISOString(),
            status: mapStatus(tipo),
            homeTeam: time(casa),
            awayTeam: time(fora),
            competition: { name: liga.nome, code: liga.sigla },
            venue: comp.venue?.fullName || "Estádio a confirmar",
            score: { fullTime: { home: gols(casa), away: gols(fora) } },
            source: "espn",
          };
        })
        .filter(Boolean);
    })
  );

  const matches = resultados
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  const errors = resultados
    .filter((r) => r.status === "rejected")
    .map((r) => String(r.reason?.message || r.reason));

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ matches, errors, crest });
};