#!/usr/bin/env python3
"""Censo de comunidades de regantes de Andalucia (distritos mediterraneos y
atlanticos): nombre -> municipio, sacado del Inventario de Regadios (ICRA 2008).

POR QUE EXISTE
--------------
La Junta de Andalucia NO publica un censo de comunidades de usuarios como el de
la Confederacion del Jucar (ver construir-censo-jucar.py). El Plan Hidrologico
de las Cuencas Mediterraneas trabaja por unidades de demanda, sin lista de
comunidades, y el portal de datos abiertos no tiene nada bajo «regantes».

Lo que si existe es el Inventario y Caracterizacion de los Regadios de Andalucia
(ICRA, actualizacion 2008), que REDIAM sirve como shapefiles. Su tabla de
atributos `UA_Detalle.dbf` tiene 979 Unidades de Agregacion: comunidades de
regantes de mas de 200 ha, zonas de riego que agrupan comunidades pequeñas, y
regantes particulares. NO trae columna de municipio, pero el codigo de zona lo
lleva cifrado: `C0401901` = C (comunidad) + 04 (Almeria) + 019 (Bacares) + 01.
Se comprobo contra el diccionario del INE y contra el area de riego que declara
cada fila: C.R. Sol y Arena -> Roquetas de Mar (el 11-sep costo una hora
descubrirlo a mano), C.R. de rio Guaro -> Viñuela (Axarquia, no Coin),
C.R. Sindicato de Riego Dalias -> Dalias.

ALCANCE — LEER ANTES DE FIARSE
------------------------------
- Es de 2008. Comunidades constituidas o fusionadas despues no estan.
- Cubre los distritos Mediterraneo, Guadalete-Barbate y Tinto-Odiel-Piedras:
  Almeria (371), Malaga (241), Granada (152), Cadiz (96) y Huelva (75). De
  Cordoba solo Los Pedroches (cuenca del Guadiana) y de Sevilla y Jaen apenas
  nada: el Guadalquivir es de la Confederacion, no de la Junta, y no esta.
- El municipio es el del CODIGO de la unidad, que es donde el inventario ancla
  el recinto, no necesariamente la sede administrativa. Para una comunidad de
  200 ha coinciden casi siempre; para una zona de riego que agrupa varias, es
  uno de los municipios de la zona.
- Seis codigos de Granada ya no existen en el INE (fusiones): quedan con
  municipio vacio, no inventado.

FUENTE
------
REDIAM, «Inventario y Caracterizacion de Regadios en Andalucia. Distritos
Mediterraneos y Atlanticos, 2008», recurso compartido publico (Nextcloud). Se
baja solo el .dbf (1,4 MB), no los shapefiles. Lector dBase III propio para no
depender de nada.

USO
---
    python3 scripts/municipios/construir-censo-andalucia.py             # escribe censo-regantes-andalucia.json
    python3 scripts/municipios/construir-censo-andalucia.py --resumen
    python3 scripts/municipios/construir-censo-andalucia.py --buscar "sol y arena"
"""
import datetime, json, os, re, struct, sys, unicodedata, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "censo-regantes-andalucia.json")
CACHE = os.path.expanduser("~/.cache/crm/icra2008-UA_Detalle.dbf")
INE_CACHE = os.path.expanduser("~/.cache/crm/municipios-ine.xlsx")
INE_URL = "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx"
CARPETA = ("/Inf_archivo/10_SISTEMAS_PRODUCTIVOS/02_AGRICULTURA_GANADERIA/"
           "Inventario_Regadios_2008/InfGeografica/InfVectorial/Shapes/ETRS89")
URL = ("https://portalrediam.cica.es/descargas/index.php/s/descargas/download?path="
       + urllib.parse.quote(CARPETA) + "&files=UA_Detalle.dbf")
FICHA = "https://portalrediam.cica.es/geonetwork/srv/api/records/15f843dd-8ac0-4847-ac8a-ed5c58637b23"
TIPO_LETRA = {"C": "comunidad de regantes", "Z": "zona de riego", "P": "regante particular",
              "S": "SAT", "J": "junta central"}


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn").lower()).strip()


def bajar(url, destino):
    if not os.path.exists(destino):
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        sys.stderr.write(f"Bajando {os.path.basename(destino)} (una sola vez)...\n")
        urllib.request.urlretrieve(url, destino)
    return destino


def leer_dbf(path, enc="cp1252"):
    """dBase III sin dependencias: cabecera de 32 bytes + descriptores de campo."""
    b = open(path, "rb").read()
    n, hdr, rec = struct.unpack("<IHH", b[4:12])
    campos, p = [], 32
    while b[p] != 0x0D:
        campos.append((b[p:p + 11].split(b"\0")[0].decode("ascii"), chr(b[p + 11]), b[p + 16])); p += 32
    filas = []
    for i in range(n):
        r = b[hdr + i * rec: hdr + (i + 1) * rec]
        if r[:1] == b"*":
            continue
        q, d = 1, {}
        for nombre, tipo, ln in campos:
            v = r[q:q + ln].decode(enc, "replace").strip(); q += ln
            if tipo in "FN" and v:
                try: v = float(v) if ("." in v or "e" in v.lower()) else int(v)
                except ValueError: pass
            d[nombre] = v if v != "" else None
        filas.append(d)
    return filas


def municipios_ine():
    import openpyxl
    ws = openpyxl.load_workbook(bajar(INE_URL, INE_CACHE), read_only=True).active
    prov = {"04": "Almería", "11": "Cádiz", "14": "Córdoba", "18": "Granada", "21": "Huelva",
            "23": "Jaén", "29": "Málaga", "41": "Sevilla"}
    out = {}
    for r in ws.iter_rows(min_row=3, values_only=True):
        if not r or not r[4]:
            continue
        nombre = str(r[4])
        m = re.match(r"(?i)^(.*), (el|la|los|las|l')$", nombre)
        if m:
            art = m.group(2).capitalize()
            nombre = f"{art}{m.group(1)}" if art.endswith("'") else f"{art} {m.group(1)}"
        out[f"{int(r[1]):02d}{int(r[2]):03d}"] = (nombre, prov.get(f"{int(r[1]):02d}", f"{int(r[1]):02d}"))
    return out


def construir():
    ine = municipios_ine()
    filas = leer_dbf(bajar(URL, CACHE))
    unidades, sin_muni = [], 0
    for f in filas:
        cod = f.get("CodZona") or ""
        m = re.match(r"^([A-Z])(\d{5})(\d{2})$", cod)
        muni = ine.get(m.group(2)) if m else None
        if not muni:
            sin_muni += 1
        unidades.append({
            "codigo": cod,
            "nombre": f.get("Nombre"),
            "tipo": f.get("TipoUA"),
            "municipio": muni[0] if muni else None,
            "provincia": muni[1] if muni else None,
            "area_riego": f.get("AreaRiego"),
            "cuenca": f.get("Cuenca"),
            "superficie_regable_ha": f.get("SupRegable"),
            "n_regantes": f.get("n_regantes"),
            "n_comunidades_agrupadas": f.get("NCCRR"),
            "cultivo_principal": f.get("CultPrinci"),
        })
    doc = {"_meta": {
        "fuente": "REDIAM — Inventario y Caracterización de Regadíos en Andalucía, distritos mediterráneos y atlánticos (ICRA 2008), tabla UA_Detalle.dbf",
        "ficha": FICHA, "descarga": URL, "descargado": datetime.date.today().isoformat(),
        "año_de_los_datos": 2008,
        "que_es": "Unidades de Agregación del ICRA: comunidades de regantes (>200 ha), zonas de riego que agrupan comunidades pequeñas y regantes particulares, con el municipio sacado del código de la unidad (letra + CPRO + CMUN + nn).",
        "para_que": "Saber en qué municipio está una comunidad de regantes de Almería, Málaga, Granada, Cádiz o Huelva SIN deducirlo de su dirección ni de su nombre.",
        "alcance": "Almería, Málaga, Granada, Cádiz y Huelva; de Córdoba solo Los Pedroches. NO cubre el Guadalquivir (Sevilla, Córdoba, Jaén). Datos de 2008. El municipio es el del recinto según el inventario, no necesariamente la sede administrativa.",
        "unidades": len(unidades), "sin_municipio": sin_muni,
    }, "unidades": unidades}
    json.dump(doc, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return doc


def main(argv):
    if os.path.exists(SALIDA) and "--reconstruir" not in argv and ("--buscar" in argv or "--resumen" in argv):
        doc = json.load(open(SALIDA, encoding="utf-8"))
    else:
        doc = construir()
        print(f"{SALIDA}: {doc['_meta']['unidades']} unidades · sin municipio {doc['_meta']['sin_municipio']} · datos de {doc['_meta']['año_de_los_datos']}")
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
                print(f"  {u['nombre'][:60]:<60} -> {u['municipio']} ({u['provincia']})  [{u['tipo']}, {u['area_riego']}]")


if __name__ == "__main__":
    main(sys.argv[1:])
