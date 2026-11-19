// Vercel Serverless Function — proxy seguro para API-Football (v3.football.api-sports.io)
const BASE = "https://v3.football.api-sports.io";

const STATUS_MAP = {
  TBD: "SCHEDULED",
  NS: "TIMED",
  "1H": "IN_PLAY",
  HT: "PAUSED",
  "2H": "IN_PLAY",
  ET: "IN_PLAY",
  BT: "PAUSED",
  P: "IN_PLAY",
  SUSP: "SUSPENDED",
  INT: "SUSPENDED",
  FT: "FINISHED",
  AET: "FINISHED",
  PEN: "FINISHED",
  PST: "POSTPONED",
  CANC: "CANCELLED",
  ABD: "CANCELLED",
  AWD: "AWARDED",
  WO: "AWARDED"
};

export default async function handler(req, res) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return res.status(500).json({ error: "Configure a variável API_FOOTBALL_KEY na Vercel." });
  }

  const q = req.query || {};
  // 1062 é o ID oficial do Atlético-MG na API-Football
  const teamId = /^\d+$/.test(String(q.id || "")) ? String(q.id) : "1062";
  const season = /^\d{4}$/.test(String(q.season || ""))
    ? String(q.season)
    : String(new Date().getFullYear());

  try {
    const response = await fetch(`${BASE}/fixtures?team=${teamId}&season=${season}`, {
      headers: {
        "x-apisports-key": key,
        "Accept": "application/json"
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = typeof data.errors === "object"
        ? Object.values(data.errors).join(" | ")
        : `A API-Football retornou HTTP ${response.status}.`;
      return res.status(response.status || 400).json({ error: errMsg });
    }

    // Normaliza o retorno da API-Football para o padrão do frontend
    const matches = (data.response || []).map((item) => {
      const f = item.fixture || {};
      const l = item.league || {};
      const t = item.teams || {};
      const g = item.goals || {};

      return {
        id: f.id,
        utcDate: f.date,
        status: STATUS_MAP[f.status?.short] || "SCHEDULED",
        homeTeam: {
          name: t.home?.name || "Mandante",
          shortName: t.home?.name || "Mandante",
          crest: t.home?.logo || null
        },
        awayTeam: {
          name: t.away?.name || "Visitante",
          shortName: t.away?.name || "Visitante",
          crest: t.away?.logo || null
        },
        competition: {
          name: l.name || "Competição",
          code: `LIGA-${l.id || "0"}`
        },
        venue: f.venue?.name || "Estádio a confirmar",
        score: {
          fullTime: {
            home: g.home ?? null,
            away: g.away ?? null
          }
        }
      };
    });

    // Cache de 15 minutos na borda da Vercel para economizar a cota gratuita de 100 req/dia
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    return res.status(200).json({ matches });
  } catch (error) {
    return res.status(502).json({ error: "Não foi possível conectar à API-Football." });
  }
}