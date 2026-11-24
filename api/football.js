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

async function getStandings() {
  try {
    let data;
    try {
      data = await getJson("https://site.web.api.espn.com/apis/v2/sports/soccer/bra.1/standings");
    } catch (_) {
      data = await getJson(`${BASE}/bra.1/standings`);
    }

    const entries =
      data.children?.[0]?.standings?.entries ||
      data.children?.flatMap((child) => child.standings?.entries || []) ||
      data.standings?.entries ||
      [];

    const standings = entries.map((entry) => {
      const stats = Object.fromEntries(
        (entry.stats || []).map((stat) => [stat.name || stat.abbreviation, stat.value])
      );

      const team = entry.team || {};

      return {
        rank: entry.stats?.find((stat) => stat.name === "rank")?.value || entry.rank || null,
        name: team.displayName || team.name || "",
        shortName: team.shortDisplayName || team.shortName || team.abbreviation || "",
        crest: logo(team),
        points: Number(stats.points ?? stats.PTS ?? 0),
        played: Number(stats.gamesPlayed ?? stats.played ?? stats.P ?? 0),
        wins: Number(stats.wins ?? stats.W ?? 0),
        draws: Number(stats.ties ?? stats.draws ?? stats.D ?? 0),
        losses: Number(stats.losses ?? stats.L ?? 0),
        goalsFor: Number(stats.pointsFor ?? stats.goalsFor ?? stats["points-for"] ?? 0),
        goalsAgainst: Number(stats.pointsAgainst ?? stats.goalsAgainst ?? stats["points-against"] ?? 0),
        goalDifference: Number(stats.pointDifferential ?? stats.goalDifference ?? stats["points-differential"] ?? 0),
      };
    }).filter((club) => club.name);

    standings.sort((a, b) => (a.rank || 999) - (b.rank || 999));
    return standings;
  } catch (error) {
    return [];
  }
}

async function getRoundMatches() {
  const data = await getJson("https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?limit=100");
  const events = data.events || [];

  const matches = events
    .filter((event) => {
      const status = event.status?.type?.name;
      return ["STATUS_SCHEDULED", "STATUS_TIMED"].includes(status) ||
        event.status?.type?.state === "pre";
    })
    .map((event) => {
      const competition = event.competitions?.[0] || {};
      const home = competition.competitors?.find((competitor) => competitor.homeAway === "home");
      const away = competition.competitors?.find((competitor) => competitor.homeAway === "away");

      return {
        id: `round-${event.id}`,
        utcDate: event.date || competition.date,
        homeTeam: time(home),
        awayTeam: time(away),
        competition: { name: "Brasileirão Série A", code: "BRA" },
        status: "TIMED"
      };
    })
    .filter((match) => match.homeTeam.name && match.awayTeam.name);

  return matches;
}

async function getLeagueFixtures(teamId) {
  const teamsData = await getJson(`${BASE}/bra.1/teams`);
  const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams || [];

  const scheduleResults = await Promise.allSettled(
    teams.map(async (entry) => {
      const id = entry.team?.id;
      if (!id) return [];

      const data = await getJson(`${BASE}/bra.1/teams/${id}/schedule?season=2026`);
      return data.events || [];
    })
  );

  const unique = new Map();

  scheduleResults.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((event) => unique.set(String(event.id), event));
  });

  const galoSchedule = teams.find((entry) => ehGalo(entry.team));
  let galoDates = [];

  if (galoSchedule?.team?.id) {
    const galoResult = await getJson(`${BASE}/bra.1/teams/${galoSchedule.team.id}/schedule?season=2026`);

    galoDates = [...new Set(
      (galoResult.events || [])
        .map((event) => event.date?.slice(0, 10))
        .filter(Boolean)
    )].sort();
  }

  const fixtures = [...unique.values()].map((event) => {
    const competition = event.competitions?.[0] || {};
    const home = competition.competitors?.find((competitor) => competitor.homeAway === "home");
    const away = competition.competitors?.find((competitor) => competitor.homeAway === "away");

    const status = mapStatus(competition.status?.type || event.status?.type);
    const date = event.date || competition.date;

    let round = null;

    if (galoDates.length) {
      const exact = galoDates.findIndex((day) => day === date?.slice(0, 10));

      if (exact >= 0) {
        round = exact + 1;
      } else {
        const timestamp = new Date(date).getTime();
        let nearest = 0;
        let distance = Infinity;

        galoDates.forEach((day, index) => {
          const diff = Math.abs(
            new Date(`${day}T12:00:00Z`).getTime() - timestamp
          );

          if (diff < distance) {
            distance = diff;
            nearest = index;
          }
        });

        round = nearest + 1;
      }
    }

    return {
      id: `league-${event.id}`,
      eventId: String(event.id),
      round,
      utcDate: date ? new Date(date).toISOString() : null,
      status,
      homeTeam: time(home),
      awayTeam: time(away),
      competition: { name: "Brasileirão Série A", code: "BRA" },
      venue: competition.venue?.fullName || "Estádio a confirmar",
      score: {
        fullTime: {
          home: status === "FINISHED" ? lerGols(home?.score) : null,
          away: status === "FINISHED" ? lerGols(away?.score) : null
        }
      },
      source: "espn"
    };
  }).filter((fixture) =>
    fixture.utcDate &&
    fixture.homeTeam.name &&
    fixture.awayTeam.name
  ).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  return fixtures;
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

  const v = typeof score === "object"
    ? score.value ?? score.displayValue
    : score;

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
  let standings = [];
  let roundMatches = [];
  let fixtures = [];

  try {
    // 1) Descobre o ID do Atlético-MG na ESPN
    const lista = await getJson(`${BASE}/bra.1/teams`);
    const times = (lista.sports?.[0]?.leagues?.[0]?.teams || [])
      .map((t) => t.team);

    const galo = times.find(ehGalo);

    if (!galo) {
      throw new Error("Atlético-MG não encontrado na lista de times da ESPN");
    }

    teamId = galo.id;
    crest = logo(galo);

    standings = await getStandings();

    try {
      roundMatches = await getRoundMatches();
    } catch (_) {
      roundMatches = [];
    }

    // Todos os jogos da Série A, com número da rodada (usado no simulador)
    try {
      fixtures = await getLeagueFixtures();
    } catch (e) {
      fixtures = [];
      avisos.push(`Rodadas: ${e.message || "falha ao carregar"}`);
    }

    // Se a ESPN não enviou gols marcados, soma a partir dos jogos finalizados
    if (fixtures.length && standings.length && standings.every((c) => !c.goalsFor)) {
      const gf = new Map();
      fixtures.filter((f) => f.status === "FINISHED").forEach((f) => {
        const h = norm(f.homeTeam.name), a = norm(f.awayTeam.name);
        gf.set(h, (gf.get(h) || 0) + (f.score.fullTime.home || 0));
        gf.set(a, (gf.get(a) || 0) + (f.score.fullTime.away || 0));
      });
      standings.forEach((c) => { c.goalsFor = gf.get(norm(c.name)) || 0; });
    }

    // 2) Agenda do Galo em cada competição
    const resultados = await Promise.allSettled(
      LIGAS.map(async (liga) => {
        const base = `${BASE}/${liga.codigo}/teams/${teamId}/schedule`;

        const [passados, futuros] = await Promise.allSettled([
          getJson(base),
          getJson(`${base}?fixture=true`),
        ]);

        if (passados.status === "rejected" && futuros.status === "rejected") {
          throw passados.reason;
        }

        const eventos = [
          ...(passados.status === "fulfilled" ? passados.value.events || [] : []),
          ...(futuros.status === "fulfilled" ? futuros.value.events || [] : []),
        ];

        return eventos.map((event) => {
          const competition = event.competitions?.[0] || {};
          const home = competition.competitors?.find((c) => c.homeAway === "home");
          const away = competition.competitors?.find((c) => c.homeAway === "away");
          const status = mapStatus(competition.status?.type || event.status?.type);

          return {
            id: `${liga.sigla}-${event.id}`,
            eventId: String(event.id),
            utcDate: event.date || competition.date,
            status,
            homeTeam: time(home),
            awayTeam: time(away),
            competition: { name: liga.nome, code: liga.sigla },
            venue: competition.venue?.fullName || "Estádio a confirmar",
            score: {
              fullTime: {
                home: status === "FINISHED" ? lerGols(home?.score) : null,
                away: status === "FINISHED" ? lerGols(away?.score) : null
              }
            },
            source: "espn"
          };
        });
      })
    );

    resultados.forEach((resultado, index) => {
      if (resultado.status === "fulfilled") {
        matches.push(...resultado.value);
      } else {
        const msg = `${LIGAS[index].nome}: ${resultado.reason?.message || "Erro ao buscar agenda"}`;
        // O Galo pode não disputar uma competição neste ano: só o Brasileirão é erro de verdade
        (index === 0 ? errors : avisos).push(msg);
      }
    });

    // 3) Remove jogos duplicados
    const unique = new Map();

    matches.forEach((match) => {
      unique.set(
        `${match.competition.code}-${match.eventId}`,
        match
      );
    });

    matches = [...unique.values()].sort(
      (a, b) => new Date(a.utcDate) - new Date(b.utcDate)
    );

    // 4) Retorna os dados
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      success: true,
      team: {
        id: teamId,
        name: galo.displayName || galo.name,
        crest
      },
      crest,
      teamId,
      matches,
      standings,
      roundMatches,
      fixtures,
      errors,
      avisos
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao carregar dados do futebol",
      matches,
      standings,
      roundMatches,
      fixtures,
      errors,
      avisos
    });
  }
};