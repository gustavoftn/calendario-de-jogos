// Vercel Serverless Function — proxy seguro para football-data.org v4
// Configure FOOTBALL_DATA_KEY em Vercel > Settings > Environment Variables.
const BASE = "https://api.football-data.org/v4";

export default async function handler(req, res) {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) return res.status(500).json({ error: "Configure a variável FOOTBALL_DATA_KEY na Vercel." });

  const q = req.query || {};
  const type = String(q.type || "");
  const comp = String(q.comp || "BSA");
  const id = String(q.id || "");
  const allowed = {
    season: /^\d{4}$/,
    dateFrom: /^\d{4}-\d{2}-\d{2}$/,
    dateTo: /^\d{4}-\d{2}-\d{2}$/,
    status: /^[A-Z_,]+$/,
    venue: /^(HOME|AWAY)$/,
    limit: /^\d{1,3}$/
  };
  const qs = new URLSearchParams();
  for (const [name, pattern] of Object.entries(allowed)) {
    if (q[name] && pattern.test(String(q[name]))) qs.set(name, String(q[name]));
  }

  let path;
  if (type === "teams") {
    if (!/^[A-Z0-9]{2,5}$/.test(comp)) return res.status(400).json({ error: "Código de competição inválido." });
    path = `competitions/${comp}/teams`;
  } else if (type === "teamMatches") {
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "ID do clube inválido." });
    path = `teams/${id}/matches`;
    if (!qs.has("limit")) qs.set("limit", "500");
  } else {
    return res.status(400).json({ error: "Tipo de consulta não permitido." });
  }

  try {
    const response = await fetch(`${BASE}/${path}${qs.toString() ? `?${qs}` : ""}`, {
      headers: { "X-Auth-Token": key, "Accept": "application/json" }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 429
        ? "Limite de requisições da API atingido. Aguarde um pouco e tente novamente."
        : response.status === 403
          ? "Sua chave não tem permissão para consultar esta competição ou recurso."
          : data.message || `A football-data.org retornou HTTP ${response.status}.`;
      return res.status(response.status).json({ error: message, apiMessage: data.message || null });
    }
    res.setHeader("Cache-Control", `public, s-maxage=${type === "teamMatches" ? 180 : 900}, stale-while-revalidate=1800`);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Não foi possível conectar à football-data.org." });
  }
};
