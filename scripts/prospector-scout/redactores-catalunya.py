#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quien redacta de verdad los proyectos de agua en Cataluna, sacado del registro.

Por que existe: Cataluna licita por su propia plataforma, asi que el volcado de
la Plataforma del Estado (placsp-agua.json) ve solo una parte. Los cuatro scouts
de Cataluna avisaron de ese hueco cada uno por su lado. La plataforma catalana
lo publica entero como dato abierto, y un registro no se le pregunta a un modelo.

Fuente: Generalitat, dataset hb6v-jcbf "Contractacio publica a Catalunya:
inscripcions al Registre public de contractes" (3,7 M de filas). Sin clave.
Incluye entes locales, no solo Generalitat, que es justo lo que hacia falta.

Para un prescriptor lo que vale no es quien construye, sino quien REDACTA: quien
escribe el pliego decide la marca. Por eso se filtra por descripcion de proyecto
y CPV de servicios de ingenieria, no por obra ejecutada.

    python3 redactores-catalunya.py [--desde 2024] [--salida fichero.json]
"""
import argparse, json, os, re, sys, unicodedata, urllib.parse, urllib.request

BASE = "https://analisi.transparenciacatalunya.cat/resource/hb6v-jcbf.json"
AQUI = os.path.dirname(os.path.abspath(__file__))
CENSO = os.path.join(AQUI, "censo", "censo-catalunya.json")

AGUA = ["SANEJAMENT", "ABASTAMENT", "CLAVEGUERAM", "AIGUA", "AIGÜES", "EDAR",
        "DIPÒSIT", "POTABLE", "DEPURAD", "COL·LECTOR", "REGADIU", "ETAP"]
# Redaccion y direccion de obra: la fase en la que aun se puede prescribir.
PROYECTO = ["REDACCI", "PROJECTE", "DIRECCI% D%OBRA", "ESTUDI", "PLA DIRECTOR"]
CPV_SERVICIOS = ["712", "713"]          # ingenieria y consultoria tecnica
# El dataset usa esto como valor de adjudicatario cuando el lote queda desierto.
NO_EMPRESA = re.compile(r"^(lot desert|desert)$", re.I)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def pedir(**kw):
    u = BASE + "?" + urllib.parse.urlencode(kw)
    with urllib.request.urlopen(u, timeout=180) as r:
        return json.load(r)


def construir_where(desde):
    agua = " OR ".join("upper(descripcio_expedient) like '%%%s%%'" % t for t in AGUA)
    proy = " OR ".join("upper(descripcio_expedient) like '%%%s%%'" % t for t in PROYECTO)
    cpv = " OR ".join("codi_cpv like '%s%%'" % c for c in CPV_SERVICIOS)
    return ("exercici >= %d AND adjudicatari IS NOT NULL AND (%s) AND ((%s) OR (%s))"
            % (desde, agua, proy, cpv))


# --- Que clase de contrato es -------------------------------------------------
# Hace falta porque el filtro de la consulta es deliberadamente ancho (para no
# perder nada) y cuela obra ejecutada: "execucio del PROJECTE d'obres redactat
# per..." habla de un proyecto que redacto OTRO. Quien nos interesa es quien
# firma la redaccion, no quien la ejecuta.
#
# El dataset trae el tipo oficial de contrato y el CPV. Entre los dos deciden;
# el texto solo desempata cuando el CPV viene vacio.
ES_SERVICIO = re.compile(r"SERVEIS", re.I)
ES_OBRA = re.compile(r"OBRES", re.I)
CPV_INGENIERIA = ("71",)          # arquitectura, ingenieria y servicios tecnicos
CPV_OBRA = ("45",)
# "REDACCIO", si; "REDACTAT PER", no: ahi el proyecto ya estaba redactado.
TEXTO_REDACCION = re.compile(r"REDACCI|DIRECCI\w* D\W*OBRA|PLA DIRECTOR|"
                             r"ESTUDI\w* (?:DE|D\W|PREVI|INFORMATIU)", re.I)


def clase_contrato(f):
    cpv = (f.get("codi_cpv") or "").strip()
    tipo = f.get("tipus_contracte") or ""
    if cpv.startswith(CPV_INGENIERIA):
        return "redaccion"
    if cpv.startswith(CPV_OBRA) or ES_OBRA.search(tipo):
        return "obra"
    if ES_SERVICIO.search(tipo) and TEXTO_REDACCION.search(norm(f.get("descripcio_expedient") or "")):
        return "redaccion"
    return "otros"


def mapa_municipios():
    """Municipio -> provincia, del censo. Para repartir por provincia hay que
    mirar el ORGANISMO que contrata: el dataset no trae campo de provincia."""
    if not os.path.exists(CENSO):
        print("   (sin censo-catalunya.json: no habra reparto por provincia)", file=sys.stderr)
        return {}
    censo = json.load(open(CENSO, encoding="utf-8"))
    m = {}
    for c in censo.get("comarcas", []):
        prov = (c.get("provincias") or [None])[0]
        if not prov:
            continue
        for mun in c.get("municipios", []):
            if mun:
                m[norm(mun)] = prov
    return m


def provincia_de(organismo, mapa):
    """Gana el nombre de municipio MAS LARGO que aparezca. Si no, 'Sant Just'
    se comeria a 'Sant Just Desvern' y el reparto saldria mal."""
    o = norm(organismo)
    mejor, prov = "", None
    for mun, p in mapa.items():
        if len(mun) > len(mejor) and re.search(r"\b%s\b" % re.escape(mun), o):
            mejor, prov = mun, p
    return prov


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=int, default=2024)
    ap.add_argument("--salida", default=os.path.join(AQUI, "..", "..", "agentes",
                                                     "output", "_datos",
                                                     "redactores-catalunya.json"))
    a = ap.parse_args()

    where = construir_where(a.desde)
    total = int(pedir(**{"$select": "count(1)", "$where": where})[0]["count_1"])
    print("- %d contratos de agua con fase de proyecto desde %d" % (total, a.desde))

    filas, paso = [], 5000
    while len(filas) < total:
        lote = pedir(**{"$where": where, "$limit": paso, "$offset": len(filas),
                        "$order": "data_adjudicacio DESC",
                        "$select": ("adjudicatari, organisme_contractant, descripcio_expedient,"
                                    " import_adjudicacio, data_adjudicacio, codi_cpv,"
                                    " codi_expedient, tipus_contracte")})
        if not lote:
            break
        filas += lote
        print("   %d/%d" % (len(filas), total))

    mapa = mapa_municipios()
    print("- %d municipios en el mapa de provincias" % len(mapa))

    emp = {}
    for f in filas:
        nom = (f.get("adjudicatari") or "").strip()
        if not nom or NO_EMPRESA.match(nom):
            continue
        e = emp.setdefault(norm(nom), {
            "nombre": nom, "contratos": 0, "importe": 0.0,
            "provincias": {}, "organismos": {}, "ejemplos": [],
            "redaccion": 0, "obra": 0, "otros": 0})
        e["contratos"] += 1
        e[clase_contrato(f)] += 1
        try:
            e["importe"] += float(f.get("import_adjudicacio") or 0)
        except (TypeError, ValueError):
            pass
        org = (f.get("organisme_contractant") or "").strip()
        e["organismos"][org] = e["organismos"].get(org, 0) + 1
        p = provincia_de(org, mapa)
        if p:
            e["provincias"][p] = e["provincias"].get(p, 0) + 1
        if len(e["ejemplos"]) < 5 and clase_contrato(f) == "redaccion":
            e["ejemplos"].append({
                "organismo": org,
                "objeto": (f.get("descripcio_expedient") or "")[:220],
                "fecha": (f.get("data_adjudicacio") or "")[:10],
                "importe": f.get("import_adjudicacio"),
                "expediente": f.get("codi_expedient"),
            })

    for e in emp.values():
        e["provincia_principal"] = (max(e["provincias"], key=e["provincias"].get)
                                    if e["provincias"] else None)
        e["organismos_top"] = sorted(e["organismos"].items(), key=lambda x: -x[1])[:6]
        del e["organismos"]

    # Se ordena por contratos de REDACCION, no por el total: un operador del ciclo
    # del agua puede tener cien contratos y no redactar ni uno.
    ranking = sorted(emp.values(), key=lambda e: (-e["redaccion"], -e["contratos"]))
    salida = os.path.abspath(a.salida)
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    json.dump({
        "_generado": __import__("time").strftime("%Y-%m-%d"),
        "_fuente": "Generalitat de Catalunya · dades obertes · dataset hb6v-jcbf "
                   "(Registre public de contractes)",
        "_criterio": "Adjudicaciones desde %d cuya descripcion habla de agua Y de "
                     "proyecto/redaccion/direccion de obra, o con CPV de servicios "
                     "de ingenieria (712x/713x). Cada adjudicacion se clasifica "
                     "despues en redaccion / obra / otros, y el ranking va por "
                     "REDACCION: es la fase en la que todavia se puede prescribir." % a.desde,
        "_aviso": "La provincia se DEDUCE del nombre del organismo que contrata, "
                  "cruzado con el censo de municipios. Un organismo supramunicipal "
                  "(ACA, Generalitat, consorcios) no cae en ninguna provincia: sale "
                  "con provincia_principal nula, y eso NO significa que no opere alli.",
        "contratos_analizados": len(filas),
        "empresas": ranking,
    }, open(salida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("\nOK -> %s" % salida)
    print("  %d empresas sobre %d contratos\n" % (len(ranking), len(filas)))
    print("  %-44s %5s %5s %5s  %s" % ("EMPRESA", "REDAC", "OBRA", "OTROS", "PROV"))
    for e in ranking[:25]:
        print("  %-44s %5d %5d %5d  %s"
              % (e["nombre"][:44], e["redaccion"], e["obra"], e["otros"],
                 e["provincia_principal"] or "-"))


if __name__ == "__main__":
    main()
