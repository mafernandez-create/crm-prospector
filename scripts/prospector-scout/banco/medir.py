#!/usr/bin/env python3
"""Marcador objetivo para comparar variantes del scout sobre una misma zona.

⚠️ Corregido el 5-sep-2026 tras la critica del contrarian. La version anterior
buscaba el alias en TODO el texto del informe, asi que contaba como acierto una
entidad mencionada solo en "Pendientes de verificar" para decir que no se pudo
acceder a ella. El CICCP puntuaba en las cuatro variantes sin una sola ficha
entregada. Ahora el alias tiene que aparecer en una FICHA ENTREGADA.

La rubrica se fija ANTES de correr las variantes, a proposito: si se decide
despues que es "mejor", se acaba eligiendo la que confirma lo que uno queria.

Uso:  python3 medir.py patron-oro-zaragoza.json informe1.md informe2.md ...
"""
import json, re, sys, unicodedata
from collections import Counter

def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()

VACIO = re.compile(r"^\s*(null|none|por localizar|no localizado|no publicado|"
                   r"sin localizar|\[verificar[^\]]*\]|)\s*$", re.I)

# Los guiones no siempre respetan el formato de cabecera. En la tanda de
# Granada, vB entrego 49 prospectos como "#### [SD-01] NOMBRE" en vez de
# "### #1 · Nombre — Score: 9/10", y el contador dijo CERO fichas por 2,34 $.
# El fallo era del medidor, no del barrido. Estos patrones cubren los formatos
# vistos; si aparece otro, la seccion "sin clasificar" del resumen lo delata.
CABECERAS = [
    re.compile(r"^#{2,4} #?\d+ · (.+?) — Score:\s*(\d+)", re.M),     # canonico
    re.compile(r"^#{3,4} (?:⭐\s*)?\[[A-Z]{1,4}-?\d+\]\s*(.+?)\s*$", re.M),  # [SD-01] Nombre
]
SECCION = re.compile(r"^(resumen|sólidos|solidos|leads|pendientes|tabla|archivo|máxima|maxima|alta|media|baja|prioridad|índice|indice|origen|nuevos|cartera)", re.I)

def leer(f):
    txt = open(f, encoding="utf-8").read()
    fichas, vistos = [], set()
    for pat in CABECERAS:
        for m in pat.finditer(txt):
            nom = m.group(1).strip().lstrip("·#⭐ ").strip()
            if not nom or SECCION.match(nom) or nom.lower() in vistos:
                continue
            vistos.add(nom.lower())
            sc = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else 0
            fichas.append({"nombre": nom, "score": sc})
    def campos(clave):
        return [v for v in re.findall(r'"%s":\s*"?([^",\n]*)"?' % clave, txt)]
    # Se construye de las CABECERAS y de los campos JSON si los hay: vB no
    # emitio ni un solo "name", asi que fiarlo al JSON daba recall 0 falso.
    entregado = " | ".join(norm(x["nombre"]) for x in fichas)
    entregado += " | " + " | ".join(norm(v) for v in re.findall(r'"(?:name|shortName)":\s*"([^"]*)"', txt))
    entregado += " | " + " | ".join(norm(v) for v in re.findall(r'^#{3,4}[^\n]*?\*\*(.+?)\*\*', txt, re.M))
    return {
        "fichero": f.split("/")[-1], "texto": txt, "norm": norm(txt),
        "entregado": entregado, "fichas": fichas,
        "tipos": Counter(re.findall(r'"type":\s*"([a-z]+)"', txt)),
        "tel":   campos("phone"), "mail": campos("email"),
        "personas": len(re.findall(r'"isDecisionMaker"', txt)),
        "urls": len(set(re.findall(r'https?://[^\s")]+', txt))),
    }

def recall(inf, oro):
    hit, miss = [], []
    for e in oro["entidades"]:
        if any(norm(a) in inf["entregado"] for a in e["alias"]):
            hit.append(e)
        else:
            miss.append(e)
    return hit, miss

def lleno(vals):
    utiles = [v for v in vals if not VACIO.match(v or "")]
    return len(utiles), len(vals)

def main():
    oro = json.load(open(sys.argv[1]))
    peso_total = sum(e.get("peso", 1) for e in oro["entidades"]) or 1
    n_oro = len(oro["entidades"]) or 1
    filas = []
    for f in sys.argv[2:]:
        inf = leer(f)
        hit, miss = recall(inf, oro)
        pesado = sum(e.get("peso", 1) for e in hit)
        nt, tt = lleno(inf["tel"]); nm, tm = lleno(inf["mail"])
        tipos = inf["tipos"]; n = sum(tipos.values()) or 1
        dominante = tipos.most_common(1)[0][1] / n if tipos else 0
        filas.append({
            "v": inf["fichero"], "fichas": len(inf["fichas"]),
            "recall": "%d/%d" % (len(hit), len(oro["entidades"])),
            "recall_pct": 100 * len(hit) / n_oro,
            "recall_pesado_pct": 100 * pesado / peso_total,
            "ciegas": sum(1 for e in hit if e["origen"] == "verificacion adversaria"),
            "tipos": len(tipos), "dominante_pct": 100 * dominante,
            "tel_pct": 100 * nt / max(tt, 1), "mail_pct": 100 * nm / max(tm, 1),
            "personas": inf["personas"], "urls": inf["urls"],
            "_miss": [e["nombre"] for e in miss], "_hit": [e["id"] for e in hit],
        })
    # Granada trae dos metricas mas, y son las buenas: salen del CRM, no de una
    # lista escrita por quien evalua. "rescate" mide el Paso 3 (deduplicar y
    # rescatar cartera dormida), que en Zaragoza no se ejecuto NUNCA porque
    # alli el CRM tiene 0 fichas. "error duro" mide PRECISION: proponer una
    # ficha ya visitada es un fallo objetivo que la regla dura 1 prohibe.
    if oro.get("dormidas") or oro.get("prohibidas"):
        print("\nMÉTRICAS DEL CRM (no las escribió el evaluador)")
        print("variante | fichas | rescate de dormidas | ❌ ya visitadas propuestas")
        print("-|-|-|-")
        for f in sys.argv[2:]:
            inf = leer(f)
            res = [d for d in oro.get("dormidas", []) if norm(d["nombre"]) in inf["entregado"]]
            mal = [v for v in oro.get("prohibidas", []) if norm(v["nombre"]) in inf["entregado"]]
            print("%s | %d | %d/%d | %s" % (inf["fichero"], len(inf["fichas"]), len(res),
                  len(oro.get("dormidas", [])),
                  ("❌ " + ", ".join(v["nombre"][:28] for v in mal)) if mal else "0 ✅"))
            if res:
                print("   rescatadas: " + ", ".join(d["nombre"][:34] for d in res[:8]))
        print()

    if not oro["entidades"]:
        return          # rúbrica sin patrón oro: las métricas del CRM ya se han impreso
    cab = ["variante", "fichas", "recall oro", "recall pond.", "las 3 ciegas",
           "tipos", "% tipo domin.", "% con tel", "% con mail", "personas", "URLs"]
    print(" | ".join(cab)); print("-|-".join("-" * len(c) for c in cab))
    for r in filas:
        print(" | ".join([r["v"], str(r["fichas"]), "%s (%.0f%%)" % (r["recall"], r["recall_pct"]),
              "%.0f%%" % r["recall_pesado_pct"], "%d/3" % r["ciegas"], str(r["tipos"]),
              "%.0f%%" % r["dominante_pct"], "%.0f%%" % r["tel_pct"], "%.0f%%" % r["mail_pct"],
              str(r["personas"]), str(r["urls"])]))
    for r in filas:
        print("\n%s — NO encontro (%d):" % (r["v"], len(r["_miss"])))
        for m in r["_miss"]: print("   ·", m)
    if len(filas) > 1:
        union = set().union(*[set(r["_hit"]) for r in filas])
        print("\nUnion de todas las variantes: %d/%d del patron oro (%.0f%%)"
              % (len(union), len(oro["entidades"]), 100*len(union)/len(oro["entidades"])))

if __name__ == "__main__":
    main()
