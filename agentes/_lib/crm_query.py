"""
crm_query.py v4 — Herramienta de consulta para los agentes del CRM.

Cambios v4 (jun-2026):
- Backend migrado de Firestore a **Supabase** (REST/PostgREST). Firestore quedó
  fuera de servicio. Credenciales por entorno (SUPABASE_URL +
  SUPABASE_SERVICE_ROLE_KEY) o fichero ~/.config/crm/supabase.env.
- `candidatos` devuelve n_informes/tiene_informe (para detectar cartera sin visitar).
- TIPO_MAP acepta los códigos canónicos de Supabase (ARQ/ING/CCRR/OCV/CICA/AAPP).

Cambios v3:
- Matching Plan v5 estricto: usa palabras clave unicas en vez de substring laxo.
- Etiqueta de subzona/grupo para agrupar entradas relacionadas (HIDRALIA, CR Blanca).
- Elimina falsos positivos (Arcoan Arquitectos, etc.).

USO:
    python3 crm_query.py [--accion ACCION] [--params JSON]

ACCIONES:
    stats             - estadisticas generales
    salud             - auditoria de calidad de datos
    foco              - universo de trabajo util (Plan v5 + Alta + en zona)
    candidatos        - lista filtrada de candidatos a visitar
    ultimo_contacto   - fecha del ultimo contacto y dias transcurridos, por studio
    studio            - detalle completo de un studio por ID
    kpis              - calcula KPIs YTD 2026
    planificador      - devuelve fechas ya planificadas
    plan_v5           - directorio Plan v5 con grupos
"""
import argparse
import json
import os
import sys
import re
import urllib.request
import urllib.parse
from collections import Counter, defaultdict

# ── Conexión a Supabase (sustituye a Firestore, jun-2026) ───────────────────
# El backend del CRM es Supabase. Las credenciales se leen del entorno (igual
# que la CI / batch-qualify: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, que
# BYPASEA el RLS). Como fallback local admite un fichero KEY=VALOR (gitignored)
# en ~/.config/crm/supabase.env, para que el scout headless lo encuentre sin
# tener que exportar nada en el shell.
SUPABASE_REST_PAGE = 1000  # PostgREST devuelve como máximo 1000 filas por página
_CREDS_CACHE = {}


def _cargar_credenciales():
    if _CREDS_CACHE:
        return _CREDS_CACHE["url"], _CREDS_CACHE["key"]
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    env_file = os.path.expanduser("~/.config/crm/supabase.env")
    if (not url or not key) and os.path.exists(env_file):
        with open(env_file) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == "SUPABASE_URL" and not url:
                    url = v
                elif k == "SUPABASE_SERVICE_ROLE_KEY" and not key:
                    key = v
    if not url or not key:
        raise SystemExit(
            "ERROR: faltan credenciales de Supabase. Define SUPABASE_URL y "
            "SUPABASE_SERVICE_ROLE_KEY en el entorno, o crea el fichero "
            "~/.config/crm/supabase.env con esas dos líneas en formato KEY=VALOR."
        )
    _CREDS_CACHE["url"], _CREDS_CACHE["key"] = url.rstrip("/"), key
    return _CREDS_CACHE["url"], _CREDS_CACHE["key"]


def _supabase_get(path, query):
    """GET a la API REST de Supabase (PostgREST). Devuelve lista de filas."""
    url, key = _cargar_credenciales()
    qs = urllib.parse.urlencode(query, doseq=True)
    full = f"{url}/rest/v1/{path}?{qs}"
    req = urllib.request.Request(full, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

TERRITORIO_SUR = {
    "almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla",
    "badajoz", "caceres",
    "albacete", "ciudad real", "cuenca", "guadalajara", "toledo",
    "madrid",
    "valencia", "alicante", "castellon", "murcia",
    "baleares", "illes balears", "palma",
    "las palmas", "santa cruz de tenerife",
    "ceuta", "melilla",
}

# Reglas de matching Plan v5: cada regla devuelve True solo si encuentra la
# palabra clave UNICA y discriminante del prescriptor. Asi evitamos falsos
# positivos como "Arcoan Arquitectos" que la version anterior metia por
# coincidencia parcial.
#
# Cada regla devuelve (matches, plan_v5_key, grupo).
# - matches: True/False
# - plan_v5_key: identificador estable (para agrupar)
# - grupo: clasificacion para presentacion ("regantes", "hidralia", "aapp_aguas", etc.)
PLAN_V5_REGLAS = [
    # === Comunidades de Regantes ===
    {"key": "CR_GUADALMELLATO", "grupo": "regantes_cordoba",
     "patrones": [r"guadalmellato"]},
    {"key": "CR_CABRA", "grupo": "regantes_cordoba",
     "patrones": [r"\bc\.?r\.?\b.*\bcabra\b", r"comunidad de regantes.*cabra"]},
    {"key": "CR_PRIEGO_EDAR", "grupo": "regantes_cordoba",
     "patrones": [r"priego.*c[oó]rdoba"]},
    {"key": "CR_BEMBEZAR_IZQ", "grupo": "regantes_cordoba",
     "patrones": [r"bemb[eé]zar"]},
    {"key": "CR_GENIL_DERECHA", "grupo": "regantes_cordoba",
     "patrones": [r"margen derecha.*genil", r"genil.*margen derecha"]},
    {"key": "CR_VILLAFRANCA_CO", "grupo": "regantes_cordoba",
     "patrones": [r"villafranca.*c[oó]rdoba"]},
    {"key": "CR_ABARAN", "grupo": "regantes_murcia",
     "patrones": [r"abar[aá]n"]},
    {"key": "CR_BLANCA", "grupo": "regantes_murcia",
     "patrones": [r"\bc\.?r\.?\b.*\bblanca\b"]},

    # === Ingenierias y Arquitecturas ===
    {"key": "MOVAL", "grupo": "ingenierias_clave",
     "patrones": [r"\bmoval\b"]},
    {"key": "NARVAL", "grupo": "ingenierias_clave",
     "patrones": [r"\bnarval\b"]},
    {"key": "INGENZ", "grupo": "ingenierias_clave",
     "patrones": [r"\bingenz\b"]},
    {"key": "JGV_INGENIERIA", "grupo": "ingenierias_clave",
     "patrones": [r"\bjgv\b.*ingenier[ií]a"]},

    # === Distribuidores ===
    {"key": "ESCODA", "grupo": "distribuidores",
     "patrones": [r"salvador escoda", r"\bescoda\b"]},
    {"key": "SALTOKI", "grupo": "distribuidores",
     "patrones": [r"\bsaltoki\b"]},
    {"key": "SANIGRIF", "grupo": "distribuidores",
     "patrones": [r"\bsanigrif\b"]},
    {"key": "SOTEC", "grupo": "distribuidores",
     "patrones": [r"\bsotec\b"]},
    {"key": "SANEAMIENTOS_GOMEZ", "grupo": "distribuidores",
     "patrones": [r"saneamientos.*g[oó]mez", r"\bj\.?\s*g[oó]mez\b"]},

    # === Aguas y operadores ===
    {"key": "EMACSA", "grupo": "aapp_aguas",
     "patrones": [r"\bemacsa\b", r"empresa municipal.*aguas.*c[oó]rdoba"]},
    {"key": "EMPROACSA", "grupo": "aapp_aguas",
     "patrones": [r"\bemproacsa\b"]},
    {"key": "AGUAS_LUCENA", "grupo": "aapp_aguas",
     "patrones": [r"aguas de lucena"]},
    {"key": "EMASESA", "grupo": "aapp_aguas",
     "patrones": [r"\bemasesa\b"]},
    {"key": "AQUALIA_BAENA", "grupo": "aapp_aguas",
     "patrones": [r"aqualia.*baena"]},
    {"key": "AQUALIA_PUENTE_GENIL", "grupo": "aapp_aguas",
     "patrones": [r"aqualia.*puente genil"]},
    {"key": "FCC_AQUALIA", "grupo": "aapp_aguas",
     "patrones": [r"\bfcc\s+aqualia\b"]},

    # === Grupo HIDRALIA / HIDROGEA (todas las entradas son prescriptores) ===
    # NOTA: matching especifico que solo pesca cuando esta el texto "HIDRALIA" o "HIDROGEA"
    # de forma explicita. Cada filial tendra el mismo grupo "hidralia" pero key especifica.
    {"key": "HIDROGEA", "grupo": "hidralia",
     "patrones": [r"\bhidrogea\b"]},
    {"key": "HIDRALIA_AQUONA", "grupo": "hidralia",
     "patrones": [r"hidralia.*aquona"]},
    {"key": "HIDRALIA_EMASAGRA", "grupo": "hidralia",
     "patrones": [r"hidralia.*emasagra"]},
    {"key": "HIDRALIA_CANARAGUA", "grupo": "hidralia",
     "patrones": [r"hidralia.*canaragua"]},
    {"key": "HIDRALIA_HIDROBAL", "grupo": "hidralia",
     "patrones": [r"hidralia.*hidrobal"]},
    {"key": "HIDRALIA_PLASENCIA", "grupo": "hidralia",
     "patrones": [r"hidralia.*plasencia", r"hidralia.*ute servicio"]},
    {"key": "HIDRALIA_OTROS", "grupo": "hidralia",
     "patrones": [r"hidralia\s+a\s+traves"]},  # captura cualquier otra HIDRALIA A TRAVES

    # === Colegios profesionales ===
    {"key": "COA_ANDALUCIA", "grupo": "colegios",
     "patrones": [r"\bcoa\b.*arquitect", r"colegio.*arquitectos.*andalucia"]},
    {"key": "COAAT", "grupo": "colegios",
     "patrones": [r"\bcoaat\b", r"aparejadores.*arquitectos.*tecnicos"]},
    {"key": "CICCP", "grupo": "colegios",
     "patrones": [r"\bciccp\b", r"caminos.*canales.*puertos"]},
    {"key": "COIA", "grupo": "colegios",
     "patrones": [r"\bcoia\b", r"ingenieros.*agronomos"]},
]

PRIORIDAD_MAP = {
    "alta": "Alta", "media": "Media", "baja": "Baja",
    "Alta": "Alta", "Media": "Media", "Baja": "Baja",
    "ALTA": "Alta", "MEDIA": "Media", "BAJA": "Baja",
}

TIPO_MAP = {
    "ingenieria": "ingenieria", "ingeniería": "ingenieria", "Ingeniería": "ingenieria",
    "arquitectura": "arquitectura", "Arquitectura": "arquitectura",
    "regantes": "regantes", "Regantes": "regantes",
    "cr": "regantes", "C.R. Regantes": "regantes", "Comunidad de Regantes": "regantes",
    "aguas": "aguas", "Aguas": "aguas",
    "aapp": "aapp", "AAPP": "aapp", "ayuntamiento": "aapp",
    "almacen": "distribucion", "distribucion": "distribucion",
    "Distribuidor": "distribucion", "distribuidor": "distribucion",
    "constructora": "constructora", "promotora": "promotora",
    "agro": "agro", "otros": "otros",
    "colegio_profesional": "colegio_profesional",
    # Códigos canónicos de Supabase (jun-2026): ARQ/ING/CCRR/OCV/CICA/AAPP
    "ARQ": "arquitectura", "ING": "ingenieria", "CCRR": "regantes",
    "OCV": "promotora", "CICA": "aguas", "AAPP": "aapp",
}


def init_db():
    # Ya no hay handle persistente como en Firestore: validamos credenciales
    # pronto (para fallar con mensaje claro) y las lecturas van por REST.
    _cargar_credenciales()
    return {"backend": "supabase"}


def _norm(s):
    if not s:
        return ""
    return str(s).strip().lower()


def _norm_busqueda(s):
    """Normaliza para busqueda con regex: quita tildes y baja a minusculas."""
    if not s:
        return ""
    s = str(s).lower()
    s = s.replace("á", "a").replace("é", "e").replace("í", "i")
    s = s.replace("ó", "o").replace("ú", "u").replace("ñ", "n")
    return s


def _norm_prioridad(p):
    if p is None:
        return None
    s = str(p).strip()
    if not s or s.lower() in ("nan", "?", "none", "null"):
        return None
    return PRIORIDAD_MAP.get(s, PRIORIDAD_MAP.get(s.lower(), s))


def _norm_tipo(t):
    if not t:
        return None
    # Si type es una lista (algunos registros Firestore), tomar el primer elemento
    if isinstance(t, list):
        t = t[0] if t else None
        if not t:
            return None
    t = str(t)
    return TIPO_MAP.get(t, TIPO_MAP.get(t.lower(), t.lower()))


def _en_territorio(provincia):
    if not provincia:
        return False
    return _norm_busqueda(provincia) in TERRITORIO_SUR


def _match_plan_v5(name):
    """
    Devuelve (es_plan_v5, plan_v5_key, grupo) o (False, None, None).
    """
    if not name:
        return False, None, None
    n = _norm_busqueda(name)
    for regla in PLAN_V5_REGLAS:
        for patron in regla["patrones"]:
            if re.search(patron, n):
                return True, regla["key"], regla["grupo"]
    return False, None, None


def _enriquecer(s):
    s = dict(s)
    s["_priority_norm"] = _norm_prioridad(s.get("priority"))
    s["_type_norm"] = _norm_tipo(s.get("type"))
    s["_en_territorio"] = _en_territorio(s.get("province"))
    es_v5, key, grupo = _match_plan_v5(s.get("name", ""))
    s["_is_plan_v5"] = es_v5
    s["_plan_v5_key"] = key
    s["_plan_v5_grupo"] = grupo
    return s


def _safe_get(d, path, default=None):
    cur = d
    for key in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return default
    return cur if cur is not None else default


def get_all_studios(db):
    raw = []
    offset = 0
    while True:
        page = _supabase_get("studios", {
            "select": "*",
            "limit": SUPABASE_REST_PAGE,
            "offset": offset,
        })
        raw.extend(page)
        if len(page) < SUPABASE_REST_PAGE:
            break
        offset += SUPABASE_REST_PAGE
    return [_enriquecer(s) for s in raw]


def get_all_activities(db, studios):
    # En Supabase las activities NO son subcolección: viven dentro del JSONB
    # data.activities de cada studio (ya cargado por get_all_studios).
    activities = []
    for s in studios:
        acts = _safe_get(s, "data.activities", []) or []
        if not isinstance(acts, list):
            continue
        for a in acts:
            if not isinstance(a, dict):
                continue
            act_data = dict(a)
            act_data["_studio_id"] = s["id"]
            act_data["_studio_name"] = s.get("name", "")
            activities.append(act_data)
    return activities


def action_stats(db, params):
    studios = get_all_studios(db)
    en_zona = [s for s in studios if s["_en_territorio"]]
    return {
        "total_studios": len(studios),
        "en_territorio_sur": len(en_zona),
        "fuera_territorio": len(studios) - len(en_zona),
        "por_estado": dict(Counter(s.get("status", "?") for s in studios)),
        "por_tipo_normalizado": dict(Counter(s["_type_norm"] or "?" for s in studios)),
        "por_provincia_top15": dict(Counter(s.get("province", "?") for s in studios).most_common(15)),
        "por_prioridad_normalizada": dict(Counter(s["_priority_norm"] or "(sin)" for s in studios)),
        "plan_v5_matches": sum(1 for s in studios if s["_is_plan_v5"]),
    }


def action_salud(db, params):
    studios = get_all_studios(db)

    prio_raw = Counter(str(s.get("priority", "(sin)")) for s in studios)
    prio_inconsistentes = {k: v for k, v in prio_raw.items() if k not in ("Alta", "Media", "Baja", "(sin)")}

    tipo_raw = Counter(str(s.get("type", "(sin)")) for s in studios)
    tipos_unicos = set(tipo_raw.keys())
    tipos_normalizados = set(_norm_tipo(t) for t in tipos_unicos)

    sin_email = sum(1 for s in studios if not _safe_get(s, "data.contact.email"))
    sin_phone = sum(1 for s in studios if not _safe_get(s, "data.contact.phone"))
    sin_team = sum(1 for s in studios if not _safe_get(s, "data.team"))
    sin_dm = sum(
        1 for s in studios
        if not any(t.get("isDecisionMaker") for t in (_safe_get(s, "data.team", []) or []))
    )

    prio_invalidas = [
        {"id": s["id"], "name": s.get("name"), "priority_raw": str(s.get("priority"))}
        for s in studios if s["_priority_norm"] is None and s.get("priority") not in (None, "")
    ][:20]

    # Plan v5: agrupado por grupo
    plan_v5_studios = [s for s in studios if s["_is_plan_v5"]]
    por_grupo = defaultdict(list)
    for s in plan_v5_studios:
        por_grupo[s["_plan_v5_grupo"]].append({
            "id": s["id"], "name": s.get("name"),
            "key": s["_plan_v5_key"],
            "city": s.get("city"), "province": s.get("province"),
            "status": s.get("status"),
        })

    return {
        "total_studios": len(studios),
        "prioridad_inconsistente_capitalizacion": prio_inconsistentes,
        "prioridad_invalida_ejemplos": prio_invalidas,
        "tipos_raw_count": len(tipos_unicos),
        "tipos_normalizados_count": len(tipos_normalizados),
        "calidad_contacto": {
            "sin_email": sin_email,
            "sin_telefono": sin_phone,
            "sin_team": sin_team,
            "sin_decision_maker": sin_dm,
        },
        "plan_v5": {
            "total_matches": len(plan_v5_studios),
            "por_grupo": {k: {"total": len(v), "studios": v} for k, v in por_grupo.items()},
        },
    }


def action_foco(db, params):
    studios = get_all_studios(db)
    foco = [
        s for s in studios
        if (s["_is_plan_v5"] or s["_priority_norm"] == "Alta")
        and s["_en_territorio"]
    ]
    foco.sort(key=lambda x: (
        not x["_is_plan_v5"],
        -(float(x.get("score") or 0)),
    ))
    return {
        "total_foco": len(foco),
        "plan_v5_en_foco": sum(1 for s in foco if s["_is_plan_v5"]),
        "alta_en_foco": sum(1 for s in foco if s["_priority_norm"] == "Alta"),
        "studios": [
            {
                "id": s["id"],
                "name": s.get("name"),
                "type": s["_type_norm"],
                "status": s.get("status"),
                "province": s.get("province"),
                "city": s.get("city"),
                "priority": s["_priority_norm"],
                "score": s.get("score"),
                "is_plan_v5": s["_is_plan_v5"],
                "plan_v5_key": s["_plan_v5_key"],
                "plan_v5_grupo": s["_plan_v5_grupo"],
                "team_count": len(_safe_get(s, "data.team", []) or []),
                "has_dm": any(
                    t.get("isDecisionMaker") for t in (_safe_get(s, "data.team", []) or [])
                ),
            }
            for s in foco
        ],
    }


def action_kpis(db, params):
    studios = get_all_studios(db)
    activities = get_all_activities(db, studios)
    year = params.get("year", 2026)

    def _in_year(act):
        ts = act.get("createdAt") or act.get("date")
        if not ts:
            return False
        try:
            if isinstance(ts, str):
                return ts.startswith(str(year))
            if hasattr(ts, "year"):
                return ts.year == year
        except Exception:
            return False
        return False

    def _is_meeting(act):
        return act.get("type") in ("meeting", "reunion")

    def _has_mute(act):
        productos = act.get("productos", []) or []
        if isinstance(productos, str):
            productos = [productos]
        return any("mute" in _norm(p) for p in productos)

    def _is_ponencia(act):
        return act.get("type") == "ponencia" or "ponencia" in _norm(act.get("text", ""))

    visitas = [a for a in activities if _in_year(a) and _is_meeting(a)]
    visitas_mute = [a for a in visitas if _has_mute(a)]
    ponencias = [a for a in activities if _in_year(a) and _is_ponencia(a)]

    return {
        "year": year,
        "visitas_totales": {
            "actual": len(visitas), "objetivo": 140,
            "porcentaje": round(len(visitas) / 140 * 100, 1)
        },
        "visitas_mute": {
            "actual": len(visitas_mute), "objetivo": 30,
            "porcentaje": round(len(visitas_mute) / 30 * 100, 1)
        },
        "ponencias": {
            "actual": len(ponencias), "objetivo": 2,
            "porcentaje": round(len(ponencias) / 2 * 100, 1)
        },
        "ejemplos_recientes": [
            {
                "studio": v.get("_studio_name"),
                "fecha": str(v.get("createdAt", ""))[:10],
                "productos": v.get("productos", []),
            }
            for v in sorted(visitas, key=lambda x: str(x.get("createdAt", "")), reverse=True)[:5]
        ],
    }


def action_planificador(db, params):
    rows = _supabase_get("meta_planificador", {"select": "schedule", "id": "eq.1"})
    if not rows:
        return {"schedule": {}}
    return rows[0]


def action_studio(db, params):
    sid = params.get("id")
    if not sid:
        return {"error": "Falta parametro 'id'"}
    rows = _supabase_get("studios", {"select": "*", "id": f"eq.{sid}"})
    if not rows:
        return {"error": f"Studio {sid} no encontrado"}
    return rows[0]


def action_plan_v5(db, params):
    studios = get_all_studios(db)
    matched = []
    for s in studios:
        if s["_is_plan_v5"]:
            team = _safe_get(s, "data.team", []) or []
            matched.append({
                "id": s["id"],
                "name": s.get("name"),
                "key": s["_plan_v5_key"],
                "grupo": s["_plan_v5_grupo"],
                "type": s["_type_norm"],
                "status": s.get("status"),
                "province": s.get("province"),
                "city": s.get("city"),
                "priority": s["_priority_norm"],
                "score": s.get("score"),
                "team_count": len(team),
                "has_dm": any(t.get("isDecisionMaker") for t in team),
                "last_activity": s.get("updatedAt"),
            })

    por_grupo = defaultdict(list)
    for m in matched:
        por_grupo[m["grupo"]].append(m)

    return {
        "total": len(matched),
        "por_grupo": {k: {"total": len(v), "studios": v} for k, v in por_grupo.items()},
    }


def action_ultimo_contacto(db, params):
    """Fecha del ultimo contacto real con cada studio y dias transcurridos.

    Se mira en los tres sitios donde queda rastro, y gana el mas reciente:
    data.reports[].date (informe de visita), data.activities[].date (llamada,
    correo, tarea de bandeja) y la tabla `visitas`, que es la unica que
    registra que una reunion se CELEBRO aunque nunca se escribiera su informe.

    Sin fecha en ninguno de los tres = nunca se ha tocado: dias = None.
    """
    import datetime as _dt
    hoy = _dt.date.today()
    prov = _norm(params.get("provincia") or "")

    def _fechas(lista):
        out = []
        for x in (lista or []):
            if not isinstance(x, dict):
                continue
            f = (x.get("date") or x.get("fecha") or "")[:10]
            if re.match(r"^\d{4}-\d{2}-\d{2}$", f):
                out.append(f)
        return out

    visitas = {}
    try:
        for v in _supabase_get("visitas", {"select": "studio_id,fecha,estado"}) or []:
            sid, f = str(v.get("studio_id") or ""), (v.get("fecha") or "")[:10]
            if sid and f and v.get("estado") != "anulada":
                if sid not in visitas or f > visitas[sid]:
                    visitas[sid] = f
    except Exception:
        pass                      # sin la tabla, se sigue con informes y actividades

    out = []
    for s in get_all_studios(db):
        if prov and _norm(s.get("province") or "") != prov:
            continue
        fs = _fechas(_safe_get(s, "data.reports", [])) + _fechas(_safe_get(s, "data.activities", []))
        v = visitas.get(str(s["id"]))
        if v:
            fs.append(v)
        ult = max(fs) if fs else None
        dias = None
        if ult:
            try:
                dias = (hoy - _dt.date(*map(int, ult.split("-")))).days
            except ValueError:
                ult = None
        out.append({"id": s["id"], "name": s.get("name"), "ultimo_contacto": ult,
                    "dias": dias, "n_informes": len(_safe_get(s, "data.reports", []) or []),
                    "de_visitas": bool(v)})
    out.sort(key=lambda x: (x["dias"] is None, x["dias"] if x["dias"] is not None else 0))
    return {"total": len(out), "con_contacto": sum(1 for x in out if x["dias"] is not None),
            "candidatos": out}


def action_candidatos(db, params):
    studios = get_all_studios(db)
    fp = params.get("provincia")
    fc = params.get("ciudad")
    ft = params.get("tipo")
    fe = params.get("estado")
    fpr = params.get("prioridad")
    fsm = params.get("score_min")
    fex = set(str(x) for x in (params.get("excluir_ids") or []))
    fpv5 = params.get("solo_plan_v5", False)
    solo_zona = params.get("solo_territorio", True)
    limit = params.get("limit", 30)

    out = []
    for s in studios:
        if s["id"] in fex:
            continue
        if solo_zona and not s["_en_territorio"]:
            continue
        if fp and _norm_busqueda(s.get("province")) != _norm_busqueda(fp):
            continue
        if fc and _norm_busqueda(s.get("city")) != _norm_busqueda(fc):
            continue
        if ft and s["_type_norm"] != _norm_tipo(ft):
            continue
        if fe and _norm(s.get("status")) != _norm(fe):
            continue
        if fpr and s["_priority_norm"] != _norm_prioridad(fpr):
            continue
        if fsm is not None:
            try:
                if float(s.get("score") or 0) < float(fsm):
                    continue
            except (ValueError, TypeError):
                continue
        if fpv5 and not s["_is_plan_v5"]:
            continue

        team = _safe_get(s, "data.team", []) or []
        dm = next((t for t in team if t.get("isDecisionMaker")), None)
        reports = _safe_get(s, "data.reports", []) or []
        n_informes = len(reports) if isinstance(reports, list) else 0

        out.append({
            "id": s["id"],
            "name": s.get("name"),
            "type": s["_type_norm"],
            "status": s.get("status"),
            "province": s.get("province"),
            "city": s.get("city"),
            "priority": s["_priority_norm"],
            "score": s.get("score"),
            "is_plan_v5": s["_is_plan_v5"],
            "plan_v5_key": s["_plan_v5_key"],
            "plan_v5_grupo": s["_plan_v5_grupo"],
            "contact": _safe_get(s, "data.contact", {}),
            "decision_maker": dm,
            "team_count": len(team),
            "has_team": len(team) > 0,
            "n_informes": n_informes,
            "tiene_informe": n_informes > 0,
            "notes_preview": (_safe_get(s, "data.notes", "") or "")[:200],
        })

    out.sort(key=lambda x: (
        not x["is_plan_v5"],
        {"Alta": 0, "Media": 1, "Baja": 2}.get(x.get("priority"), 3),
        -(float(x.get("score") or 0)),
    ))
    return {"total": len(out), "limit_aplicado": limit, "candidatos": out[:limit]}


ACTIONS = {
    "stats": action_stats,
    "salud": action_salud,
    "foco": action_foco,
    "candidatos": action_candidatos,
    "ultimo_contacto": action_ultimo_contacto,
    "studio": action_studio,
    "kpis": action_kpis,
    "planificador": action_planificador,
    "plan_v5": action_plan_v5,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--accion", default="stats", choices=list(ACTIONS.keys()))
    parser.add_argument("--params", default="{}")
    args = parser.parse_args()

    try:
        params = json.loads(args.params)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"params JSON invalido: {e}"}), file=sys.stderr)
        sys.exit(1)

    db = init_db()
    result = ACTIONS[args.accion](db, params)
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
