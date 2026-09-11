#!/usr/bin/env python3
"""Censo de comunidades de regantes de la cuenca del Jucar: nombre -> municipio.

POR QUE EXISTE
--------------
El municipio de una comunidad de regantes NO se puede sacar de su direccion
postal ni de su nombre. El 10-sep-2026 se descubrio un lote de 37 fichas de
regantes con la direccion contaminada (dos sedes murcianas copiadas encima de
comunidades de Almeria, Malaga, Badajoz o Cuenca), y el nombre solo resolvia en
14 de 27, con ambiguedad («CR Balazote-La Herrera» lleva dos municipios).

Lo que si vale es el censo oficial de la Confederacion: una tabla con nombre,
municipio, provincia, superficie y junta de explotacion de cada comunidad de
usuarios. Universo finito, cero invencion. Con el se confirmaron de golpe El
Salobral -> Albacete, Balazote-La Herrera -> Balazote, Alcalali-Jalon ->
Alcalali y Valle de Benejama -> Beneixama.

ALCANCE — LEER ANTES DE FIARSE
------------------------------
Cubre SOLO la cuenca del Jucar: Valencia, Alicante, Albacete, Cuenca y trozos de
Castellon, Teruel y Tarragona. El PDF de la CHJ esta fechado el 17-10-2016: las
comunidades constituidas despues no estan, y alguna puede haber cambiado de sede.
Para Andalucia hace falta el equivalente de la Junta (Cuencas Mediterraneas) y
de la CH del Guadalquivir; para Extremadura, la del Guadiana; para Murcia, la del
Segura. Este script es el molde: cambiar la URL y el parser cuando aparezcan.

USO
---
    python3 scripts/municipios/construir-censo-jucar.py              # escribe censo-regantes-jucar.json
    python3 scripts/municipios/construir-censo-jucar.py --resumen    # ademas lo imprime por provincia
    python3 scripts/municipios/construir-censo-jucar.py --buscar salobral   # busca por nombre
"""
import io, json, os, re, sys, unicodedata, urllib.request, datetime

URL = ("https://www.chj.es/es-es/ciudadano/masinformaciontramites/Documents/"
       "Procedimientos%20relativos%20al%20regimen%20de%20Comunidades%20de%20Usuarios_Regantes/"
       "Comunidades_Usuarios_Censo.pdf")
AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "censo-regantes-jucar.json")
CACHE = os.path.expanduser("~/.cache/crm/censo-chj.pdf")
PROVINCIAS = ("Valencia", "Alicante", "Albacete", "Cuenca", "Castellón", "Castellon", "Teruel", "Tarragona")
RE_REF = re.compile(r"^\d{4}[A-Z]{1,2}\d")           # 1988IP0566, 2005R46184
RE_PIE = re.compile(r"^\d+ de \d+ \d{2}/\d{2}/\d{4}")  # «3 de 14 17/10/2016»


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn").lower()).strip()


def texto_del_pdf():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        sys.stderr.write("Bajando el censo de la CHJ (una sola vez)...\n")
        urllib.request.urlretrieve(URL, CACHE)
    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader
    return "\n".join(p.extract_text() or "" for p in PdfReader(CACHE).pages)


def filas(texto):
    """Une las lineas partidas y devuelve una fila logica por comunidad."""
    fecha = None
    out, actual = [], ""
    for ln in texto.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("COMUNIDADES DE USUARIOS") or ln.startswith("Ref. Local"):
            continue
        m = RE_PIE.match(ln)
        if m:
            fecha = fecha or ln.split()[-1]
            continue
        if RE_REF.match(ln) and actual and re.search(r"(%s)\b" % "|".join(PROVINCIAS), actual):
            out.append(actual); actual = ln
        else:
            actual = (actual + " " + ln).strip() if actual else ln
    if actual:
        out.append(actual)
    return out, fecha


def parsear(fila):
    """<refs> <NOMBRE EN MAYUSCULAS> <Municipio> <Provincia> [superficie] <JUNTA>.
    El nombre va en mayusculas y el municipio en minusculas: la frontera es el
    ultimo token todo en mayusculas antes de la provincia."""
    m = re.search(r"\s(%s)\s+(?:([\d.]+(?:,\d{2})?)\s+)?([A-ZÀ-Ü'\- ]+)$" % "|".join(PROVINCIAS), fila)
    if not m:
        return None
    prov, sup, junta = m.group(1), m.group(2), m.group(3).strip()
    cabeza = fila[:m.start()].strip()
    toks = cabeza.split()
    # refs: tokens iniciales hasta que aparece algo que no es referencia ni guion/coma
    i = 0
    while i < len(toks) and (RE_REF.match(toks[i]) or toks[i] in ("-", ",") or re.match(r"^\d{4}[A-Z]", toks[i])):
        i += 1
    refs = " ".join(toks[:i])
    resto = toks[i:]
    # «2000R91721 y otros relacionados C.R. BALAZOTE...»: la coletilla va con las refs
    if resto[:3] == ["y", "otros", "relacionados"]:
        refs += " y otros relacionados"; resto = resto[3:]
    # frontera nombre/municipio
    ult = max((k for k, t in enumerate(resto)
               if re.fullmatch(r"[A-ZÀ-Ü0-9.,'´`\"()/\-]+", t) and re.search(r"[A-ZÀ-Ü]", t)), default=-1)
    nombre = " ".join(resto[:ult + 1])
    muni = " ".join(resto[ult + 1:])
    if not nombre or not muni:
        return None
    return {"ref": refs, "nombre": nombre, "municipio": muni, "provincia": prov.replace("Castellon", "Castellón"),
            "superficie_ha": float(sup.replace(".", "").replace(",", ".")) if sup else None,  # «1.730» y «1.730,00» son lo mismo
            "junta_explotacion": junta}


def construir():
    texto = texto_del_pdf()
    crudas, fecha = filas(texto)
    ok, fallidas = [], []
    for f in crudas:
        p = parsear(f)
        (ok if p else fallidas).append(p or f)
    doc = {"_meta": {
        "fuente": URL,
        "fecha_del_censo": fecha or "desconocida",
        "descargado": datetime.date.today().isoformat(),
        "que_es": "Comunidades de usuarios (regantes) de la cuenca del Jucar con su municipio, segun el censo oficial de la CHJ.",
        "para_que": "Saber en que municipio esta una comunidad de regantes SIN deducirlo de su direccion ni de su nombre.",
        "alcance": "Solo cuenca del Jucar. Andalucia, Extremadura y Murcia necesitan su propio censo.",
        "filas_sin_parsear": len(fallidas),
    }, "comunidades": ok}
    json.dump(doc, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return doc, fallidas


def main(argv):
    if os.path.exists(SALIDA) and "--reconstruir" not in argv and ("--buscar" in argv or "--resumen" in argv):
        doc, fallidas = json.load(open(SALIDA, encoding="utf-8")), []
    else:
        doc, fallidas = construir()
        print(f"{SALIDA}: {len(doc['comunidades'])} comunidades · sin parsear {len(fallidas)} · censo de {doc['_meta']['fecha_del_censo']}")
        for f in fallidas[:10]:
            print("   ✗", f[:110])
    if "--resumen" in argv:
        from collections import Counter
        for p, n in Counter(c["provincia"] for c in doc["comunidades"]).most_common():
            print(f"  {n:>4}  {p}")
    if "--buscar" in argv:
        q = norm(argv[argv.index("--buscar") + 1])
        for c in doc["comunidades"]:
            if q in norm(c["nombre"]):
                print(f"  {c['nombre']:<60} -> {c['municipio']} ({c['provincia']})")


if __name__ == "__main__":
    main(sys.argv[1:])
