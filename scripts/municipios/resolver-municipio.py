#!/usr/bin/env python3
"""Dice si un `city` es un municipio de verdad, y si no, a cual pertenece.

POR QUE EXISTE
--------------
El campo `city` de `studios` es lo que agrupa las fichas por municipio al
planificar una ruta. Cuando lleva algo que no es un municipio —una pedania
(«San Pedro de Alcantara»), una comarca («El Andevalo»), un nombre tradicional
(«Calpe» en vez de «Calp») o la provincia pegada («Barrado (Caceres)»)— la ficha
no agrupa con nada y desaparece de su zona SIN DAR NINGUN ERROR. En septiembre
de 2026 esto tenia escondidos 19 estudios de la capital de Almeria y cuatro
arquitectos de San Pedro de Alcantara que no salian ni filtrando Marbella.

QUE HACE, Y QUE NO
------------------
Contesta una sola pregunta: «esto que hay en `city`, ¿es un municipio?». Si no
lo es, mira si esta en el mapa de pedanias (pedanias.json) y devuelve el
municipio con su prueba. Si no lo sabe, lo dice: NO adivina. Un `city` vacio es
preferible a uno inventado.

Para los REGANTES, ademas, pregunta a los censos oficiales que hay al lado
(censo-regantes-*.json: Jucar, Andalucia, Segura) y dice en que municipio
sitúan a esa comunidad. Solo propone cuando UNA comunidad del censo, de la
misma provincia, contiene entero el nucleo del nombre de la ficha: «CR Villa
de Dalias» casa con «C.R. Sindicato de Riego Dalias, C.R. Pozo Los Llanos de
Dalias»; «CR Blanca» no casa con nada, porque un solo token corto engaña.

NO deduce el municipio de una direccion. Eso es harina de otro costal y tiene
dos trampas que costaron sangre el 10-sep-2026:
  1. Casi todas las direcciones acaban en la PROVINCIA, no en el municipio
     («Av. de Villaricos, 8, Puerto Rey, Almeria» es Vera).
  2. Un nombre de calle coincide con un municipio mas veces de lo que parece
     (Sevilla tiene C/ Santander, Granada C/ Cadiar, Huelva C/ Villablanca).

FUENTE
------
El diccionario de municipios del INE, que se baja una vez y se cachea en
~/.cache/crm/municipios-ine.xlsx. Universo finito, cero invencion, coste cero
por consulta. Mismo criterio que el censo del scout: lo que no se puede
cosechar, no se le pide al modelo.

USO
---
    python3 scripts/municipios/resolver-municipio.py "San Pedro de Alcantara"
    python3 scripts/municipios/resolver-municipio.py "Barrado (Caceres)" "Calpe" "Gor"
    python3 scripts/municipios/resolver-municipio.py "Aguadulce@Almería"   # la provincia desempata
    python3 scripts/municipios/resolver-municipio.py --regante "villa de dalias" [@Almería]
    python3 scripts/municipios/resolver-municipio.py --auditar     # revisa todo el CRM, censos incluidos
"""
import json, os, re, sys, unicodedata, urllib.request

INE_URL = "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx"
CACHE = os.path.expanduser("~/.cache/crm/municipios-ine.xlsx")
MAPA_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pedanias.json")

CPRO = {"01":"Araba/Álava","02":"Albacete","03":"Alicante","04":"Almería","05":"Ávila",
 "06":"Badajoz","07":"Illes Balears","08":"Barcelona","09":"Burgos","10":"Cáceres","11":"Cádiz",
 "12":"Castellón","13":"Ciudad Real","14":"Córdoba","15":"A Coruña","16":"Cuenca","17":"Girona",
 "18":"Granada","19":"Guadalajara","20":"Gipuzkoa","21":"Huelva","22":"Huesca","23":"Jaén",
 "24":"León","25":"Lleida","26":"La Rioja","27":"Lugo","28":"Madrid","29":"Málaga","30":"Murcia",
 "31":"Navarra","32":"Ourense","33":"Asturias","34":"Palencia","35":"Las Palmas","36":"Pontevedra",
 "37":"Salamanca","38":"Santa Cruz de Tenerife","39":"Cantabria","40":"Segovia","41":"Sevilla",
 "42":"Soria","43":"Tarragona","44":"Teruel","45":"Toledo","46":"Valencia","47":"Valladolid",
 "48":"Bizkaia","49":"Zamora","50":"Zaragoza","51":"Ceuta","52":"Melilla"}


def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"\s*/\s*", "/", re.sub(r"[^a-z0-9/ ]", " ", s))
    return re.sub(r"\s+", " ", s).strip()


def desinvertir(nombre):
    """El INE guarda «Ejido, El» y «Romana, la». Para el CRM queremos «El Ejido»."""
    m = re.match(r"(?i)^(.*), (el|la|los|las|l'|els|es|sa|ses|a|o|as|os)$", nombre)
    if not m:
        return nombre
    art = m.group(2).capitalize()
    return f"{art}{m.group(1)}" if art.endswith("'") else f"{art} {m.group(1)}"


def municipios():
    """{norm(variante): [(oficial, provincia)]} desde el diccionario del INE."""
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        sys.stderr.write("Bajando el diccionario de municipios del INE (una sola vez)...\n")
        urllib.request.urlretrieve(INE_URL, CACHE)
    import openpyxl
    ws = openpyxl.load_workbook(CACHE, read_only=True).active
    idx = {}
    for fila in ws.iter_rows(min_row=3, values_only=True):
        if not fila or not fila[4]:
            continue
        oficial, prov = desinvertir(str(fila[4])), CPRO.get(fila[1], fila[1])
        formas = {str(fila[4]), oficial}
        for f in list(formas):
            if "/" in f:
                formas |= {p.strip() for p in f.split("/")}
        for f in formas:
            idx.setdefault(norm(f), []).append((oficial, prov))
    return idx


def oficial(nombre, idx):
    """Devuelve la grafia del INE. `city` agrupa por cadena exacta, asi que
    «Velez-Malaga» y «Vélez-Málaga» son dos zonas distintas para el CRM."""
    hits = idx.get(norm(nombre))
    return hits[0][0] if hits else nombre


def pedanias():
    d = json.load(open(MAPA_JSON, encoding="utf-8"))
    return {norm(p["alias"]): p for p in d["pedanias"]}, d


# ── Censos de regantes ─────────────────────────────────────────────────────────
CENSOS = ("censo-regantes-jucar.json", "censo-regantes-andalucia.json", "censo-regantes-segura.json")
# Palabras que no distinguen una comunidad de otra. Se quitan del nombre antes de comparar.
GENERICAS = {"c", "r", "u", "cr", "cu", "cg", "sat", "comunidad", "comunidades", "general", "regantes",
             "usuarios", "de", "del", "la", "el", "los", "las", "y", "e", "zona", "regable", "z", "zr",
             "compl", "terminada", "obras", "red", "riego", "riegos", "colectividad", "junta", "central",
             "sindicato", "aguas", "agua", "reguladas", "embalse", "pantano", "canal"}
# NO son genericas, aunque lo parezcan:
#  - «acequia(s)»: «Acequias del Guadalhorce» (Alhaurin el Grande) y «Zona Regable de
#    Guadalhorce» (Cartama) son dos comunidades distintas, y es lo que las separa.
#  - «margen», «derecha», «izquierda»: la Margen Derecha del Bembezar y la Margen
#    Izquierda son dos comunidades con sede en pueblos distintos. Quitarlas caso una
#    con la otra.
# Lo que da cada censo: la sede (direccion postal de la comunidad) o el recinto (donde
# el inventario ancla la zona regable). No es lo mismo: el Canal del Viar riega desde
# Sevilla y tiene la oficina en Alcala del Rio. Un desacuerdo con un censo de recinto
# es una segunda opinion, no un error.
DA = {"jucar": "censo CHJ", "andalucia": "recinto ICRA", "segura": "sede SCRATS"}
# «Fase I/II» es cosa del CRM (una ficha por obra); el censo no lo lleva. «Sector VIII» sí distingue.
RE_FASE = re.compile(r"(?i)\b(fase|fases)\s+[ivx\d]+[ªº]?\b|\b\d+[ªº]\s+fase\b")
RE_REGANTE = re.compile(r"(?i)^\s*(c\.?\s?[rgu]\.?\s?[rgu]?\.?|comunidad|colectividad|junta central|sindicato|s\.?a\.?t\.?|red riego|z\.?r\.?)\b")


def cargar_censos():
    """[(nombre, tokens, municipio, provincia, fuente)] de los tres censos que existan."""
    out = []
    for fich in CENSOS:
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), fich)
        if not os.path.exists(ruta):
            continue
        doc = json.load(open(ruta, encoding="utf-8"))
        fuente = fich.replace("censo-regantes-", "").replace(".json", "")
        for u in doc.get("comunidades") or doc.get("unidades") or []:
            if not u.get("municipio"):
                continue
            out.append((u["nombre"], nucleo(u["nombre"]), u["municipio"], u.get("provincia"), fuente))
    return out


def nucleo(nombre):
    """Tokens que de verdad identifican a la comunidad: sin siglas ni palabras de relleno."""
    # «<entidad> - <obra>» es la convencion del CRM: lo de despues del guion con
    # espacios es la obra (Cota 120, Balsa de Zamacon), no la comunidad. El guion
    # sin espacios («Balazote-La Herrera») es parte del nombre y se respeta.
    n = re.split(r"\s[-–—]\s", nombre or "", maxsplit=1)[0]
    n = norm(RE_FASE.sub(" ", re.sub(r"\(.*?\)", " ", n)))
    return {w for w in re.split(r"[ /]", n) if w and w not in GENERICAS and not w.isdigit()}


def en_censo(nombre, censos, provincia=None):
    """Comunidades del censo cuyo nombre contiene ENTERO el nucleo del de la ficha.
    Exige nucleo con sustancia (dos tokens, o uno de 4+ letras que ademas sea
    IGUAL al nucleo del censo) y misma provincia."""
    nuc = nucleo(nombre)
    if not nuc or (len(nuc) == 1 and len(next(iter(nuc))) < 4):
        return []
    hits = []
    for nom, toks, muni, prov, fuente in censos:
        if provincia and prov and prov != provincia:
            continue
        # con un solo token, solo vale la igualdad: «guadalhorce» esta dentro de
        # cinco comunidades distintas y ninguna es la Acequias del Guadalhorce.
        if (nuc <= toks) if len(nuc) >= 2 else (nuc == toks):
            hits.append((nom, muni, prov, fuente))
    # si hay varias con el mismo municipio, es la misma respuesta
    return hits


def resolver(valor, idx, ped, provincia=None):
    """(municipio, provincia, de_donde) o (None, None, motivo).

    `provincia` es la de la ficha, y desempata. Sin ella, «Aguadulce» contesta el
    municipio de Sevilla aunque la ficha sea de Almeria, donde Aguadulce es la
    pedania de Roquetas de Mar. Pasala siempre que la tengas.
    """
    if not (valor or "").strip():
        return None, None, "vacio"
    v = norm(valor)
    if v in idx:
        hits = sorted(set(idx[v]))
        en_prov = [h for h in hits if provincia and h[1] == provincia]
        if en_prov:
            return en_prov[0][0], en_prov[0][1], "municipio del INE"
        # Si la ficha es de otra provincia, el mapa de pedanias manda: el nombre
        # coincide con un municipio lejano por casualidad.
        if provincia and v in ped and ped[v]["provincia"] == provincia:
            p = ped[v]
            return oficial(p["municipio"], idx), p["provincia"], f"pedania — {p['prueba']}"
        if len(hits) == 1:
            return hits[0][0], hits[0][1], "municipio del INE"
        return None, None, f"ambiguo: hay {len(hits)} municipios asi ({', '.join(p for _, p in hits)})"
    # la provincia pegada: «Barrado (Caceres)», «Cabra, Cordoba»
    m = re.match(r"^(.+?)\s*[\(,]\s*(.+?)\s*\)?$", valor.strip())
    if m and norm(m.group(1)) in idx:
        cand = [h for h in set(idx[norm(m.group(1))]) if norm(h[1]) == norm(m.group(2))]
        if cand:
            return cand[0][0], cand[0][1], "llevaba la provincia pegada"
    if v in ped:
        p = ped[v]
        return oficial(p["municipio"], idx), p["provincia"], f"pedania — {p['prueba']}"
    return None, None, "no es municipio y no esta en el mapa de pedanias"


def auditar(idx, ped):
    """Pasa todo el CRM por el resolutor. Necesita las credenciales de Supabase."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    from agentes._lib.crm_query import _supabase_get  # noqa
    filas, off = [], 0
    while True:
        pag = _supabase_get("studios", {"select": "id,name,type,province,city", "limit": 1000, "offset": off})
        filas += pag
        if len(pag) < 1000:
            break
        off += 1000
    malas, censo_dice = [], []
    censos = cargar_censos()
    for f in filas:
        city = (f.get("city") or "").strip()
        if city:
            muni, prov, de = resolver(city, idx, ped, f.get("province"))
            if muni is None or (f.get("province") and prov and prov != f["province"]):
                malas.append((f["id"], f.get("province"), city, muni or "—", de))
        # regantes: ¿que dice el censo?
        if censos and (f.get("type") == "CCRR" or RE_REGANTE.match(f.get("name") or "")):
            hits = en_censo(f.get("name"), censos, f.get("province"))
            munis = {h[1] for h in hits}
            if len(munis) == 1:
                m = munis.pop()
                if not city:
                    censo_dice.append((f["id"], f.get("province"), f["name"], "(vacío)", m, hits[0][3], hits[0][0]))
                elif norm(city) != norm(m):
                    censo_dice.append((f["id"], f.get("province"), f["name"], city, m, hits[0][3], hits[0][0]))
            elif len(munis) > 1 and not city:
                censo_dice.append((f["id"], f.get("province"), f["name"], "(vacío)",
                                   " ó ".join(sorted(munis)), "varios", f"{len(hits)} candidatas"))
    print(f"{len(filas)} fichas · con `city` que no cuadra: {len(malas)}\n")
    for i, p, c, m, de in sorted(malas, key=lambda x: (x[1] or "", x[2])):
        print(f"  {i:>6} [{(p or '—'):<22}] {c[:34]:<34} -> {m:<24} {de}")
    print(f"\nregantes en los que un censo dice otra cosa, o rellena un vacío: {len(censo_dice)}")
    print("  (segunda opinión: «recinto» es donde está la zona regable, «sede» la oficina; pueden diferir)\n")
    for i, p, n, c, m, fu, nom in sorted(censo_dice, key=lambda x: (x[1] or "", x[2])):
        print(f"  {i:>6} [{(p or '—'):<12}] {n[:40]:<40} city={c[:18]:<18} → {m:<22} [{DA.get(fu, fu)}: {nom[:40]}]")


def main(argv):
    idx, (ped, doc) = municipios(), pedanias()
    if "--auditar" in argv:
        return auditar(idx, ped)
    if "--regante" in argv:
        arg = argv[argv.index("--regante") + 1]
        nombre, _, prov = arg.partition("@")
        hits = en_censo(nombre, cargar_censos(), prov or None)
        if not hits:
            print(f"  {nombre!r}: ningún censo tiene una comunidad que contenga «{' '.join(sorted(nucleo(nombre)))}»")
        for nom, muni, p, fu in hits:
            print(f"  {nom[:58]:<58} -> {muni} ({p})   [{fu}]")
        return
    if not argv:
        return sys.exit(__doc__)
    for arg in argv:
        valor, _, prov_ficha = arg.partition("@")
        muni, prov, de = resolver(valor, idx, ped, prov_ficha or None)
        if muni:
            print(f"  {arg!r:<38} -> {muni} ({prov})   [{de}]")
        else:
            print(f"  {arg!r:<38} -> SIN RESOLVER      [{de}]")


if __name__ == "__main__":
    main([a for a in sys.argv[1:]])
