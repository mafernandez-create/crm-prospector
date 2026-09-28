#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Censo determinista de comunidades de regantes y usuarios de agua de Cataluna.

Por que existe: el censo de entes locales (censo-catalunya.json) avisa en su
propio _alcance de que NO incluye comunidades de regantes, porque no son
entidades locales. El hueco no era teorico: Tarragona se entrego con CINCO
comunidades de regantes cuando los registros oficiales pasan de cuatrocientas.
Es el mismo fallo que ya se cometio en Zaragoza, y es el que mas barato sale de
arreglar, porque los dos registros son publicos y descargables.

Dos administraciones se reparten Cataluna y hay que bajar las dos:
  - ACA (Agencia Catalana de l'Aigua): cuencas internas -- casi toda Barcelona
    y Girona, y la mitad este de Tarragona. Un PDF con tabla de verdad.
  - CHE (Confederacion Hidrografica del Ebro): cuenca del Ebro -- Lleida y el
    sur/oeste de Tarragona. Tres juntas de explotacion (11 Bajo Ebro, 12 Segre,
    13 Esera y Noguera Ribagorzana), en PDF de texto posicionado.

Una comunidad de regantes compra tuberia de riego y, cuando moderniza, redacta
proyecto. Para un prescriptor es cartera directa, no un contacto de relleno.

    python3 construir-censo-regantes.py [--refrescar]
"""
import argparse, json, os, re, sys, time, unicodedata, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "censo-regantes-catalunya.json")
CACHE = os.path.join(AQUI, ".pdf-cache")

# OJO con la ruta de la ACA: la carpeta es "03_comunitats_usuaris_aigua_i_regants".
# La variante "..._dusuaris_daigua_..." que aparece enlazada en varias paginas del
# propio portal devuelve 404.
FUENTES = {
    "aca": ("https://aca.gencat.cat/web/.content/20_Aigua/07_usos_de_laigua/"
            "03_comunitats_usuaris_aigua_i_regants/LListatComunitatsRegants.pdf"),
    "che-11": ("https://www.chebro.es/documents/20121/1480414/CENSO+JUNTA+DE+"
               "EXPLOTACI%C3%93N+N%C2%BA+11.+BAJO+EBRO.pdf/78f5d5a8-2a47-83d2-"
               "9e38-19f761ae285a?t=1706178560127"),
    "che-12": ("https://www.chebro.es/documents/20121/1480414/CENSO+JUNTA+DE+"
               "EXPLOTACI%C3%93N+N%C2%BA+12.+CUENCA+DEL+SEGRE.pdf/20042cb6-8f82-"
               "9034-5f18-f7850ba7db19?t=1706178561076"),
    "che-13": ("https://www.chebro.es/documents/20121/1230874/CENSO+JUNTA+DE+"
               "EXPLOTACI%C3%93N+N%C2%BA+13+CUENCAS+DEL+ESERA+Y+NOGUERA+"
               "RIBAGORZANA+2023.pdf/37316b88-3428-bd4c-f499-18dc4ee41842"
               "?t=1691135014097"),
}

PROV_CAT = {"tarragona": "Tarragona", "lleida": "Lleida", "lerida": "Lleida",
            "barcelona": "Barcelona", "girona": "Girona", "gerona": "Girona"}

# El censo de la CHE no son solo regantes: trae ayuntamientos, industrias y
# centrales. Todo eso vale, pero conviene saber que es cada cosa.
TIPOS = [
    (re.compile(r"comunidad general de|comunitat general de", re.I), "comunidad general de regantes"),
    (re.compile(r"regant|riego|reg\b|sequia|s[eè]quia|acequia", re.I), "comunidad de regantes"),
    (re.compile(r"comunidad de usuarios|comunitat d.usuaris", re.I), "comunidad de usuarios de agua"),
    (re.compile(r"ayuntamiento|ajuntament", re.I), "ayuntamiento"),
    (re.compile(r"consorcio|consorci|mancomunidad|mancomunitat", re.I), "consorcio o mancomunidad"),
    (re.compile(r"\bs\.?a\.?\b|\bs\.?l\.?\b|industri|papeler|central|electr", re.I), "industria o concesionaria"),
]


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def tipo_de(nombre):
    for rx, etiqueta in TIPOS:
        if rx.search(nombre):
            return etiqueta
    return "otro usuario de agua"


def bajar(clave, refrescar=False):
    os.makedirs(CACHE, exist_ok=True)
    destino = os.path.join(CACHE, clave + ".pdf")
    if os.path.exists(destino) and not refrescar:
        return destino
    req = urllib.request.Request(FUENTES[clave], headers={"User-Agent": "Mozilla/5.0"})
    print("   bajando %s..." % clave)
    with urllib.request.urlopen(req, timeout=180) as r, open(destino, "wb") as f:
        f.write(r.read())
    return destino


# --- ACA: cuencas internas ----------------------------------------------------
# El PDF trae tabla real, asi que find_tables la saca entera. Columnas:
# Comarca | Municipi/s | Comunitat | Data constitucio.
# El municipio puede venir como "ALCOVER/RIBA,LA": son varios municipios, y ese
# detalle importa -- una comunidad a caballo de dos terminos es mas grande.
def leer_aca(fitz, ruta, comarca_prov):
    filas = []
    doc = fitz.open(ruta)
    for pagina in doc:
        for tabla in pagina.find_tables().tables:
            for fila in tabla.extract():
                if len(fila) < 4 or not fila[0] or not fila[2]:
                    continue
                comarca = " ".join((fila[0] or "").split())
                nombre = " ".join((fila[2] or "").split())
                # La cabecera se repite en cada pagina y la pilla como fila.
                if not nombre or "Comunitat d'Usuaris" in nombre and "Comarca" in comarca:
                    continue
                if comarca.lower().startswith("comarca"):
                    continue
                municipios = [m.strip() for m in re.split(r"[/;]", " ".join((fila[1] or "").split())) if m.strip()]
                filas.append({
                    "nombre": nombre,
                    "tipo": tipo_de(nombre),
                    "comarca": comarca,
                    "municipios": municipios,
                    "provincia": comarca_prov.get(norm(comarca).lower()),
                    "constituida": (fila[3] or "").strip() or None,
                    "cuenca": "cuencas internas de Cataluna",
                    "organismo": "ACA",
                    "fuente": FUENTES["aca"],
                })
    return filas


# --- CHE: cuenca del Ebro -----------------------------------------------------
# Aqui no hay tabla: hay palabras con coordenadas. Se reconstruye por filas (misma
# y) y se reparte por x. Los limites salen de medir el PDF, no de adivinar.
# Los limites van en el HUECO entre columnas, no en el borde de una de ellas:
# "Tarragona" empieza en x=377,59 y un limite puesto en 378 se comia la provincia
# de todas las filas del censo. Las columnas arrancan en 16 / 250 / 377,6 / ~490.
X_LOCALIDAD, X_PROVINCIA, X_CIFRA = 240, 340, 460
# Estricto: hay titulares que se llaman "Grupo Sindical de Colonizacion Nº 422",
# y un ^GRUPO suelto los tomaba por cabeceras de seccion.
RX_GRUPO = re.compile(r"^GRUPO [a-z]\d*$", re.I)

# El censo de la CHE lista TAMBIEN a los concesionarios particulares, con nombre
# y apellidos (el grupo j4 son 1.501 personas fisicas). Eso es dato personal de
# particulares: no entra en el censo ni en el Excel que se entrega. Solo se
# guardan las entidades colectivas, que es lo unico que es cartera comercial.
ES_ORGANIZACION = re.compile(
    r"comunidad|comunitat|ayuntamiento|ajuntament|consorci|mancomunidad|mancomunitat|"
    r"sindical|sindicat|sociedad|societat|junta|canal|acequia|s[eè]quia|regant|"
    r"\bs\.?a\.?\b|\bs\.?l\.?\b|\bs\.?c\.?\b|\bc\.?b\.?\b|cooperativ|"
    r"agr[ií]cola|electr|central|papeler|industri|hidro|energ|club|federaci", re.I)
# "Apellidos, Nombre" es como el censo escribe a las personas.
RX_APELLIDOS_COMA = re.compile(r"^[^,]{3,60},\s*[^,]{2,40}$")


def es_persona_fisica(nombre):
    return bool(RX_APELLIDOS_COMA.match(nombre.strip())) and not ES_ORGANIZACION.search(nombre)
# Lineas de adorno del PDF que no son datos.
# "Junta de Explotacion Nº11..." es el titulillo que el PDF repite en cada pagina.
# Sin filtrarlo se pegaba al nombre de la entidad anterior cuando esta venia
# partida en dos lineas, y salian fichas como "Ayuntamiento de la Figuera Junta
# de Explotacion Nº11. Bajo Ebro Abastecimientos...".
RX_RUIDO = re.compile(r"^(CENSO DE USUARIOS|P[aá]gina \d+|Total$|Titular$|NINGUNO$|"
                      r"Junta de Explotaci[oó]n|Abastecimientos|Comunidades|"
                      r"Aprovechamientos|Usos industriales|Centrales|Otros usos|"
                      r"lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)", re.I)


def leer_che(fitz, ruta, junta, cuenca, personas):
    from collections import defaultdict
    filas, doc = [], fitz.open(ruta)
    grupo = None
    for pagina in doc:
        lineas = defaultdict(list)
        for x0, y0, _x1, _y1, texto, *_ in pagina.get_text("words"):
            lineas[round(y0)].append((x0, texto))
        for y in sorted(lineas):
            palabras = sorted(lineas[y])
            entera = " ".join(t for _, t in palabras).strip()
            if RX_GRUPO.match(entera):
                grupo = entera
                continue
            if RX_RUIDO.match(entera) or not entera:
                continue
            titular = " ".join(t for x, t in palabras if x < X_LOCALIDAD).strip()
            localidad = " ".join(t for x, t in palabras if X_LOCALIDAD <= x < X_PROVINCIA).strip()
            provincia = " ".join(t for x, t in palabras if X_PROVINCIA <= x < X_CIFRA).strip()
            cifra = " ".join(t for x, t in palabras if x >= X_CIFRA).strip()
            if not provincia:
                # Nombre largo partido en dos lineas: la segunda solo trae titular.
                if titular and not localidad and filas:
                    filas[-1]["nombre"] = (filas[-1]["nombre"] + " " + titular).strip()
                continue
            prov = PROV_CAT.get(norm(provincia).lower())
            if not prov:
                continue          # Huesca, Zaragoza, Navarra: no es nuestra zona
            if es_persona_fisica(titular):
                personas[0] += 1
                continue
            magnitud = cifra.split(" ")[0] if cifra else ""
            filas.append({
                "nombre": titular,
                "tipo": tipo_de(titular),
                "comarca": None,
                "municipios": [localidad] if localidad else [],
                "provincia": prov,
                "constituida": None,
                "cuenca": cuenca,
                "organismo": "CHE",
                "grupo_censo": grupo,
                "magnitud": magnitud or None,
                "fuente": FUENTES[junta],
            })
    return filas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refrescar", action="store_true", help="ignora el PDF cacheado")
    a = ap.parse_args()
    try:
        import fitz
    except ImportError:
        sys.exit("hace falta pymupdf:  python3 -m pip install pymupdf")

    # La provincia de cada comarca sale del censo de entes locales, que ya la trae.
    # Deducirla del nombre del municipio seria volver a inventarsela.
    comarca_prov = {}
    censo_entes = os.path.join(AQUI, "censo-catalunya.json")
    if os.path.exists(censo_entes):
        for c in json.load(open(censo_entes, encoding="utf-8")).get("comarcas", []):
            if c.get("provincias"):
                comarca_prov[norm(c["nombre"]).lower()] = c["provincias"][0]
    else:
        print("   (sin censo-catalunya.json: las comarcas de la ACA saldran sin provincia)",
              file=sys.stderr)

    print("- ACA, cuencas internas...")
    entidades = leer_aca(fitz, bajar("aca", a.refrescar), comarca_prov)
    print("   %d comunidades" % len(entidades))

    personas = [0]
    for junta, cuenca in (("che-11", "Ebro · Bajo Ebro"),
                          ("che-12", "Ebro · Segre"),
                          ("che-13", "Ebro · Esera y Noguera Ribagorzana")):
        antes = len(entidades)
        entidades += leer_che(fitz, bajar(junta, a.refrescar), junta, cuenca, personas)
        print("- CHE %s: %d entidades en provincia catalana" % (junta[-2:], len(entidades) - antes))
    print("- %d concesionarios particulares descartados (datos personales)" % personas[0])

    # Dedupe por nombre+provincia. Una misma comunidad puede salir en dos juntas
    # cuando riega a caballo de dos cuencas; se queda una y se anotan las dos.
    unicas = {}
    for e in entidades:
        k = (norm(e["nombre"]).lower(), e["provincia"])
        if k in unicas:
            prev = unicas[k]
            if e["cuenca"] not in prev["cuenca"]:
                prev["cuenca"] += " + " + e["cuenca"]
            for m in e["municipios"]:
                if m not in prev["municipios"]:
                    prev["municipios"].append(m)
        else:
            unicas[k] = e
    entidades = sorted(unicas.values(), key=lambda e: (e["provincia"] or "zz", e["nombre"]))

    censo = {
        "_generado": time.strftime("%Y-%m-%d"),
        "_fuente": "ACA · Llistat de comunitats d'usuaris d'aigua i de regants (cuencas "
                   "internas) + CHE · censos de las juntas de explotacion 11, 12 y 13 "
                   "(cuenca del Ebro). Los dos son registros oficiales publicos.",
        "_alcance": "Comunidades de regantes y de usuarios de agua con presencia en "
                    "Barcelona, Girona, Lleida o Tarragona. De los censos de la CHE se "
                    "descartan las filas cuya provincia es Huesca, Zaragoza o Navarra: "
                    "existen, pero no son de esta zona.",
        "_como_usarlo": "Esto es un REGISTRO, no una busqueda. Si una comunidad esta "
                        "aqui, existe: no hay que verificar su existencia, solo su "
                        "contacto y su contexto comercial. Y al reves: que una comunidad "
                        "NO aparezca aqui no prueba que no exista, porque el censo de la "
                        "CHE solo lista a quien tiene voto en la junta.",
        "_personas_fisicas": "EXCLUIDAS a proposito. El censo de la CHE lista con "
                             "nombre y apellidos a los concesionarios particulares "
                             "(el grupo j4 son mas de mil). Son datos personales de "
                             "particulares, no cartera: no entran aqui ni en el Excel "
                             "que se entrega. Solo quedan entidades colectivas.",
        "_provincia_es_la_del_titular": "OJO: en los censos de la CHE la provincia es "
                             "la del domicilio del titular, no la del regadio. Por eso "
                             "aparecen titulares con domicilio en Barcelona aunque la "
                             "cuenca del Ebro no riegue esa provincia. Para saber donde "
                             "esta el agua, mirar el municipio y la junta.",
        "_sin_contacto": "Ninguno de los dos registros publica telefono ni correo. Da "
                         "nombre, municipio y tamano, que es lo que permite priorizar a "
                         "quien llamar; el telefono se busca despues, una por una.",
        "total": len(entidades),
        "entidades": entidades,
    }
    json.dump(censo, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    porprov = {}
    for e in entidades:
        d = porprov.setdefault(e["provincia"] or "(sin provincia)", {})
        d[e["tipo"]] = d.get(e["tipo"], 0) + 1
    print("\nOK -> %s\n  %d entidades" % (SALIDA, len(entidades)))
    for p, d in sorted(porprov.items()):
        print("  %-16s %4d   %s" % (p, sum(d.values()),
                                    ", ".join("%s: %d" % kv for kv in sorted(d.items(), key=lambda x: -x[1])[:3])))


if __name__ == "__main__":
    main()
