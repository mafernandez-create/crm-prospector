#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Censo determinista de entidades locales de Cataluna, hermano del de Aragon.

Fuente: portal de datos abiertos de la Generalitat (Socrata), dataset
"Dades generals dels ens locals de Catalunya" (6nei-4b44), que es la cara
publica del registro MUNICAT. Sin clave, sin login.

Por que existe: el scout dio por INEXISTENTES las mancomunidades de agua dos
veces en Aragon. Lo que se puede bajar de un registro no se le pregunta a un
modelo. Aqui ademas el registro trae telefono Y correo, que el de Aragon no.

Salida: censo-catalunya.json, con el mismo esquema que censo-aragon.json para
que dossier.py lo lea sin tocar nada.

    python3 construir-censo-catalunya.py
"""
import json, os, re, sys, time, unicodedata, urllib.request

BASE = "https://analisi.transparenciacatalunya.cat/resource/6nei-4b44.json"
AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "censo-catalunya.json")

# Los tipos que pueden prescribir o contratar tuberia. "Ens de gestio" es la
# figura catalana que engloba organismos autonomos y empresas publicas locales:
# ahi viven las companias municipales de aguas.
# OJO: los nombres van EXACTAMENTE como los escribe el registro, con acentos.
# La primera version los puso sin acentos y el filtro SQL se comio 342 de los
# 358 "Ens de gestio", que es justo donde viven las companias municipales de
# aguas. Si algun dia cambian, mirar primero $select=nomtipus&$group=nomtipus.
TIPOS_ENTES = ["Mancomunitats", "Consorcis", "Ens de gesti\u00f3", "Entitats metropolitanes",
               "Comunitat de municipis", "Soc. Merc. Capital Mixt",
               "Soc. Merc. Capital \u00cdntegrament Local"]

# Tres estados, no dos: generica significa "hay que mirarlo", nunca "no".
AGUA = re.compile(r"aig[uü]|agua|aqua|sanejament|saneamiento|abastament|abastecim|"
                  r"depurad|clavegueram|alcantarill|hidr[au]|residuals|residuales|"
                  r"edar|potable|reg(?:ants|antes|adiu)|s[eè]quia|acequia|canal\b|"
                  r"conca|cuenca|riu\b|ter\b|llobregat|segarra|urgell", re.I)
NO_AGUA = re.compile(r"esport|deport|cultur|m[uú]sic|teatre|bibliotec|museu|museo|"
                     r"turis|ense[nñ]|escola|educa|social|sanitari|salut|"
                     r"bomber|forestal|incendi|adf\b|ocupaci|treball|"
                     r"comer[cç]|promoci[oó] econ|fira|mercat|"
                     r"cementiri|funerari|taxi|transport escolar|"
                     r"inform[aà]tic|telecomunicac|energ", re.I)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def bajar(where, limite=2000):
    url = (BASE + "?$limit=" + str(limite) + "&$where=" + urllib.request.quote(where))
    for intento in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            if intento == 2:
                raise
            print("   reintento tras %s" % e, file=sys.stderr)
            time.sleep(3)


def clasificar(nombre, tipo):
    n = norm(nombre)
    if AGUA.search(n):
        return "si"
    if NO_AGUA.search(n):
        return "no"
    return "generica"


def main():
    # 1. Los entes supramunicipales y las empresas publicas.
    print("- entes supramunicipales y empresas publicas...")
    tipos_sql = ",".join("'%s'" % t for t in TIPOS_ENTES)
    filas = bajar("nomtipus in (%s)" % tipos_sql, 3000)
    # El registro escribe los tipos con acentos; el filtro anterior puede fallar
    # en alguno, asi que de rebote nos traemos todo lo que suene a agua.
    filas += [f for f in bajar("upper(nom_complert) like '%%AIG%%' or "
                               "upper(nom_complert) like '%%AGUA%%' or "
                               "upper(nom_complert) like '%%SANEJAMENT%%'", 2000)
              if f.get("nomtipus") not in ("Nuclis", "Entitats de poblacio",
                                           "Entitats de població", "Municipis")]

    entes, vistos = [], set()
    for f in filas:
        cid = f.get("codi_ens")
        if not cid or cid in vistos:
            continue
        vistos.add(cid)
        nombre = f.get("nom_complert") or f.get("ordenacio_alfabetica") or ""
        entes.append({
            "id": cid,
            "nombre": nombre,
            "finalidad": f.get("nomtipus") or "",
            "agua": clasificar(nombre, f.get("nomtipus")),
            "presidente": f.get("president") or f.get("gerent") or "",
            "direccion": ((f.get("adre_a") or "") + (" - " + f["municipi"] if f.get("municipi") else "")).strip(" -"),
            "telefono": f.get("telefon") or "",
            "email": f.get("e_mail") or "",
            "cp": f.get("codipostal") or "",
            "cif": f.get("cif") or "",
            "disuelta": (f.get("dissolt") or "N").upper() == "S",
            "provincias": [f["provincia"]] if f.get("provincia") else [],
            "municipios": [f["municipi"]] if f.get("municipi") else [],
            "comarca": f.get("comarca") or "",
            "web_registro": (f.get("municat") or {}).get("url", ""),
        })
    entes = [e for e in entes if not e["disuelta"]]

    # 2. Comarcas, con sus municipios sacados de las fichas municipales.
    print("- comarcas y sus municipios...")
    muni = bajar("nomtipus='Municipis'", 1200)
    porcomarca = {}
    for m in muni:
        c = m.get("comarca")
        if not c:
            continue
        d = porcomarca.setdefault(c, {"nombre": c, "municipios": [], "provincias": []})
        d["municipios"].append(m.get("nom_complert") or m.get("municipi") or "")
        if m.get("provincia") and m["provincia"] not in d["provincias"]:
            d["provincias"].append(m["provincia"])
    comarcas = sorted(porcomarca.values(), key=lambda x: x["nombre"])
    for c in comarcas:
        c["municipios"].sort()

    censo = {
        "_generado": time.strftime("%Y-%m-%d"),
        "_fuente": "Generalitat de Catalunya · dades obertes · dataset 6nei-4b44 "
                   "(Dades generals dels ens locals, registro MUNICAT)",
        "_alcance": "Cataluna: Barcelona, Girona, Lleida y Tarragona. "
                    "NO incluye comunidades de regantes (no son entidades locales): "
                    "para eso hay que pedir a la Confederacion Hidrografica (CHE para la "
                    "cuenca del Ebro, ACA para las cuencas internas) su registro de "
                    "comunidades de usuarios. Tampoco incluye los municipios que integra "
                    "cada mancomunidad o consorcio: el dataset solo da el municipio de la "
                    "SEDE. No concluir de aqui que una mancomunidad cubre un solo pueblo.",
        "_como_usarlo": "Esto es un REGISTRO, no una busqueda. Si una entidad esta aqui, "
                        "existe: no hay que verificar su existencia, solo su contexto "
                        "comercial. Al fusionar con datos ya verificados, ENRIQUECER, "
                        "nunca sustituir.",
        "_clasificacion": "El campo 'agua' tiene TRES estados. 'si' = el nombre lo dice. "
                          "'no' = el nombre dice otra finalidad (deporte, cultura...). "
                          "'generica' = NO SE SABE, hay que mirarlo. Un filtro binario que "
                          "trate 'generica' como 'no' reproduce justo el error que este "
                          "censo viene a corregir.",
        "mancomunidades": sorted(entes, key=lambda e: e["nombre"]),
        "comarcas": comarcas,
    }
    json.dump(censo, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    porprov = {}
    for e in entes:
        for p in e["provincias"]:
            porprov.setdefault(p, {"si": 0, "generica": 0, "no": 0})[e["agua"]] += 1
    print("\nOK -> %s" % SALIDA)
    print("  %d entes (%d comarcas)" % (len(entes), len(comarcas)))
    for p, c in sorted(porprov.items()):
        print("  %-12s agua si:%-4d generica:%-4d no:%-4d" % (p, c["si"], c["generica"], c["no"]))


if __name__ == "__main__":
    main()
