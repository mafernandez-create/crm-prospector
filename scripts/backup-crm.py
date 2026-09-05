#!/usr/bin/env python3
"""
backup-crm.py — Copia de seguridad completa del CRM (Supabase) a disco.

Vuelca todas las tablas de negocio a un único fichero JSON comprimido, con
manifiesto de recuentos para poder verificar que la copia está entera.

POR QUÉ EXISTE: el CRM no tiene punto de retorno. Dentro de `studios` viven los
informes de visita, que son años de trabajo comercial y no están en ningún otro
sitio. Un DELETE mal filtrado se los lleva y no hay deshacer.

DÓNDE ESCRIBE: por defecto ~/Documents/CRM_backups/. **Nunca dentro del repo**:
este repositorio se despliega a un gh-pages PÚBLICO y `studios` contiene datos
comerciales de clientes.

USO:
    python3 scripts/backup-crm.py                  # copia completa
    python3 scripts/backup-crm.py --salida RUTA    # a otra carpeta
    python3 scripts/backup-crm.py --verificar FICH # comprueba una copia existente

Credenciales: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY por entorno, o el fichero
~/.config/crm/supabase.env (igual que agentes/_lib/crm_query.py).
"""
import argparse
import gzip
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# Tablas de negocio. Las loop_* son telemetría del harness y se excluyen por
# defecto: se regeneran solas y abultan mucho.
TABLAS = [
    "studios",
    "briefings",
    "meta_planificador",
    "meta_kv",
    "placsp_adjudicaciones",
    "report_audit",
]
TABLAS_OPCIONALES = ["loop_proyectos", "loop_config", "loop_acciones"]
PAGINA = 1000


def credenciales():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    fichero = os.path.expanduser("~/.config/crm/supabase.env")
    if (not url or not key) and os.path.exists(fichero):
        for linea in open(fichero):
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, _, v = linea.partition("=")
            v = v.strip().strip('"').strip("'")
            if k.strip() == "SUPABASE_URL":
                url = url or v
            if k.strip() == "SUPABASE_SERVICE_ROLE_KEY":
                key = key or v
    if not url or not key:
        sys.exit("Faltan credenciales de Supabase (entorno o ~/.config/crm/supabase.env)")
    return url.rstrip("/"), key


def descargar(url, key, tabla):
    """Descarga una tabla entera paginando: PostgREST corta a 1000 filas."""
    cabeceras = {"apikey": key, "Authorization": "Bearer " + key}
    filas, desde = [], 0
    while True:
        destino = f"{url}/rest/v1/{tabla}?select=*&limit={PAGINA}&offset={desde}"
        peticion = urllib.request.Request(destino, headers=cabeceras)
        lote = json.loads(urllib.request.urlopen(peticion).read())
        filas.extend(lote)
        if len(lote) < PAGINA:
            return filas
        desde += PAGINA


def copiar(salida, incluir_loop=False):
    url, key = credenciales()
    tablas = TABLAS + (TABLAS_OPCIONALES if incluir_loop else [])
    sello = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    datos, manifiesto = {}, {}

    for tabla in tablas:
        try:
            filas = descargar(url, key, tabla)
        except Exception as err:  # una tabla que falle no debe tumbar la copia
            print(f"  ⚠️  {tabla}: {err}")
            manifiesto[tabla] = {"filas": None, "error": str(err)}
            continue
        datos[tabla] = filas
        manifiesto[tabla] = {"filas": len(filas)}
        print(f"  {tabla:26s} {len(filas):6d} filas")

    # Recuento aparte de los informes, que viven dentro del JSON de studios y
    # son lo más valioso de la copia.
    informes = sum(
        len(f.get("data", {}).get("reports") or [])
        for f in datos.get("studios", [])
        if isinstance(f.get("data"), dict)
    )
    manifiesto["_informes_dentro_de_studios"] = {"filas": informes}
    print(f"  {'informes (dentro de studios)':26s} {informes:6d}")

    paquete = {
        "_meta": {
            "generado": sello,
            "proyecto": url,
            "tablas": list(datos.keys()),
            "manifiesto": manifiesto,
            "generado_por": "scripts/backup-crm.py",
        },
        "datos": datos,
    }
    os.makedirs(salida, exist_ok=True)
    destino = os.path.join(salida, f"crm_{sello}.json.gz")
    with gzip.open(destino, "wt", encoding="utf-8") as fh:
        json.dump(paquete, fh, ensure_ascii=False)
    return destino, manifiesto


def verificar(ruta):
    with gzip.open(ruta, "rt", encoding="utf-8") as fh:
        paquete = json.load(fh)
    meta = paquete["_meta"]
    print(f"Copia del {meta['generado']} · {meta['proyecto']}")
    ok = True
    for tabla, info in meta["manifiesto"].items():
        if tabla.startswith("_"):
            print(f"  {tabla:34s} {info['filas']}")
            continue
        reales = len(paquete["datos"].get(tabla, []))
        casa = reales == info.get("filas")
        ok = ok and casa
        print(f"  {tabla:34s} {reales:6d} {'✓' if casa else '✗ NO CUADRA con el manifiesto'}")
    return ok


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Copia de seguridad del CRM")
    p.add_argument("--salida", default=os.path.expanduser("~/Documents/CRM_backups"))
    p.add_argument("--incluir-loop", action="store_true", help="incluir tablas de telemetría loop_*")
    p.add_argument("--verificar", metavar="FICHERO", help="verificar una copia ya hecha y salir")
    args = p.parse_args()

    if args.verificar:
        sys.exit(0 if verificar(args.verificar) else 1)

    print("Copia de seguridad del CRM")
    destino, _ = copiar(args.salida, args.incluir_loop)
    tam = os.path.getsize(destino) / 1024 / 1024
    print(f"\n✅ {destino}  ({tam:.1f} MB)")
    print("\nVerificando lo escrito…")
    sys.exit(0 if verificar(destino) else 1)
