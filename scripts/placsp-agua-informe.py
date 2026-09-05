#!/usr/bin/env python3
"""Convierte la cosecha de placsp-agua.js en un Excel accionable.

Cruza las empresas que han ganado contratos de agua contra la cartera del CRM y
separa: las que YA tienes (confirma que la cartera acierta), las NUEVAS que
redactan (prescriptores, lo más valioso) y las NUEVAS que construyen (suministro,
para el comercial).

⚠️ Dos trampas de normalizacion, las dos vividas:
  1. Colapsar espacios ANTES de quitar la puntuacion deja espacios dobles, y
     'aquatec  soluciones' no casa con 'aquatec soluciones'. Hay que hacerlo
     DESPUES. Este mismo fallo aparecio antes en el marcador del banco: por el,
     IDOM y TYPSA salian como "nuevas" siendo clientes desde junio.
  2. Las UTE son licitadores distintos, pero sus MIEMBROS son las empresas que
     interesan. Se parten y se cruza cada miembro por separado.

  python3 scripts/placsp-agua-informe.py [--json ~/Downloads/PLACSP-agua.json]
"""
import json, io, re, sys, subprocess, unicodedata, os, datetime

SUR = {'granada','malaga','sevilla','cordoba','jaen','almeria','cadiz','huelva','murcia',
       'alicante','alacant','valencia','badajoz','caceres','albacete','ciudad real','cuenca',
       'toledo','guadalajara','madrid','baleares','illes balears','canarias','las palmas',
       'santa cruz de tenerife','tenerife','gran canaria','lanzarote','la palma','ceuta','melilla'}
FORMAS = r'\b(s\.?a\.?u?\.?|s\.?l\.?u?\.?|s\.?l\.?p\.?|s\.?c\.?p\.?|sau|slu|slp|scp|sa|sl|ute|sociedad|limitada|anonima)\b'

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(FORMAS, ' ', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()      # ← colapsar AL FINAL, no antes

def miembros(nombre):
    """Una UTE es un licitador, pero sus miembros son las empresas reales.

    ⚠️ Partir SOLO las que se declaran UTE. La primera version partia por
    " y " en cualquier nombre y rompio "Tecnica y Proyectos, S.A. (TYPSA)" en
    "Tecnica" + "Proyectos, S.A.", y "X y Servicios, S.L." en un fantasma
    llamado "Servicios, S.L.". Un nombre con " y " dentro casi siempre es UNA
    empresa; una UTE casi siempre se anuncia como tal.
    """
    if not re.match(r'^\s*u\.?t\.?e\.?\b', nombre, flags=re.I):
        return [nombre]
    t = re.sub(r'^\s*u\.?t\.?e\.?\b[\s:.,-]*', '', nombre, flags=re.I)
    partes = re.split(r'\s+[-–—]\s+|\s*[;/]\s*', t)
    partes = [p.strip(' ,.') for p in partes if len(norm(p)) > 4]
    # Si la particion deja una sola pieza, la UTE es indivisible: se queda entera.
    return partes if len(partes) > 1 else [nombre]

def main():
    ruta = sys.argv[sys.argv.index('--json')+1] if '--json' in sys.argv else \
           os.path.expanduser('~/Downloads/PLACSP-agua.json')
    d = json.load(open(ruta, encoding='utf-8'))
    r = subprocess.run(['python3', 'agentes/_lib/crm_query.py', '--accion', 'candidatos',
                        '--params', '{"limit":3000,"solo_territorio":false}'],
                       capture_output=True, text=True)
    crm = {norm(x['name']): x['name'] for x in json.load(io.StringIO(r.stdout))['candidatos']}

    fus = {}
    for e in d['empresas']:
        for m in miembros(e['adjudicatario']):
            k = norm(m)
            if not k: continue
            f = fus.setdefault(k, {'nombre': m, 'papeles': set(), 'contratos': 0,
                                   'importe': 0.0, 'provincias': set(), 'obras': [], 'variantes': set()})
            f['papeles'] |= set(e['papeles']); f['contratos'] += e['contratos']
            f['importe'] += e['importe']; f['provincias'] |= set(e['provincias'])
            f['variantes'].add(e['adjudicatario'])
            f['obras'] += e['obras'][:3]
            if len(m) > len(f['nombre']): f['nombre'] = m

    filas = []
    for k, f in fus.items():
        if not any(norm(p) in SUR for p in f['provincias']): continue
        filas.append({**f, 'clave': k, 'en_crm': crm.get(k),
                      'papeles': sorted(f['papeles']), 'provincias': sorted(f['provincias']),
                      'variantes': sorted(f['variantes'])})
    filas.sort(key=lambda f: (-f['contratos'], -f['importe']))
    ya   = [f for f in filas if f['en_crm']]
    pres = [f for f in filas if not f['en_crm'] and 'redacta' in f['papeles']]
    obra = [f for f in filas if not f['en_crm'] and 'redacta' not in f['papeles']]
    salida = {'_generado': datetime.date.today().isoformat(), '_fuente': ruta,
              '_adjudicaciones': d['_adjudicaciones'], '_redactan': d['_redactan'],
              '_construyen': d['_construyen'], '_ofertas_perdedoras': d['_ofertas_perdedoras'],
              '_actas': d['_actas_enlazadas'],
              'ya_en_crm': ya, 'prescriptores_nuevos': pres, 'constructoras_nuevas': obra}
    out = os.path.expanduser('~/Downloads/PLACSP-agua-cruce.json')
    json.dump(salida, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"  en territorio: {len(filas)}")
    print(f"  ya en el CRM:  {len(ya)}")
    print(f"  PRESCRIPTORES nuevos (redactan): {len(pres)}")
    print(f"  constructoras nuevas:            {len(obra)}")
    print("  →", out)
    print("\n  ── top prescriptores nuevos ──")
    for f in pres[:12]:
        print(f"   {f['contratos']:>3}x {f['nombre'][:46]:<46} {f['importe']:>13,.0f} EUR  {', '.join(f['provincias'])[:32]}")

if __name__ == '__main__':
    main()
