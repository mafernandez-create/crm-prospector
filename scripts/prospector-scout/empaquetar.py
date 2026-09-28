#!/usr/bin/env python3
"""Empaqueta una prospeccion de zona en el Excel que se le entrega a un companero.

    python3 scripts/prospector-scout/empaquetar.py \
        --datos /ruta/filas-catalunya.json \
        --censo scripts/prospector-scout/censo/censo-catalunya.json \
        --salida ~/Downloads

Nacio para Zaragoza (sep-2026) hecho a mano y se escribio al repetirlo en Cataluna.
La gracia no es el Excel: es que las dos hojas mas fiables --censo y
adjudicaciones-- se rellenan solas desde ficheros deterministas, y el modelo solo
aporta las hojas que llevan el sello de "sin verificar" en la cabecera.
"""
import argparse, json, io, os, datetime, unicodedata
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

AZUL = "1F4E79"; GRIS = "D9D9D9"; VERDE = "C6E0B4"; AMBAR = "FFE699"; ROJO = "F8CBAD"
BORDE = Border(*[Side(style="thin", color="BFBFBF")] * 4)

# El orden es el de trabajo de un prescriptor: primero quien escribe el pliego.
COLUMNAS = ["N", "Empresa", "Tipo", "Provincia", "Municipio", "Web", "Telefono",
            "Email", "Persona", "Cargo", "Por que interesa", "Producto GPF",
            "Prioridad", "Verificacion", "Fuente"]

# Verde = el verificador lo confirmo. Ambar = probable. Rojo = contradicho o sin
# confirmar: se entrega igual, pero coloreado, porque esconderlo es peor.
COLOR_VERIF = {"verificado": VERDE, "probable": AMBAR, "sin confirmar": ROJO,
               "contradicho": ROJO}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def cabecera(ws, cols, ancho=None):
    for i, c in enumerate(cols, 1):
        cell = ws.cell(row=1, column=i, value=c)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill("solid", fgColor=AZUL)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = BORDE
        ws.column_dimensions[get_column_letter(i)].width = (ancho or {}).get(c, 18)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}1"


def hoja_filas(wb, titulo, filas):
    ws = wb.create_sheet(titulo[:31])
    cabecera(ws, COLUMNAS, {"N": 5, "Empresa": 34, "Por que interesa": 52,
                            "Web": 30, "Email": 28, "Producto GPF": 22, "Fuente": 30})
    for n, f in enumerate(filas, 1):
        vals = [n] + [f.get(k.lower().replace(" ", "_"), "") for k in COLUMNAS[1:]]
        for i, v in enumerate(vals, 1):
            cell = ws.cell(row=n + 1, column=i, value=v)
            cell.alignment = Alignment(vertical="top", wrap_text=(i in (11, 15)))
            cell.border = BORDE
            cell.font = Font(size=10)
        col_v = COLUMNAS.index("Verificacion") + 1
        color = COLOR_VERIF.get(norm(f.get("verificacion", "")), None)
        if color:
            ws.cell(row=n + 1, column=col_v).fill = PatternFill("solid", fgColor=color)
    return ws


def hoja_censo(wb, censo):
    """Determinista: sale del registro oficial, no de ninguna busqueda."""
    ws = wb.create_sheet("Censo entes (oficial)")
    cols = ["Ente", "Tipo", "Provincia", "Comarca", "Agua", "Presidente",
            "Telefono", "Email", "Direccion", "CIF"]
    cabecera(ws, cols, {"Ente": 46, "Direccion": 40, "Presidente": 26, "Email": 28})
    # si primero: es la unica ordenacion que importa al llamar.
    orden = {"si": 0, "generica": 1, "no": 2}
    entes = sorted(censo.get("mancomunidades", []),
                   key=lambda m: (orden.get(m.get("agua"), 3), m.get("nombre") or ""))
    for n, m in enumerate(entes, 2):
        vals = [m.get("nombre"), m.get("finalidad"), ", ".join(m.get("provincias") or []),
                m.get("comarca"), m.get("agua"), m.get("presidente"), m.get("telefono"),
                m.get("email"), m.get("direccion"), m.get("cif")]
        for i, v in enumerate(vals, 1):
            cell = ws.cell(row=n, column=i, value=v)
            cell.border = BORDE; cell.font = Font(size=10)
            cell.alignment = Alignment(vertical="top")
        c = {"si": VERDE, "generica": AMBAR}.get(m.get("agua"))
        if c:
            ws.cell(row=n, column=5).fill = PatternFill("solid", fgColor=c)
    return ws


def hoja_adjudicaciones(wb, adjs):
    ws = wb.create_sheet("Adjudicaciones agua")
    cols = ["Fecha", "Provincia", "Organo que licita", "Objeto", "Adjudicatario",
            "Importe", "Redaccion?"]
    cabecera(ws, cols, {"Objeto": 60, "Adjudicatario": 34, "Organo que licita": 34})
    for n, a in enumerate(adjs, 2):
        vals = [a.get("fecha"), a.get("provincia"), a.get("organo"), a.get("titulo"),
                a.get("adjudicatario"), a.get("importe"),
                "SI" if a.get("redaccion") else ""]
        for i, v in enumerate(vals, 1):
            cell = ws.cell(row=n, column=i, value=v)
            cell.border = BORDE; cell.font = Font(size=10)
            cell.alignment = Alignment(vertical="top", wrap_text=(i == 4))
        if a.get("redaccion"):
            ws.cell(row=n, column=7).fill = PatternFill("solid", fgColor=VERDE)
    return ws


def hoja_leeme(wb, meta, resumen):
    ws = wb.create_sheet("LEEME", 0)
    ws.column_dimensions["A"].width = 118
    filas = [
        (f"Prospeccion de {meta['zona']} para {meta['destinatario']}", True, 14),
        (f"Preparado por Manuel Fernandez (GPF) el {meta['fecha']}", False, 10),
        ("", False, 10),
        ("QUE ES ESTO", True, 11),
        ("Un punto de partida para abrir zona, no una cartera. Nadie de esta lista ha sido", False, 10),
        ("visitado por GPF: el CRM tiene cero fichas en toda la zona.", False, 10),
        ("", False, 10),
        ("COMO LEER LA COLUMNA 'VERIFICACION' -- es lo mas importante de todo el fichero", True, 11),
        ("  verde  verificado   = comprobado contra una fuente que se cita en 'Fuente'.", False, 10),
        ("  ambar  probable     = coherente y muy plausible, pero sin fuente que lo cierre.", False, 10),
        ("  rojo   sin confirmar= no se pudo comprobar. Llamar antes de darlo por bueno.", False, 10),
        ("Se entrega lo rojo tambien, a proposito. Una lista donde todo parece verificado", False, 10),
        ("es mas peligrosa que una que dice de que pie cojea cada fila.", False, 10),
        ("", False, 10),
        ("DE DONDE SALE CADA HOJA", True, 11),
        ("  'Censo entes' y 'Adjudicaciones agua' salen de REGISTROS OFICIALES, no de", False, 10),
        ("  busquedas: son las dos hojas fiables por construccion. Empieza por ahi.", False, 10),
        ("  Las demas hojas las levanto un barrido automatico y estan revisadas una a una,", False, 10),
        ("  pero siguen siendo una pista, no un dato.", False, 10),
        ("", False, 10),
        ("EL OBJETIVO NO ES VENDER", True, 11),
        ("Es que el proyectista escriba la marca en el pliego ANTES de que salga a concurso.", False, 10),
        ("Por eso la hoja de ingenierias va la primera: quien redacta decide la tuberia.", False, 10),
        ("Quien construye ya solo compra lo que el pliego dice.", False, 10),
        ("", False, 10),
        ("RESUMEN", True, 11),
    ]
    for texto, negrita, tam in filas:
        c = ws.cell(row=ws.max_row + 1 if ws.max_row > 1 or ws["A1"].value else 1, column=1, value=texto)
        c.font = Font(bold=negrita, size=tam, color=(AZUL if negrita else "000000"))
        c.alignment = Alignment(wrap_text=False, vertical="top")
    for linea in resumen:
        c = ws.cell(row=ws.max_row + 1, column=1, value="  " + linea)
        c.font = Font(size=10)
    return ws


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True, help="JSON con meta, hojas, adjudicaciones")
    ap.add_argument("--censo", help="censo-*.json a volcar tal cual")
    ap.add_argument("--salida", default=os.path.expanduser("~/Downloads"))
    a = ap.parse_args()

    d = json.load(io.open(a.datos, encoding="utf-8"))
    meta = d["meta"]; meta.setdefault("fecha", datetime.date.today().isoformat())

    wb = Workbook(); wb.remove(wb.active)
    resumen = []
    for hoja in d["hojas"]:
        hoja_filas(wb, hoja["titulo"], hoja["filas"])
        resumen.append(f"{hoja['titulo']}: {len(hoja['filas'])} fichas")
    if d.get("adjudicaciones"):
        hoja_adjudicaciones(wb, d["adjudicaciones"])
        resumen.append(f"Adjudicaciones agua: {len(d['adjudicaciones'])} contratos")
    if a.censo:
        censo = json.load(io.open(a.censo, encoding="utf-8"))
        hoja_censo(wb, censo)
        resumen.append(f"Censo entes: {len(censo.get('mancomunidades', []))} entes oficiales")
    hoja_leeme(wb, meta, resumen)

    os.makedirs(os.path.expanduser(a.salida), exist_ok=True)
    ruta = os.path.join(os.path.expanduser(a.salida),
                        f"Prospeccion-{meta['zona'].replace(' ', '')}_GPF_{meta['fecha']}.xlsx")
    wb.save(ruta)
    print(ruta)
    for r in resumen:
        print("   ", r)


if __name__ == "__main__":
    main()
