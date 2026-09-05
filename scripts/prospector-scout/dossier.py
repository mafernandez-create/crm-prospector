#!/usr/bin/env python3
"""Dossier previo de una zona: TODO lo que se sabe por registro, antes de buscar.

Por que existe
--------------
El barrido con modelo es un buen buscador y un mal censista: dio por inexistentes
las mancomunidades de agua dos veces, y gasta turnos redescubriendo cosas que ya
constan en un registro. Este dossier reune primero lo determinista —el CRM, el
censo oficial de entidades locales y un ano de adjudicaciones publicas— y se le
entrega hecho, para que dedique su presupuesto a lo unico que solo el puede
hacer: encontrar lo que no esta en ningun registro.

Acepta municipio, comarca o provincia. Sin --tipo, cubre todos los tipos.

    python3 dossier.py "Alagon"
    python3 dossier.py "Zaragoza" --tipo ingenieria,regantes
"""
import json, io, os, re, subprocess, sys, unicodedata, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CENSOS = os.path.join(RAIZ, 'scripts', 'prospector-scout', 'censo')
PLACSP = os.path.join(RAIZ, 'agentes', 'output', '_datos', 'placsp-agua.json')

TIPOS = {
    'arquitectura': 'estudios de arquitectura',
    'ingenieria': 'ingenierias (obra civil, hidraulica, instalaciones, regadios)',
    'regantes': 'comunidades de regantes y juntas centrales',
    'aguas': 'operadores y concesionarias del ciclo del agua',
    'aapp': 'administraciones, mancomunidades y comarcas',
    'constructora': 'constructoras y contratistas',
    'promotora': 'promotoras',
    'distribucion': 'almacenes y distribuidores',
}

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def crm(accion, params):
    r = subprocess.run(['python3', os.path.join(RAIZ, 'agentes', '_lib', 'crm_query.py'),
                        '--accion', accion, '--params', json.dumps(params)],
                       capture_output=True, text=True, cwd=RAIZ)
    try: return json.loads(r.stdout)
    except Exception: return {}

def censos_disponibles():
    out = {}
    for f in sorted(os.listdir(CENSOS)) if os.path.isdir(CENSOS) else []:
        if f.startswith('censo-') and f.endswith('.json'):
            out[f[6:-5]] = json.load(open(os.path.join(CENSOS, f), encoding='utf-8'))
    return out

# Las 50 provincias, para que un nombre que es a la vez ciudad y provincia
# —Zaragoza, Granada, Murcia, Sevilla…— se lea como PROVINCIA. Al prospectar
# interesa la lectura amplia; para el municipio solo, se pide otro municipio de
# la misma comarca o se dice "capital".
PROVINCIAS = {'alava','araba','albacete','alicante','alacant','almeria','asturias','avila','badajoz',
 'barcelona','burgos','caceres','cadiz','cantabria','castellon','castello','ceuta','ciudad real',
 'cordoba','cuenca','girona','gerona','granada','guadalajara','guipuzcoa','gipuzkoa','huelva','huesca',
 'jaen','leon','lleida','lerida','lugo','madrid','malaga','melilla','murcia','navarra','ourense',
 'orense','palencia','pontevedra','la rioja','rioja','salamanca','segovia','sevilla','soria',
 'tarragona','tenerife','teruel','toledo','valencia','valladolid','vizcaya','bizkaia','zamora',
 'zaragoza','baleares','illes balears','las palmas','a coruna','la coruna','coruna'}

def resolver(lugar, censos):
    """Devuelve (ambito, provincia, region_del_censo). Provincias PRIMERO."""
    z = norm(lugar)
    if z in PROVINCIAS:
        for reg, c in censos.items():
            for m in c['mancomunidades']:
                if any(norm(p) == z for p in m['provincias']):
                    return 'provincia', lugar, reg
        return 'provincia', lugar, None
    for reg, c in censos.items():
        for k in c['comarcas']:
            if z == norm(k['nombre']):
                return 'comarca', (k['provincias'] or ['?'])[0], reg
        for m in c['mancomunidades']:
            if z in [norm(x) for x in m['municipios']]:
                return 'municipio', (m['provincias'] or ['?'])[0], reg
        for k in c['comarcas']:
            if z in [norm(x) for x in k['municipios']]:
                return 'municipio', (k['provincias'] or ['?'])[0], reg
    return 'provincia', lugar, None

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    lugar = sys.argv[1]
    tipos = []
    if '--tipo' in sys.argv:
        tipos = [t.strip().lower() for t in sys.argv[sys.argv.index('--tipo')+1].split(',') if t.strip()]
        malos = [t for t in tipos if t not in TIPOS]
        if malos:
            print(f"Tipo desconocido: {', '.join(malos)}\nValidos: {', '.join(TIPOS)}"); sys.exit(1)
    censos = censos_disponibles()
    ambito, provincia, region = resolver(lugar, censos)
    z = norm(lugar)

    # ── 1. CRM ────────────────────────────────────────────────────────────
    cand = crm('candidatos', {'provincia': provincia, 'limit': 900, 'solo_territorio': False}).get('candidatos', [])
    if ambito == 'municipio':
        cand = [c for c in cand if z in norm(c.get('city') or '') or z in norm(c.get('name') or '')] or cand
    if tipos:
        cand = [c for c in cand if (c.get('type') or '') in tipos]
    visitadas = [c for c in cand if c.get('tiene_informe')]
    dormidas  = [c for c in cand if not c.get('tiene_informe')]

    # ── 2. Censo de entidades locales ─────────────────────────────────────
    manc, com = [], []
    if region and (not tipos or 'aapp' in tipos or 'aguas' in tipos):
        c = censos[region]
        for m in c['mancomunidades']:
            if m['agua'] == 'no': continue
            if (ambito == 'municipio' and z in [norm(x) for x in m['municipios']]) or \
               (ambito != 'municipio' and any(norm(p) == norm(provincia) for p in m['provincias'])):
                manc.append(m)
        for k in c['comarcas']:
            if (ambito == 'municipio' and z in [norm(x) for x in k['municipios']]) or \
               (ambito == 'comarca' and z == norm(k['nombre'])):
                com.append(k)

    # ── 3. Adjudicaciones publicas del ultimo ano ─────────────────────────
    adj = []
    if os.path.exists(PLACSP):
        p = json.load(open(PLACSP, encoding='utf-8'))
        for a in p['adjudicaciones']:
            campo = norm(a.get('provincia') or '') + ' ' + norm(a.get('titulo') or '')
            if z and z in campo: adj.append(a)
        vis = {}
        for a in adj:
            k = (norm(a['adjudicatario']), norm(a['titulo'])[:60], round(a.get('importe') or 0))
            if k not in vis or a['fecha'] > vis[k]['fecha']: vis[k] = a
        adj = sorted(vis.values(), key=lambda a: (a['papel'] != 'redacta', -(a.get('importe') or 0)))

    # ── Informe ───────────────────────────────────────────────────────────
    L = [f"# Dossier previo — {lugar}\n",
         f"*Generado el {datetime.date.today().isoformat()}. Todo lo de aquí sale de un REGISTRO, "
         f"no de una búsqueda: el CRM, el censo oficial de entidades locales y las adjudicaciones "
         f"publicadas en la Plataforma de Contratación del Estado.*\n",
         f"**Ámbito detectado:** {ambito} · **provincia:** {provincia}"
         + (f" · **censo disponible:** {region}" if region else " · **sin censo de entidades locales para esta comunidad**"),
         f"**Tipos pedidos:** {', '.join(tipos) if tipos else 'todos'}\n", "---\n"]

    L.append(f"## 1 · Ya en el CRM ({len(cand)})\n")
    L.append(f"**{len(visitadas)} ya visitadas — NO las propongas**, la regla dura 1 lo prohíbe:\n")
    L += [f"- {c['name']}" for c in visitadas] or ["- (ninguna)"]
    L.append(f"\n**{len(dormidas)} en cartera dormida** — están dadas de alta y nadie las ha visitado nunca. "
             f"SÍ son objetivo: márcalas `origen: en_cartera_sin_visitar` con su id.\n")
    L += [f"- [{c.get('id')}] {c['name']} · {c.get('type','?')}" for c in dormidas[:60]]
    if len(dormidas) > 60: L.append(f"- …y {len(dormidas)-60} más")

    L.append(f"\n## 2 · Entidades locales del censo oficial ({len(manc)} mancomunidades · {len(com)} comarcas)\n")
    if not region:
        L.append("⚠️ **No hay censo descargado para esta comunidad autónoma.** No concluyas que no hay "
                 "mancomunidades: dilo como pendiente, con la fuente que no pudiste consultar.\n")
    elif not manc and not com:
        L.append("El censo está disponible y **no recoge ninguna** para esta zona. Esto sí es un "
                 "negativo válido: el censo es un listado cerrado.\n")
    for m in manc:
        marca = '' if m['agua'] == 'si' else ' ⚠️ finalidad genérica: PREGUNTAR si gestionan agua, no descartarla'
        L.append(f"- **{m['nombre'].title()}**{marca}\n"
                 f"  - Finalidad registrada: {m['finalidad'] or '(no consta)'}\n"
                 f"  - {len(m['municipios'])} municipios: {', '.join(x.title() for x in m['municipios'])}\n"
                 f"  - {'Presidente: ' + m['presidente'].title() + ' · ' if m['presidente'] else ''}"
                 f"{'Tel. ' + m['telefono'] + ' · ' if m['telefono'] else ''}"
                 f"{m['direccion'].title() if m['direccion'] else ''}")
    for k in com:
        L.append(f"- **Comarca de {k['nombre']}** — {len(k['municipios'])} municipios")

    red = [a for a in adj if a['papel'] == 'redacta']
    L.append(f"\n## 3 · Quién ha ganado obra de agua aquí en el último año ({len(adj)})\n")
    if not adj:
        L.append("Sin adjudicaciones de agua localizadas para esta zona en los últimos doce meses.\n")
    else:
        L.append(f"**{len(red)} de REDACCIÓN de proyecto.** Esos escribieron el pliego, o sea que "
                 f"especificaron el material: son prescriptores con prueba documental, no candidatos.\n")
        for a in adj[:40]:
            L.append(f"- `{a['papel'].upper()}` {a['fecha']} · {(a.get('importe') or 0):,.0f} € · "
                     f"{a.get('ofertas') or '?'} ofertas · **{a['adjudicatario']}**\n  - {a['titulo'][:170]}")
        perd = sum(max(0, (a.get('ofertas') or 1) - 1) for a in adj)
        if perd: L.append(f"\n*En estos concursos hubo **{perd} ofertas que perdieron**. Esas empresas "
                          f"también hacen obra de agua aquí, y sus nombres no están en estos datos.*")

    L.append("\n---\n## Qué NO tienes que volver a buscar\n")
    L.append("Lo de arriba ya está y es de registro. **Tu trabajo empieza donde acaba esta lista:** "
             "estudios y empresas privadas que no licitan, contactos con nombre, obra anunciada en "
             "prensa, y todo lo que no consta en ningún registro público.")

    dest = os.path.join(RAIZ, 'agentes', 'output', '_datos',
                        f"dossier-{re.sub(r'[^a-z0-9]+','-',z)}.md")
    io.open(dest, 'w', encoding='utf-8').write('\n'.join(L))
    print(f"  ámbito: {ambito} · provincia: {provincia} · censo: {region or 'ninguno'}")
    print(f"  CRM: {len(visitadas)} visitadas · {len(dormidas)} dormidas")
    print(f"  censo: {len(manc)} mancomunidades de agua · {len(com)} comarcas")
    print(f"  adjudicaciones: {len(adj)} ({len(red)} de redacción)")
    print(f"  → {dest}")
    return dest

if __name__ == '__main__':
    main()
