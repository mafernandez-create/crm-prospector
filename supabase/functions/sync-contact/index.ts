// Supabase Edge Function: sync-contact
// -------------------------------------------------------------------------
// Empuja contactos del CRM a la agenda de iCloud vía CardDAV, de modo que
// iCloud los sincronice solos al iPhone y al Mac.
//
// ¿Por qué una Edge Function y no el proxy GAS? CardDAV necesita los métodos
// HTTP PROPFIND / REPORT para descubrir la libreta del usuario, y UrlFetchApp
// de Apps Script solo permite GET/POST/PUT/DELETE/PATCH. Deno (fetch) sí puede.
//
// Secretos requeridos (nunca en el cliente ni en git):
//   APPLE_ID            -> Apple ID (correo) de la cuenta iCloud destino
//   APPLE_APP_PASSWORD  -> contraseña de aplicación (appleid.apple.com), 16 letras
//
// Acciones (body JSON):
//   { "action": "test" }                      -> sube 1 contacto de prueba (paso 1)
//   { "action": "upsert", "studio": {...} }    -> crea/actualiza el contacto del estudio
//   { "action": "delete", "studio": {...} }    -> borra el contacto del estudio
//
// El estudio se pasa ya normalizado desde el cliente (detail.js): name, phone,
// email, web, address, city, province, type, team[].
// -------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CARDDAV_ROOT = "https://contacts.icloud.com";
const GROUP_NAME = "CRM GPF"; // grupo donde caen todos los contactos del CRM

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// --- Utilidades vCard --------------------------------------------------------

// Escapa un valor de propiedad vCard (RFC 6350): \ , ; y saltos de línea.
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// UID estable y determinista por estudio -> permite re-subir (upsert) y borrar.
function studioUid(studio: any): string {
  const id = studio?.id ?? studio?._id ?? studio?.studioId;
  if (!id) throw new Error("El estudio no tiene id; no puedo generar un UID estable.");
  return "crm-" + String(id);
}

// Construye el vCard 3.0 de un estudio (la ENTIDAD como contacto de organización).
function buildVCard(studio: any, uid: string): string {
  const name = studio.name || uid;
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//CRM GPF//sync-contact//ES",
    `UID:${esc(uid)}`,
    // Es una organización: N vacío estructurado + FN + ORG con el mismo nombre.
    `N:${esc(name)};;;;`,
    `FN:${esc(name)}`,
    `ORG:${esc(name)}`,
    "X-ABShowAs:COMPANY", // que Contactos lo muestre como empresa
  ];

  if (studio.type) {
    const t = Array.isArray(studio.type) ? studio.type[0] : studio.type;
    if (t) lines.push(`TITLE:${esc(t)}`);
  }
  if (studio.phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(studio.phone)}`);
  if (studio.email) lines.push(`EMAIL;TYPE=WORK,INTERNET:${esc(studio.email)}`);
  if (studio.web) lines.push(`URL:${esc(studio.web)}`);

  const street = studio.address || "";
  const city = studio.city || "";
  const region = studio.province || "";
  if (street || city || region) {
    // ADR: ;;street;city;region;postal;country
    lines.push(`ADR;TYPE=WORK:;;${esc(street)};${esc(city)};${esc(region)};;`);
  }

  // Personas del equipo como notas (contacto de agenda = la entidad).
  const team = Array.isArray(studio.team) ? studio.team : [];
  const people = team
    .filter((m: any) => m && (m.name || m.email || m.phone))
    .map((m: any) => {
      const bits = [m.name, m.role].filter(Boolean).join(" · ");
      const cd = [m.phone, m.email].filter(Boolean).join(" / ");
      return cd ? `${bits} — ${cd}` : bits;
    })
    .filter(Boolean);
  const noteParts: string[] = [];
  if (people.length) noteParts.push("Contactos:\n" + people.join("\n"));
  noteParts.push("— Sincronizado desde CRM GPF —");
  lines.push(`NOTE:${esc(noteParts.join("\n\n"))}`);

  lines.push(`CATEGORIES:${esc(GROUP_NAME)}`);
  lines.push("END:VCARD");

  // CRLF por RFC. (No plegamos líneas largas: iCloud lo tolera.)
  return lines.join("\r\n") + "\r\n";
}

// --- Cliente CardDAV (iCloud) ------------------------------------------------

interface DavCtx {
  authHeader: string;
  collectionUrl: string; // URL absoluta de la libreta de direcciones
}

function authHeaderFrom(appleId: string, appPassword: string): string {
  // La contraseña de app puede venir con guiones; iCloud la acepta igual, pero
  // limpiamos espacios accidentales.
  const pw = appPassword.replace(/\s+/g, "");
  return "Basic " + btoa(`${appleId}:${pw}`);
}

async function propfind(
  url: string,
  authHeader: string,
  depth: "0" | "1",
  body: string,
): Promise<{ status: number; text: string; finalUrl: string }> {
  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader,
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
    redirect: "follow",
  });
  const text = await res.text();
  return { status: res.status, text, finalUrl: res.url || url };
}

// Resuelve un href (posiblemente relativo) contra el origen de una URL base.
function resolveHref(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// Extrae el primer <href> que aparece dentro del primer elemento cuyo nombre
// local coincide con `localName` (ignora prefijos de namespace).
function firstHrefInside(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<[^>]*\\b${localName}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*\\b${localName}\\b[^>]*>`,
    "i",
  );
  const block = xml.match(re);
  const scope = block ? block[1] : xml;
  const href = scope.match(/<[^>]*href[^>]*>\s*([^<]+?)\s*<\/[^>]*href[^>]*>/i);
  return href ? href[1].trim() : null;
}

// Descubre la libreta de direcciones del usuario en iCloud.
async function discoverCollection(authHeader: string): Promise<string> {
  // 1) current-user-principal
  const p1 = await propfind(
    CARDDAV_ROOT,
    authHeader,
    "0",
    `<?xml version="1.0" encoding="UTF-8"?>
     <d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  );
  if (p1.status === 401) throw new Error("iCloud rechazó las credenciales (401). Revisa APPLE_ID y la contraseña de aplicación.");
  if (p1.status >= 400) throw new Error(`PROPFIND principal falló (${p1.status}): ${p1.text.slice(0, 300)}`);
  const principalHref = firstHrefInside(p1.text, "current-user-principal");
  if (!principalHref) throw new Error("No encontré current-user-principal en la respuesta de iCloud.");
  const principalUrl = resolveHref(principalHref, p1.finalUrl);

  // 2) addressbook-home-set (namespace carddav)
  const p2 = await propfind(
    principalUrl,
    authHeader,
    "0",
    `<?xml version="1.0" encoding="UTF-8"?>
     <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
       <d:prop><c:addressbook-home-set/></d:prop></d:propfind>`,
  );
  if (p2.status >= 400) throw new Error(`PROPFIND home-set falló (${p2.status}): ${p2.text.slice(0, 300)}`);
  const homeHref = firstHrefInside(p2.text, "addressbook-home-set");
  if (!homeHref) throw new Error("No encontré addressbook-home-set.");
  const homeUrl = resolveHref(homeHref, p2.finalUrl);

  // 3) Listar colecciones del home y elegir la primera que sea addressbook.
  const p3 = await propfind(
    homeUrl,
    authHeader,
    "1",
    `<?xml version="1.0" encoding="UTF-8"?>
     <d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`,
  );
  if (p3.status >= 400) throw new Error(`PROPFIND home listing falló (${p3.status}): ${p3.text.slice(0, 300)}`);

  // Trocea por <response> y quédate con la que tenga resourcetype addressbook.
  const responses = p3.text.split(/<[^>]*\bresponse\b[^>]*>/i).slice(1);
  for (const r of responses) {
    if (/addressbook/i.test(r)) {
      const hrefMatch = r.match(/<[^>]*href[^>]*>\s*([^<]+?)\s*<\/[^>]*href[^>]*>/i);
      if (hrefMatch) return resolveHref(hrefMatch[1].trim(), p3.finalUrl);
    }
  }
  // Fallback: el propio home suele ser usable como colección "card".
  throw new Error("No encontré ninguna libreta de direcciones (addressbook) en la cuenta.");
}

async function getCtx(): Promise<DavCtx> {
  const appleId = Deno.env.get("APPLE_ID");
  const appPassword = Deno.env.get("APPLE_APP_PASSWORD");
  if (!appleId || !appPassword) {
    throw new Error("Faltan los secretos APPLE_ID / APPLE_APP_PASSWORD en la función.");
  }
  const authHeader = authHeaderFrom(appleId, appPassword);
  const collectionUrl = await discoverCollection(authHeader);
  return { authHeader, collectionUrl };
}

function cardUrl(ctx: DavCtx, uid: string): string {
  const base = ctx.collectionUrl.endsWith("/") ? ctx.collectionUrl : ctx.collectionUrl + "/";
  return base + encodeURIComponent(uid) + ".vcf";
}

async function putCard(ctx: DavCtx, uid: string, vcard: string): Promise<void> {
  const res = await fetch(cardUrl(ctx, uid), {
    method: "PUT",
    headers: {
      Authorization: ctx.authHeader,
      "Content-Type": "text/vcard; charset=utf-8",
    },
    body: vcard,
  });
  if (res.status >= 400) {
    const t = await res.text();
    throw new Error(`PUT vCard falló (${res.status}): ${t.slice(0, 300)}`);
  }
}

async function deleteCard(ctx: DavCtx, uid: string): Promise<void> {
  const res = await fetch(cardUrl(ctx, uid), {
    method: "DELETE",
    headers: { Authorization: ctx.authHeader },
  });
  // 404 = ya no existe: lo tratamos como éxito idempotente.
  if (res.status >= 400 && res.status !== 404) {
    const t = await res.text();
    throw new Error(`DELETE vCard falló (${res.status}): ${t.slice(0, 300)}`);
  }
}

// --- Handler -----------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usa POST." }, 405);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  const action = payload?.action;

  try {
    const ctx = await getCtx();

    if (action === "test") {
      const uid = "crm-selftest";
      const testStudio = {
        id: "selftest",
        name: "CRM GPF · Contacto de prueba",
        type: "TEST",
        phone: "+34 600 000 000",
        email: "prueba@grupogpf.com",
        web: "https://ferroplast.es",
        address: "Calle de Prueba 1",
        city: "Málaga",
        province: "Málaga",
        team: [{ name: "Manolo Fernández", role: "Prescriptor", phone: "+34 600 000 001" }],
      };
      await putCard(ctx, uid, buildVCard(testStudio, uid));
      return json({ ok: true, action, uid, collection: ctx.collectionUrl });
    }

    if (action === "upsert") {
      const studio = payload.studio;
      if (!studio) return json({ error: "Falta 'studio'." }, 400);
      const uid = studioUid(studio);
      await putCard(ctx, uid, buildVCard(studio, uid));
      return json({ ok: true, action, uid });
    }

    if (action === "delete") {
      const studio = payload.studio;
      if (!studio) return json({ error: "Falta 'studio'." }, 400);
      const uid = studioUid(studio);
      await deleteCard(ctx, uid);
      return json({ ok: true, action, uid });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
