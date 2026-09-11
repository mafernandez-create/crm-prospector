#!/usr/bin/env python3
"""Censo de comunidades de regantes del Segura: nombre -> municipio de la SEDE,
sacado del directorio del SCRATS (Sindicato Central de Regantes del Acueducto
Tajo-Segura).

POR QUE EXISTE
--------------
La Confederacion del Segura NO publica censo de comunidades de usuarios: su web
solo tiene los formularios para constituir una, y su Plan Hidrologico trabaja
por unidades de demanda (UDA 17, UDA 18...) sin listar comunidades. Se busco el
11-sep-2026 y no hay nada bajable.

Lo que si hay es el directorio del SCRATS: 124 comunidades y usuarios del
trasvase Tajo-Segura, cada una con su ficha y su DIRECCION POSTAL publicada por
la propia comunidad («Paraje Puerto Errado s/n, 30420, Calasparra»). La web es
WordPress y expone el listado por API REST; la direccion solo esta en la ficha
HTML, asi que se baja una a una (124 peticiones, con pausa).

Es lo mas parecido a un censo que existe para el Segura, y ademas trae la SEDE,
no el recinto, que es justo lo que el inventario andaluz no daba.

ALCANCE — LEER ANTES DE FIARSE
------------------------------
- Es una ASOCIACION, no un registro: solo estan las comunidades que reciben agua
  del trasvase (Murcia, Alicante y el Almanzora almeriense). Las de riego
  tradicional sin trasvase (Vega Alta del Segura, Calasparra tradicional...) no
  tienen por que estar.
- Hay socios que no son comunidades: SAT, sociedades agricolas, algun regante
  particular. El tipo va en el JSON.
- El municipio se saca del CP de la direccion (dos primeros digitos = provincia)
  y del texto tras el CP, contrastado con el INE. Si no cuadra, queda vacio.

USO
---
    python3 scripts/municipios/construir-censo-segura.py             # escribe censo-regantes-segura.json
    python3 scripts/municipios/construir-censo-segura.py --resumen
    python3 scripts/municipios/construir-censo-segura.py --buscar "campo de cartagena"
"""
import datetime, html, json, os, re, sys, time, unicodedata, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "censo-regantes-segura.json")
API = "https://www.scrats.es/wp-json/wp/v2/comunidades?per_page=100&page={}"
INE_CACHE = os.path.expanduser("~/.cache/crm/municipios-ine.xlsx")
INE_URL = "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx"
CPRO = {"02": "Albacete", "03": "Alicante", "04": "Almería", "18": "Granada", "23": "Jaén",
        "30": "Murcia", "46": "Valencia"}
UA = {"User-Agent": "Mozilla/5.0 (crm-prospector; censo de regantes)"}


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/ ]", " ", s)).strip()


def get(url, binario=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read() if binario else r.read().decode("utf-8", "replace")


def municipios_ine():
    """{provincia: {norm(variante): oficial}} — incluye el articulo delante y las dos
    mitades de los nombres dobles («Elx/Elche»)."""
    if not os.path.exists(INE_CACHE):
        os.makedirs(os.path.dirname(INE_CACHE), exist_ok=True)
        urllib.request.urlretrieve(INE_URL, INE_CACHE)
    import openpyxl
    ws = openpyxl.load_workbook(INE_CACHE, read_only=True).active
    out = {}
    for r in ws.iter_rows(min_row=3, values_only=True):
        if not r or not r[4]:
            continue
        prov = CPRO.get(f"{int(r[1]):02d}")
        if not prov:
            continue
        nombre = str(r[4])
        m = re.match(r"(?i)^(.*), (el|la|los|las|l')$", nombre)
        oficial = (f"{m.group(2).capitalize()}{'' if m.group(2).endswith(chr(39)) else ' '}{m.group(1)}" if m else nombre)
        formas = {nombre, oficial} | {p.strip() for p in oficial.split("/")}
        for f in formas:
            out.setdefault(prov, {})[norm(f)] = oficial
    return out


STOP = {"de", "del", "la", "el", "los", "las", "s", "san", "santa"}


def _clave(s):
    """Para comparar con tolerancia: sin articulos ni abreviaturas de santo."""
    return " ".join(w for w in norm(s).replace("/", " ").split() if w not in STOP)


def municipio_de(direccion, ine):
    """El directorio escribe siempre «calle, CP, municipio». El CP da la provincia
    (a veces con el cero inicial perdido: «3390» es 03390 Benejuzar) y lo que va
    detras es el municipio, que se contrasta con el INE. Aqui SI se acepta que sea
    la capital («30006, Murcia»): el formato es fijo y no hay provincia colgando.
    Las pedanias («Beniajan», «Espinardo») no son municipio y quedan vacias."""
    m = re.search(r"\b(\d{4,5})\b", direccion or "")
    if not m:
        return None, None, None
    cp = m.group(1).zfill(5)
    prov = CPRO.get(cp[:2])
    if not prov:
        return None, None, cp
    munis = ine.get(prov, {})
    # tras el CP viene «, Murcia»: se quita la coma antes de trocear
    detras = re.split(r"[,;]", direccion[m.end():].lstrip(" ,;"))[0]
    detras = re.sub(r"[0-9º°ª]", " ", detras)
    candidatos = [detras] + [p for p in re.split(r"[\-/.]", detras) if p.strip()]
    for c in candidatos:
        n = norm(c)
        if n in munis:
            return munis[n], prov, cp
    # tolerante: «Pilar La Horadada», «S Miguel De Salinas», «Cuevas Almanzora»
    claves = {_clave(k): v for k, v in munis.items()}
    for c in candidatos:
        k = _clave(c)
        if k and k in claves:
            return claves[k], prov, cp
    return None, prov, cp


def construir():
    ine = municipios_ine()
    lista = []
    for pag in (1, 2):
        try:
            lista += json.loads(get(API.format(pag)))
        except Exception as e:  # la pagina 2 puede no existir si bajan de 100
            if pag == 1:
                raise
    unidades, sin = [], 0
    for i, e in enumerate(lista, 1):
        nombre = html.unescape(e["title"]["rendered"]).strip()
        cache = os.path.expanduser(f"~/.cache/crm/scrats/{e['slug']}.html")
        if os.path.exists(cache):
            pagina = open(cache, encoding="utf-8").read()
        else:
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            pagina = get(e["link"]); open(cache, "w", encoding="utf-8").write(pagina)
            time.sleep(0.4)
        texto = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", pagina)))
        dm = re.search(r"Direcci[oó]n:\s*(.+?)\s*(?:Tel[eé]fono|Fax|E-mail|Superficie|$)", texto)
        direccion = dm.group(1).strip() if dm else None
        sup = re.search(r"Superficie regable:\s*([\d.]+)\s*ha", texto)
        com = re.search(r"Num\. comuneros:\s*([\d.]+)", texto)
        muni, prov, cp = municipio_de(direccion, ine)
        if not muni:
            sin += 1
        tipo = ("SAT" if re.match(r"(?i)^s\.?a\.?t\b", nombre) else
                "comunidad de regantes" if re.match(r"(?i)^(c\.?\s?r\.?|c\.?g\.?|comunidad|sindicato|junta)", nombre)
                else "otro usuario")
        unidades.append({"nombre": nombre, "tipo": tipo, "direccion": direccion, "cp": cp,
                         "municipio": muni, "provincia": prov,
                         "superficie_regable_ha": float(sup.group(1).replace(".", "")) if sup else None,
                         "n_comuneros": int(com.group(1).replace(".", "")) if com else None,
                         "ficha": e["link"]})
        sys.stderr.write(f"\r  {i}/{len(lista)} {nombre[:40]:<40}")
    sys.stderr.write("\n")
    doc = {"_meta": {
        "fuente": "SCRATS — Sindicato Central de Regantes del Acueducto Tajo-Segura, directorio de comunidades (scrats.es/comunidades)",
        "descargado": datetime.date.today().isoformat(),
        "que_es": "Comunidades y usuarios del trasvase Tajo-Segura con la dirección postal de su SEDE, publicada por cada comunidad en su ficha del SCRATS.",
        "para_que": "Saber en qué municipio tiene la sede una comunidad de regantes de Murcia, Alicante o el Almanzora SIN deducirlo de su nombre.",
        "alcance": "Es una asociación, no un registro: solo las comunidades del trasvase. La CH del Segura no publica censo. El municipio sale del CP y del texto de la dirección, contrastado con el INE.",
        "unidades": len(unidades), "sin_municipio": sin,
    }, "unidades": unidades}
    json.dump(doc, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return doc


def main(argv):
    if os.path.exists(SALIDA) and "--reconstruir" not in argv and ("--buscar" in argv or "--resumen" in argv):
        doc = json.load(open(SALIDA, encoding="utf-8"))
    else:
        doc = construir()
        print(f"{SALIDA}: {doc['_meta']['unidades']} unidades · sin municipio {doc['_meta']['sin_municipio']}")
    if "--resumen" in argv:
        from collections import Counter
        for p, n in Counter((u["provincia"] or "—") for u in doc["unidades"]).most_common():
            print(f"  {n:>4}  {p}")
        for t, n in Counter(u["tipo"] for u in doc["unidades"]).most_common():
            print(f"  {n:>4}  {t}")
    if "--buscar" in argv:
        q = norm(argv[argv.index("--buscar") + 1])
        for u in doc["unidades"]:
            if q in norm(u["nombre"]):
                print(f"  {u['nombre'][:52]:<52} -> {u['municipio']} ({u['provincia']})   {u['direccion'] or '—'}")


if __name__ == "__main__":
    main(sys.argv[1:])
