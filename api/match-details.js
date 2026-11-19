// Vercel Serverless Function — detalhes complementares de uma partida da ESPN.
// A ESPN é uma API pública não oficial; campos podem variar conforme a competição.
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`ESPN respondeu HTTP ${response.status}`);
  return response.json();
}

function findBroadcasts(root) {
  const found = [];
  const seen = new Set();
  const visit = (value, key = "") => {
    if (!value || typeof value !== "object") return;
    if (/broadcast/i.test(key)) {
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (typeof entry === "string") {
          if (!seen.has(entry)) { seen.add(entry); found.push(entry); }
          continue;
        }
        if (!entry || typeof entry !== "object") continue;
        const label = entry.name || entry.shortName || entry.displayName || entry.media?.name || entry.station?.name;
        if (label && !seen.has(label)) { seen.add(label); found.push(String(label)); }
        // Algumas respostas agrupam canais em names.
        if (Array.isArray(entry.names)) for (const name of entry.names) {
          const text = typeof name === "string" ? name : name?.name || name?.shortName;
          if (text && !seen.has(text)) { seen.add(text); found.push(String(text)); }
        }
      }
    }
    for (const [childKey, child] of Object.entries(value)) {
      if (child && typeof child === "object") visit(child, childKey);
    }
  };
  visit(root);
  return found;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });
  const event = String(req.query.event || "").trim();
  const league = String(req.query.league || "").trim();
  if (!/^\d+$/.test(event) || !/^[a-z0-9._-]+$/i.test(league)) {
    return res.status(400).json({ error: "Informe event e league válidos." });
  }

  try {
    const summary = await getJson(`${BASE}/${encodeURIComponent(league)}/summary?event=${encodeURIComponent(event)}`);
    const competition = summary.header?.competitions?.[0] || summary.boxscore?.players?.[0]?.team || {};
    const venue = competition.venue || summary.gameInfo?.venue || summary.header?.competitions?.[0]?.venue || {};
    const address = venue.address || {};
    const broadcasts = findBroadcasts(summary);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({
      eventId: event,
      venue: { name: venue.fullName || venue.name || null, city: address.city || venue.city || null, country: address.country || venue.country || null },
      venueName: venue.fullName || venue.name || null,
      city: address.city || venue.city || null,
      broadcasts
    });
  } catch (error) {
    return res.status(502).json({ error: `Não foi possível consultar os detalhes na ESPN: ${error.message}` });
  }
};
