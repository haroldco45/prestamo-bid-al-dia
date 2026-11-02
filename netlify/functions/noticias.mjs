// Búsqueda en vivo propia de Préstamo BID al Día (Netlify Function).
// Lee Google Noticias desde el servidor, sin intermediarios de terceros.
export default async (req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (!q) return new Response("Falta q", { status: 400 });
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; VibrasPositivasHM/1.0)" } });
    const xml = await r.text();
    return new Response(xml, {
      status: r.ok ? 200 : 502,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (e) {
    return new Response("Error", { status: 502 });
  }
};
