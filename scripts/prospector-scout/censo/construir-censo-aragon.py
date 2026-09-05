#!/usr/bin/env python3
"""Censo determinista de mancomunidades y comarcas de Aragon.

POR QUE EXISTE
--------------
El agente `prospector-nuevos` dio por INEXISTENTES las mancomunidades de agua de
Zaragoza en agosto de 2026, y volvio a fallar en Teruel en septiembre. Se probo
a arreglarlo por prompt (variante vB, con instruccion explicita de mirar el
inventario de la Confederacion) y no funciono: vB no menciona la palabra
"mancomunidad" ni una vez en todo su informe. Los censos oficiales no son
cosechables sin navegador — la web de la Diputacion de Zaragoza da error de
certificado — y ningun texto en un .md hace que un WebFetch atraviese eso.

La solucion no es otra instruccion: es sacar el censo del agente. Este script
baja el listado UNA vez de datos abiertos oficiales y lo deja en un JSON local
que el agente lee con Read. Universo finito, coste cero por pase, cero invencion.

FUENTE
------
opendata.aragon.es (Gobierno de Aragon), catalogado en datos.gob.es. CSV abierto,
sin clave ni limite. Cuatro recursos:
  24 - tabla maestra de mancomunidades: denominacion, FINALIDAD, presidente,
       direccion, telefono, email, CIF. La `finalidad` es la que dice si
       gestiona agua, y viene del registro, no de una busqueda.
  60 - mancomunidad -> municipios (con codigo INE, del que sale la provincia)
  53 - cargos (presidente y otros) por mancomunidad
  57 - comarca -> municipios

ALCANCE — LEER ANTES DE FIARSE
------------------------------
Cubre SOLO ARAGON, porque es el portal de datos abiertos de Aragon. Para el
territorio propio de Manolo (Andalucia, Extremadura, Levante, Murcia) hace falta
el portal equivalente de cada comunidad, o el Registro de Entidades Locales del
ministerio, que existe pero exige navegador: su formulario no responde a POST.
Este fichero NO cubre comunidades de regantes: esas son corporaciones de derecho
publico adscritas a la confederacion, no entidades locales, y no estan en este
registro. Siguen siendo un hueco.

USO
---
    python3 construir-censo-aragon.py            # escribe censo-aragon.json
    python3 construir-censo-aragon.py --resumen  # ademas lo imprime por provincia
"""
import csv, io, json, os, sys, urllib.request, datetime

BASE = "https://opendata.aragon.es/GA_OD_Core/download?resource_id={}&formato=csv"
RECURSOS = {"maestra": 24, "municipios": 60, "cargos": 53, "comarcas": 57}
PROVINCIA = {"22": "Huesca", "44": "Teruel", "50": "Zaragoza"}

# La clasificacion es la UNICA parte de este script que es un juicio y no un
# dato, asi que va explicita para poder discutirla. Y tiene tres estados, no
# dos, por un fallo real: la Mancomunidad Ribera Bajo Huerva (55.526 hab) y la
# Ribera Izquierda del Ebro SI gestionan agua —la segunda cobra la tasa de agua
# y alcantarillado en su propia web— pero el registro les pone finalidad
# "Servicios común" y "Servicio de Bases y otros fines". Un filtro de dos
# estados las descarta, que es exactamente el error que este censo viene a
# corregir. Una finalidad generica NO es un "no": es un "hay que mirarlo".
AGUA = ("agua", "abastecimiento", "saneamiento", "alcantarillado", "depuracion",
        "residuales", "vertido", "potable")
GENERICA = ("fines varios", "fines generales", "servicios en comun", "servicios comun",
            "servicios municipales", "otros fines", "servicio de bases", "potenciar",
            "fines multiples", "servicios multiples", "")


def bajar(rid):
    url = BASE.format(rid)
    with urllib.request.urlopen(url, timeout=60) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8-sig", "replace"))))


def sin_tildes(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower())
                   if unicodedata.category(c) != "Mn")


def competencia_agua(nombre, finalidad):
    """'si' | 'posible' | 'no'. Ver el comentario de AGUA/GENERICA."""
    t = sin_tildes(nombre + " " + finalidad)
    if any(p in t for p in AGUA):
        return "si"
    f = sin_tildes(finalidad).strip()
    if any(g and g in f for g in GENERICA) or not f:
        return "posible"
    return "no"


def main():
    datos = {k: bajar(v) for k, v in RECURSOS.items()}

    # mancomunidad -> municipios, y de ahi la provincia (prefijo del codigo INE)
    munis, provs = {}, {}
    for r in datos["municipios"]:
        mid = r["id_man"]
        munis.setdefault(mid, []).append(r["municipio"].strip())
        provs.setdefault(mid, set()).add(PROVINCIA.get((r["codigo_mun"] or "")[:2], "?"))

    cargos = {}
    for r in datos["cargos"]:
        if (r.get("cargo") or "").strip().upper() in ("P", "PRESIDENTE"):
            cargos[r["manco_id"]] = r["nombre"].strip()

    mancos = []
    for r in datos["maestra"]:
        mid = r["manco_id"]
        nombre, fin = r["denominacion"].strip(), (r.get("finalidad") or "").strip()
        if not nombre:
            continue          # el volcado trae una fila vacia
        mancos.append({
            "id": mid, "nombre": nombre, "finalidad": fin,
            "agua": competencia_agua(nombre, fin),
            "presidente": (r.get("presidente") or "").strip() or cargos.get(mid, ""),
            "direccion": (r.get("direccion") or "").strip(),
            "telefono": (r.get("telefono") or "").strip(),
            "email": (r.get("email") or "").strip(),
            "cp": (r.get("cp") or "").strip(), "cif": (r.get("cif") or "").strip(),
            "disuelta": bool((r.get("f_orden_disolucion") or "").strip()),
            "provincias": sorted(provs.get(mid, [])) or ["?"],
            "municipios": sorted(munis.get(mid, [])),
        })

    comarcas = {}
    for r in datos["comarcas"]:
        c = comarcas.setdefault(r["comarca"].strip(), {"nombre": r["comarca"].strip(),
                                                       "municipios": [], "provincias": set()})
        c["municipios"].append(r["municipio"].strip())
        c["provincias"].add(PROVINCIA.get((r["codigo_mun"] or "")[:2], "?"))
    for c in comarcas.values():
        c["municipios"] = sorted(c["municipios"]); c["provincias"] = sorted(c["provincias"])

    salida = {
        "_generado": datetime.date.today().isoformat(),
        "_fuente": "opendata.aragon.es (Gobierno de Aragón), recursos 24/60/53/57",
        "_alcance": "SOLO ARAGÓN. No incluye comunidades de regantes: no son entidades "
                    "locales y no figuran en este registro.",
        "_como_usarlo": "Es un censo CERRADO: si una mancomunidad no está aquí, no existe "
                        "como entidad local registrada en Aragón. Al revés NO vale: que esté "
                        "aquí no garantiza que siga activa — mira el campo 'disuelta' y "
                        "confirma por teléfono antes de visitar.",
        "_clasificacion": {"si": "la finalidad registrada nombra el agua",
                           "posible": "finalidad genérica (fines varios, servicios en común…): "
                                      "NO descartarla, hay que comprobarlo. Dos de las tres "
                                      "mancomunidades que el barrido dio por inexistentes están aquí",
                           "no": "finalidad concreta y ajena al agua (transporte, residuos, piscinas…)"},
        "mancomunidades": sorted(mancos, key=lambda m: ({"si": 0, "posible": 1, "no": 2}[m["agua"]],
                                                        m["nombre"])),
        "comarcas": sorted(comarcas.values(), key=lambda c: c["nombre"]),
    }
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "censo-aragon.json")
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)

    agua = [m for m in mancos if m["agua"] == "si"]
    posible = [m for m in mancos if m["agua"] == "posible"]
    print(f"✅ {destino}")
    print(f"   {len(mancos)} mancomunidades · {len(agua)} de agua · {len(posible)} por comprobar"
          f" · {len(comarcas)} comarcas")
    if "--resumen" in sys.argv:
        for p in ("Zaragoza", "Huesca", "Teruel"):
            sel = [m for m in (agua + posible) if p in m["provincias"]]
            print(f"\n── {p}: {len([m for m in sel if m['agua']=='si'])} de agua"
                  f" + {len([m for m in sel if m['agua']=='posible'])} por comprobar")
            for m in sel:
                tel = f" · {m['telefono']}" if m["telefono"] else ""
                marca = "  " if m["agua"] == "si" else "? "
                print(f"  {marca}· {m['nombre'][:50]:<50} {m['finalidad'][:26]:<26}{tel}")
                print(f"     {len(m['municipios'])} municipios: {', '.join(m['municipios'][:6])}"
                      + (" …" if len(m["municipios"]) > 6 else ""))


if __name__ == "__main__":
    main()
