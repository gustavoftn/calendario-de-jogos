const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function parsePlayer(p) {
  const athlete = p?.athlete || {};
  return {
    id: athlete.id || null,
    name: athlete.displayName || athlete.fullName || athlete.shortName || "—",
    shortName: athlete.shortName || athlete.displayName || "—",
    jersey: p?.jersey != null ? String(p.jersey) : null,
    position: p?.position?.abbreviation || p?.position?.name || null,
    formationPlace: p?.formationPlace != null ? Number(p.formationPlace) : null,
    starter: Boolean(p?.starter),
    subbedIn: typeof p?.subbedIn === "object" ? p.subbedIn?.didSub : Boolean(p?.subbedIn),
    subbedOut: typeof p?.subbedOut === "object" ? p.subbedOut?.didSub : Boolean(p?.subbedOut),
  };
}

function parseRoster(rosterEntry) {
  const team = rosterEntry?.team || {};
  const players = (rosterEntry?.roster || []).map(parsePlayer);
  const starters = players
    .filter((p) => p.starter)
    .sort((a, b) => (a.formationPlace ?? 99) - (b.formationPlace ?? 99));
  const bench = players.filter((p) => !p.starter);

  return {
    teamId: team.id || null,
    teamName: team.displayName || team.name || "—",
    formation: rosterEntry?.formation || null,
    starters,
    bench,
  };
}

function parseH2H(data) {
  // seasonseries ou lastFiveGames não são h2h real; ESPN às vezes manda em outros campos.
  // Mantemos vazio aqui — o frontend já faz fallback com os jogos da temporada.
  return [];
}

function parseBroadcasts(data) {
  const list = data?.broadcasts || data?.header?.competitions?.[0]?.broadcasts || [];
  const names = [];
  list.forEach((b) => {
    if (typeof b === "string") names.push(b);
    else if (b?.names) names.push(...b.names);
    else if (b?.media?.shortName) names.push(b.media.shortName);
    else if (b?.type?.shortName) names.push(b.type.shortName);
  });
  return [...new Set(names.filter(Boolean))];
}

module.exports = async function handler(req, res) {
  const event = String(req.query?.event || "").trim();
  const liga = String(req.query?.liga || "bra.1").trim();

  if (!event) {
    return res.status(400).json({ error: "Parâmetro event é obrigatório" });
  }

  try {
    const data = await getJson(`${BASE}/${liga}/summary?event=${encodeURIComponent(event)}`);

    const rosters = (data.rosters || []).map(parseRoster);
    const competition = data.header?.competitions?.[0] || {};
    const venue = competition.venue || data.gameInfo?.venue || {};

    const lineups = rosters.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      formation: r.formation,
      starters: r.starters,
      bench: r.bench,
    }));

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      success: true,
      eventId: event,
      liga,
      venue: {
        name: venue.fullName || venue.displayName || null,
        city: venue.address?.city || venue.city || null,
      },
      broadcasts: parseBroadcasts(data),
      lineups,
      h2h: parseH2H(data),
      // status bruto para debug eventual
      status: competition.status?.type?.name || data.header?.competitions?.[0]?.status?.type?.name || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao carregar detalhes do jogo",
      lineups: [],
      h2h: [],
      broadcasts: [],
    });
  }
};
