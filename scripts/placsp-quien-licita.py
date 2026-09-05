#!/usr/bin/env python3
"""Quien LICITA obra de agua: los organos de contratacion, con su contacto.

Idea de Manolo, 5-sep-2026, y es la capa mas estable de las tres que salen de
la Plataforma de Contratacion:

  - el REDACTOR cambia con cada concurso;
  - el ADJUDICATARIO de obra llega cuando el pliego ya esta escrito;
  - el que LICITA no cambia. Un ayuntamiento que saco la renovacion de su red
    este año la volvera a sacar, y tendra una EDAR despues. Es cartera
    permanente, no oportunidad puntual.

Y hay una razon tecnica que lo hace mejor todavia para prescripcion: el organo
es QUIEN APRUEBA el pliego. Aunque lo redacte una ingenieria externa, es el
organismo quien decide si admite una clausula de "o equivalente" o si mantiene
una marca entre los materiales homologados.

    python3 scripts/placsp-quien-licita.py [--provincia Granada] [--min 2]
"""
import json, os, re, sys, unicodedata, io, datetime

FUENTE = os.path.expanduser('~/Downloads/PLACSP-agua.json')
SUR = {'granada','malaga','sevilla','cordoba','jaen','almeria','cadiz','huelva','murcia','alicante',
       'alacant','valencia','badajoz','caceres','albacete','ciudad real','cuenca','toledo',
       'guadalajara','madrid','baleares','illes balears','canarias','las palmas','tenerife',
       'gran canaria','lanzarote','la palma','ceuta','melilla'}

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

# El registro nombra al ORGANO de gobierno, no a la entidad: "Consejo de
# Administracion de X", "Gerencia de Y", "Presidencia de Z". Para una lista de
# visitas hay que quedarse con la entidad, que es a quien se llama.
ORGANO = re.compile(
    r'^\s*(consejo de administraci[oó]n|comit[eé] ejecutivo|junta de gobierno|junta general|'
    r'comisi[oó]n ejecutiva|presidencia|vicepresidencia|gerencia|direcci[oó]n gerente|'
    # OJO: "Direccion General de X" y "Secretaria General de X" NO se tocan:
    # ahi la entidad ES la direccion general. Quitarlo dejaba "Direccion
    # General del Agua" en un inutil "Agua".
    r'consejer[oa]s? delegad[oa]s?|consejer[ií]a delegada|alcald[ií]a|'
    r'[oó]rgano de contrataci[oó]n|mesa de contrataci[oó]n)\s+(?:de\s+la\s+|'
    r'de\s+los\s+|de\s+las\s+|del\s+|de\s+)?', re.I)

def entidad(nombre):
    """'Consejo de Administracion de Aguas de Alicante' -> 'Aguas de Alicante'."""
    n = ORGANO.sub('', nombre or '').strip(' ,.')
    return n if len(n) >= 8 else (nombre or '').strip()


def main():
    ruta = sys.argv[sys.argv.index('--json')+1] if '--json' in sys.argv else FUENTE
    prov = norm(sys.argv[sys.argv.index('--provincia')+1]) if '--provincia' in sys.argv else None
    minimo = int(sys.argv[sys.argv.index('--min')+1]) if '--min' in sys.argv else 1
    d = json.load(open(ruta, encoding='utf-8'))

    org = {}
    for a in d['adjudicaciones']:
        o = a.get('organo') or {}
        if not o.get('nombre'):
            continue
        if prov and prov not in norm(a.get('provincia') or '') and prov not in norm(o.get('ciudad') or ''):
            continue
        k = norm(o['nombre'])
        e = org.setdefault(k, {'nombre': entidad(o['nombre']), 'organo': o['nombre'], 'email': '', 'tel': '', 'web': '', 'ciudad': '',
                               'dir': '', 'matriz': '', 'contratos': 0, 'importe': 0.0,
                               'provincias': set(), 'papeles': {}, 'obras': []})
        e['contratos'] += 1
        e['importe'] += a.get('importe') or 0
        if a.get('provincia'): e['provincias'].add(a['provincia'])
        e['papeles'][a['papel']] = e['papeles'].get(a['papel'], 0) + 1
        for c in ('email', 'tel', 'web', 'ciudad', 'dir', 'matriz'):
            if not e[c] and o.get(c): e[c] = o[c]
        if len(e['obras']) < 6:
            e['obras'].append({'fecha': a['fecha'], 'papel': a['papel'],
                               'importe': a.get('importe'), 'titulo': a['titulo'][:130]})

    filas = [dict(e, provincias=sorted(e['provincias'])) for e in org.values() if e['contratos'] >= minimo]
    filas.sort(key=lambda e: (-e['contratos'], -e['importe']))
    zona = [e for e in filas if any(norm(p) in SUR for p in e['provincias']) or norm(e['ciudad']) in SUR]

    out = os.path.expanduser('~/Downloads/PLACSP-quien-licita.json')
    json.dump({'_generado': datetime.date.today().isoformat(),
               '_que_es': 'Organos de contratacion que han licitado obra de agua en los ultimos 12 '
                          'meses. Es la capa mas estable: quien licita se repite año tras año, y es '
                          'quien APRUEBA el pliego.',
               '_filtro': {'provincia': prov, 'minimo_contratos': minimo},
               'todos': filas, 'en_territorio': zona},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f"  organos que licitan agua: {len(filas)}  ·  en tu territorio: {len(zona)}")
    print(f"  con correo: {sum(1 for e in filas if e['email'])} · con telefono: {sum(1 for e in filas if e['tel'])}")
    print(f"  → {out}\n")
    print("  ── los que MAS licitan en tu territorio ──")
    for e in zona[:18]:
        p = ' '.join(f"{k}:{v}" for k, v in sorted(e['papeles'].items()))
        print(f"   {e['contratos']:>3}x {e['nombre'][:46]:<46} {p:<26} {e['tel'] or e['email'] or '—'}")

if __name__ == '__main__':
    main()
