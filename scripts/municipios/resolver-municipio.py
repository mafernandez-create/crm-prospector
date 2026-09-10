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
    python3 scripts/municipios/resolver-municipio.py --auditar     # revisa todo el CRM
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
    return f"{m.group(2).capitalize()} {m.group(1)}" if m else nombre


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
        pag = _supabase_get("studios", {"select": "id,name,province,city", "limit": 1000, "offset": off})
        filas += pag
        if len(pag) < 1000:
            break
        off += 1000
    malas = []
    for f in filas:
        city = (f.get("city") or "").strip()
        if not city:
            continue
        muni, prov, de = resolver(city, idx, ped, f.get("province"))
        if muni is None or (f.get("province") and prov and prov != f["province"]):
            malas.append((f["id"], f.get("province"), city, muni or "—", de))
    print(f"{len(filas)} fichas · con `city` que no cuadra: {len(malas)}\n")
    for i, p, c, m, de in sorted(malas, key=lambda x: (x[1] or "", x[2])):
        print(f"  {i:>6} [{(p or '—'):<22}] {c[:34]:<34} -> {m:<24} {de}")


def main(argv):
    idx, (ped, doc) = municipios(), pedanias()
    if "--auditar" in argv:
        return auditar(idx, ped)
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
