// Robot de Préstamo BID al Día — Vibras Positivas HM
// Corre en GitHub Actions cada 30 minutos. Trae noticias reales del caso
// (Google News + Bing News), sus fotos (og:image), videos de YouTube y
// fotos de referencia de Wikipedia. Guarda todo en data/noticias.json.
// Node 20+, sin dependencias.

import { readFile, writeFile } from "node:fs/promises";

const ARCHIVO = new URL("../data/noticias.json", import.meta.url);
const MAX_ITEMS = 150;
const UA = "Mozilla/5.0 (compatible; VibrasPositivasHM-Robot/1.0; +https://vibraspositivashm.com)";

const CONSULTAS = [
  "Siemplea",
  "CualifiCO Ministerio del Trabajo",
  "Sanguino préstamo BID",
  "préstamo BID Ministerio del Trabajo",
  "elefante blanco Mintrabajo",
  "Siemplea Fiscalía",
  "Siemplea Contraloría",
  "Siemplea Procuraduría",
];

// Una noticia entra solo si habla del caso.
const CLAVES_FUERTES = ["siemplea", "cualifico", "4934/oc-co"];
function esDelCaso(texto) {
  const t = texto.toLowerCase();
  if (CLAVES_FUERTES.some((k) => t.includes(k))) return true;
  const bid = /\bbid\b|banco interamericano/.test(t);
  const trabajo = /mintrabajo|ministerio del trabajo|ministerio de trabajo|sanguino/.test(t);
  const lio = /elefante blanco|denuncia|fiscal|contralor|procurad|préstamo|prestamo|crédito|credito|azure/.test(t);
  return (bid && trabajo) || (t.includes("sanguino") && lio && (bid || t.includes("plataforma")));
}

async function traer(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return { texto: await r.text(), url: r.url };
  } finally {
    clearTimeout(timer);
  }
}

const decodificar = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const etiqueta = (bloque, tag) => {
  const m = bloque.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
};

function parsearRss(xml, origen) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    let titulo = decodificar(etiqueta(b, "title"));
    let enlace = decodificar(etiqueta(b, "link"));
    let fuente = decodificar(etiqueta(b, "source")) || decodificar(etiqueta(b, "News:Source"));
    const fecha = decodificar(etiqueta(b, "pubDate"));
    const resumen = decodificar(etiqueta(b, "description")).slice(0, 280);
    let imagen = decodificar(etiqueta(b, "News:Image"));
    if (origen === "google" && fuente && titulo.endsWith(" - " + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    if (origen === "bing") {
      try { const u = new URL(enlace); if (u.searchParams.get("url")) enlace = u.searchParams.get("url"); } catch {}
      if (imagen && imagen.startsWith("/")) imagen = "https://www.bing.com" + imagen;
      if (!fuente) { try { fuente = new URL(enlace).hostname.replace(/^www\./, ""); } catch {} }
    }
    if (!titulo || !enlace) continue;
    const d = new Date(fecha);
    items.push({
      titulo, enlace, fuente: fuente || "Prensa",
      fecha: isNaN(d) ? new Date().toISOString() : d.toISOString(),
      imagen: imagen || "",
      resumen: origen === "google" ? "" : resumen,
    });
  }
  return items;
}

async function buscarNoticias() {
  const todas = [];
  for (const q of CONSULTAS) {
    const enc = encodeURIComponent(q);
    const fuentes = [
      ["google", `https://news.google.com/rss/search?q=${enc}&hl=es-419&gl=CO&ceid=CO:es-419`],
      ["bing", `https://www.bing.com/news/search?q=${enc}&format=rss&setlang=es&cc=CO`],
    ];
    for (const [origen, url] of fuentes) {
      try {
        const { texto } = await traer(url);
        todas.push(...parsearRss(texto, origen));
      } catch (e) { console.log(`  [aviso] ${origen} "${q}": ${e.message}`); }
    }
  }
  return todas.filter((n) => esDelCaso(`${n.titulo} ${n.resumen}`));
}

async function fotoDeArticulo(url) {
  if (!url || url.includes("news.google.com")) return "";
  try {
    const { texto, url: final } = await traer(url, 9000);
    const m = texto.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i)
      || texto.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? new URL(decodificar(m[1]), final).href : "";
  } catch { return ""; }
}

async function buscarVideos() {
  const vistos = new Set(); const videos = [];
  for (const q of ["Siemplea Ministerio del Trabajo", "Sanguino préstamo BID Siemplea", "elefante blanco Mintrabajo BID"]) {
    try {
      const { texto } = await traer(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D`);
      for (const m of texto.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,1500}?"title":\{"runs":\[\{"text":"([^"]+)"/g)) {
        const [, id, titulo] = m;
        const t = titulo.toLowerCase();
        const sirve = esDelCaso(titulo) || t.includes("siemplea") || (t.includes("sanguino") && /bid|préstamo|prestamo|elefante|denuncia/.test(t));
        if (vistos.has(id) || !sirve) continue;
        vistos.add(id); videos.push({ id, titulo: decodificar(titulo) });
        if (videos.length >= 6) return videos;
      }
    } catch (e) { console.log("  [aviso] YouTube:", e.message); }
  }
  return videos;
}

async function fotoWikipedia(pagina) {
  try {
    const { texto } = await traer(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pagina)}`);
    const j = JSON.parse(texto);
    return (j.originalimage || j.thumbnail || {}).source || "";
  } catch { return ""; }
}

const clave = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);

async function main() {
  const actual = JSON.parse(await readFile(ARCHIVO, "utf8"));
  console.log("Buscando noticias del caso…");
  const nuevas = await buscarNoticias();

  const mapa = new Map();
  for (const n of actual.items || []) mapa.set(clave(n.titulo), n);
  let agregadas = 0;
  for (const n of nuevas) {
    const k = clave(n.titulo);
    const previa = mapa.get(k);
    if (!previa) { mapa.set(k, n); agregadas++; }
    else {
      if (!previa.imagen && n.imagen) previa.imagen = n.imagen;
      if (!previa.resumen && n.resumen) previa.resumen = n.resumen;
      if (previa.enlace.includes("news.google.com") && !n.enlace.includes("news.google.com")) previa.enlace = n.enlace;
    }
  }

  let items = [...mapa.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, MAX_ITEMS);

  // Fotos reales de los artículos (máx. 20 por corrida)
  let fotos = 0;
  for (const n of items) {
    if (n.imagen || fotos >= 20) continue;
    fotos++;
    n.imagen = await fotoDeArticulo(n.enlace);
  }

  const videos = await buscarVideos();
  const fotosRef = { ...(actual.fotos || {}) };
  for (const [k, pag] of [["bid", "Banco_Interamericano_de_Desarrollo"], ["mintrabajo", "Ministerio_del_Trabajo_de_Colombia"], ["fiscalia", "Fiscalía_General_de_la_Nación_(Colombia)"], ["bogota", "Bogotá"]]) {
    const f = await fotoWikipedia(pag);
    if (f) fotosRef[k] = f;
  }

  const salida = {
    actualizado: new Date().toISOString(),
    items,
    videos: videos.length ? videos : actual.videos || [],
    fotos: fotosRef,
  };
  await writeFile(ARCHIVO, JSON.stringify(salida, null, 2) + "\n");
  console.log(`Listo: ${items.length} noticias (${agregadas} nuevas), ${salida.videos.length} videos.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
