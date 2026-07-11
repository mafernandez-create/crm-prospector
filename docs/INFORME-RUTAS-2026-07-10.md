# Informe de rutas de proyectos — 2026-07-10

## Resumen

La raíz canónica del ecosistema es **`~/Proyectos`** (`/Users/ma.fernandez/Proyectos`).
La raíz antigua **`~/Documents/02_Proyectos_Claude`** es una copia divergente que se
borrará cuando iCloud termine de descargarla (dos copias reales, no symlink). Esto ya
estaba documentado en la memoria `migracion-ruta-proyectos.md` (migración del 2026-07-07).

El **CRM** se movió a `~/Proyectos/Trabajo_GPF/crm` **después** de aquel barrido (07-09),
por lo que conservaba referencias a la ruta antigua. Se han corregido hoy.

## Ruta canónica del CRM

```
/Users/ma.fernandez/Proyectos/Trabajo_GPF/crm
```

Rama `main`, remoto `github.com/mafernandez-create/crm-prospector.git`.
(La copia en `~/Documents/02_Proyectos_Claude/Trabajo_GPF/crm` está obsoleta.)

## Cambios aplicados hoy (CRM)

Reemplazo `Documents/02_Proyectos_Claude/` → `Proyectos/` en referencias funcionales.
Se creó un backup `.bak-ruta-20260710-084446` de cada archivo antes de editar.

| Archivo | Línea | Qué era | Ahora |
|---|---|---|---|
| `gen_resumen_visitas.js` | 262 | escribía el .docx en la ruta antigua | ruta nueva |
| `gen_jaen.js` | 547 | escribía el .docx en la ruta antigua | ruta nueva |
| `gen_planning_v2.js` | 670 | escribía el .docx en la ruta antigua | ruta nueva |
| `.claude/agents/prospector-nuevos.md` | 37, 87, 88, 100 | llamadas `python3 …/crm_query.py` a ruta antigua | ruta nueva |
| `.claude/agents/prospector-nuevos.md` | 249, 255 | plantilla de ruta de salida documentada | ruta nueva |

Verificado: `agentes/_lib/crm_query.py` existe en la ruta nueva; tras el cambio no
quedan referencias funcionales a `02_Proyectos_Claude`.

## Deliberadamente NO tocado

- `crm/agentes/output/prospectos-2026-07-07-*-corredor.md` (2 archivos): son **outputs
  históricos** fechados; se dejan como artefacto de ese momento.
- `~/Proyectos/.claude/settings.local.json`: el string `02_Proyectos_Claude` es solo un
  permiso guardado, inofensivo (así consta en la memoria de migración).

## Resto del ecosistema

El barrido del 2026-07-07 ya dejó el resto de `~/Proyectos` apuntando a la ruta nueva
(scripts raíz, launchd activos, plists-plantilla, etc.). No se han encontrado más
referencias funcionales a la ruta antigua fuera del CRM.

## A confirmar por Manolo

Estos proyectos aparecen en la raíz **antigua** pero no los localicé bajo `~/Proyectos`
— confirma si faltan por migrar o los has descartado:

- `Trabajo_GPF/formacion-red-comercial/ferroplast-formacion`
- `Trabajo_GPF/analisis-clientes/cliente-brief-gpf`
- `Personal/Libros/meditapp`
- `Personal/Consultoria/curso-consultor-ia`
- `Personal/bosque-libre/bosque-libre-web`

Aparte, existen `~/Developer/crm-comercial` y `~/Developer/crm-prospector` (anteriores);
confirma si son históricos o siguen vivos.

## Pendiente (heredado de la migración, lo haces tú)

- Borrar `~/Library/LaunchAgents/*.plist.bak-3f9a8e4` y `_backup-migracion-20260707-125654/`.
- Borrar `~/Documents/02_Proyectos_Claude` cuando iCloud acabe.
- Opcional: borrar los backups `*.bak-ruta-20260710-084446` del CRM tras revisar el diff.
