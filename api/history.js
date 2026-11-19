// Vercel Serverless Function — histórico H2H via football-data.org v4.
// Configure FOOTBALL_DATA_KEY nas Environment Variables da Vercel.
const BASE = "https://api.football-data.org/v4";
const COMPETITION = "BSA"; // Campeonato Brasileiro Série A

function normalize(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const aliases = new Map([
  ["atletico mg", "atletico mineiro"], ["atletico-mg", "atletico mineiro"],
  ["atletico mineiro", "atletico mineiro"], ["clube atletico mineiro", "atletico mineiro"],
  ["ca mineiro", "atletico mineiro"], ["galo", "atletico mineiro"],
  ["cruzeiro ec", "cruzeiro"], ["cruzeiro esporte clube", "cruzeiro"],
  ["sao paulo fc", "sao paulo"], ["sao paulo futebol clube", "sao paulo"],
  ["sc corinthians paulista", "corinthians"], ["corinthians paulista", "corinthians"],
  ["sociedade esportiva palmeiras", "palmeiras"], ["se palmeiras", "palmeiras"],
  ["clube de regatas do flamengo", "flamengo"], ["cr flamengo", "flamengo"],
  ["gremio fbpa", "gremio"], ["gremio foot ball porto alegrense", "gremio"],
  ["sc internacional", "internacional"], ["sport club internacional", "internacional"],
  ["athletico paranaense", "athletico paranaense"], ["club athletico paranaense", "athletico paranaense"],
  ["red bull bragantino", "bragantino"], ["rb bragantino", "bragantino"],
  ["botafogo fr", "botafogo"], ["botafogo de futebol e regatas", "botafogo"],
  ["ec bahia", "bahia"], ["esporte clube bahia", "bahia"],
  ["fortaleza ec", "fortaleza"], ["fortaleza esporte clube", "fortaleza"],
  ["fluminense fc", "fluminense"], ["fluminense football club", "fluminense"],
  ["santos fc", "santos"], ["santos futebol clube", "santos"],
  ["ec vitoria", "vitoria"], ["esporte clube vitoria", "vitoria"],
  ["vasco da gama", "vasco"], ["cr vasco da gama", "vasco"]
]);

function teamKey(name) {
  const key = normalize(name);
  return aliases.get(key) || key
    .replace(/^clube de futebol /, "")
    .replace(/^clube /, "")
    .replace(/^fc /, "")
    .replace(/^sc /, "");
}

async function request(path, token) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": token, "User-Agent": "Galo-Calendario/1.0" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.error || `football-data.org respondeu HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function parseHistory(payload, fixture, homeName, awayName) {
  const h2h = payload.head2head || payload.aggregates || payload;
  const fixtureHomeKey = teamKey(fixture.homeTeam?.name);
  const targetHomeIsFixtureHome = fixtureHomeKey === teamKey(homeName);
  const fixtureHome = h2h.homeTeam || {};
  const fixtureAway = h2h.awayTeam || {};
  const targetHome = targetHomeIsFixtureHome ? fixtureHome : fixtureAway;
  const targetAway = targetHomeIsFixtureHome ? fixtureAway : fixtureHome;
  const matches = (payload.matches || h2h.matches || []).map(item => ({
    utcDate: item.utcDate,
    homeTeam: item.homeTeam?.shortName || item.homeTeam?.name || "—",
    awayTeam: item.awayTeam?.shortName || item.awayTeam?.name || "—",
    homeGoals: item.score?.fullTime?.home ?? item.score?.regularTime?.home ?? null,
    awayGoals: item.score?.fullTime?.away ?? item.score?.regularTime?.away ?? null
  })).filter(item => item.utcDate);
  const totalMatches = h2h.numberOfMatches ?? payload.resultSet?.count ?? matches.length;
  const draws = targetHome.draws ?? targetAway.draws ?? 0;
  return {
    source: "football-data.org",
    totalMatches,
    totalGoals: h2h.totalGoals ?? null,
    stats: {
      homeWins: targetHome.wins ?? null,
      draws,
      awayWins: targetAway.wins ?? null
    },
    matches
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });
  const token = process.env.FOOTBALL_DATA_KEY || process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return res.status(500).json({ error: "Configure FOOTBALL_DATA_KEY nas variáveis de ambiente da Vercel." });

  const home = String(req.query.home || "").trim();
  const away = String(req.query.away || "").trim();
  const date = String(req.query.date || "").trim();
  if (!home || !away) return res.status(400).json({ error: "Informe os nomes das duas equipes." });

  try {
    const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : new Date().getFullYear();
    let fixture = null;
    let lastError = null;

    // O Brasileirão Série A é gratuito. Procuramos a partida entre os clubes na temporada
    // correspondente e, se necessário, na anterior para obter o ID que habilita o H2H.
    for (const season of [year, year - 1]) {
      try {
        const seasonData = await request(`/competitions/${COMPETITION}/matches?season=${season}`, token);
        const candidates = (seasonData.matches || []).filter(match => {
          const a = teamKey(match.homeTeam?.name), b = teamKey(match.awayTeam?.name);
          const wanted = [teamKey(home), teamKey(away)].sort();
          return [a, b].sort().every((value, index) => value === wanted[index]);
        });
        if (candidates.length) {
          candidates.sort((a, b) => Math.abs(new Date(a.utcDate) - new Date(date || Date.now())) - Math.abs(new Date(b.utcDate) - new Date(date || Date.now())));
          fixture = candidates[0];
          break;
        }
      } catch (error) {
        lastError = error;
        if (error.status === 403 || error.status === 429) throw error;
      }
    }

    if (!fixture) {
      res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
      return res.status(200).json({
        source: "football-data.org",
        message: lastError ? `Não foi possível localizar a partida-base: ${lastError.message}` : "Não foi encontrado um confronto entre essas equipes nas temporadas disponíveis do Brasileirão Série A."
      });
    }

    const h2h = await request(`/matches/${fixture.id}/head2head?limit=10`, token);
    const result = parseHistory(h2h, fixture, home, away);
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200");
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status === 403 ? 200 : error.status === 429 ? 429 : 502;
    const message = error.status === 403
      ? "O football-data.org não liberou o histórico H2H no plano/chave atual. Os jogos e resultados do Brasileirão podem continuar disponíveis, mas o endpoint de histórico está restrito."
      : error.status === 429
        ? "Limite de requisições do football-data.org atingido. Aguarde um minuto e tente novamente."
        : `Falha ao consultar football-data.org: ${error.message}`;
    return res.status(status).json({ source: "football-data.org", message });
  }
};
