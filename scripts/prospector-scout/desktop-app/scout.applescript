-- Scout.app — lanzador de escritorio.
--
-- Llama a `scripts/scout`, que es el mando unico: primero arma el dossier
-- previo (CRM con dias desde el ultimo contacto, censo oficial de entidades
-- locales y un año de adjudicaciones publicas) y luego lanza el barrido con
-- ese dossier ya hecho.
--
-- Reglas de la zona, tal y como las pidio Manolo:
--   "Malaga"            → solo la CAPITAL
--   "Malaga provincia"  → toda la provincia
--   "Alagon"            → ese municipio
--   "Ribera Baja del Ebro" → esa comarca

on run
	set crmDir to (POSIX path of (path to home folder)) & "Proyectos/Trabajo_GPF/crm"
	set runner to quoted form of (crmDir & "/scripts/scout")

	-- 1) Zona
	try
		set zonaRes to display dialog ¬
			"¿Qué zona quieres prospectar?" & return & return & ¬
			"• «Málaga» busca solo en la capital" & return & ¬
			"• «Málaga provincia» busca en toda la provincia" & return & ¬
			"• También vale un municipio o una comarca" ¬
			default answer "" with title "Scout — Prospectos GPF" ¬
			buttons {"Cancelar", "Siguiente"} default button "Siguiente" with icon note
	on error number -128
		return
	end try
	set zona to text returned of zonaRes
	if zona is "" then
		display dialog "No has indicado ninguna zona." buttons {"OK"} default button "OK" ¬
			with icon caution with title "Scout"
		return
	end if

	-- 2) Tipo de empresa (opcional): sin elegir nada, van todos
	set tipos to {"Todos los tipos", "Arquitectura", "Ingeniería", "Comunidades de regantes", ¬
		"Operadores del agua", "Administración y mancomunidades", "Constructoras", ¬
		"Promotoras", "Distribución"}
	set claves to {"", "arquitectura", "ingenieria", "regantes", "aguas", "aapp", ¬
		"constructora", "promotora", "distribucion"}
	set eleccion to choose from list tipos with title "Scout — tipo de empresa" ¬
		with prompt "¿Qué tipo de empresa? Puedes marcar varios." ¬
		default items {"Todos los tipos"} with multiple selections allowed
	if eleccion is false then return

	set tipoArg to ""
	repeat with e in eleccion
		repeat with i from 1 to count of tipos
			if (item i of tipos) is (e as text) then
				set k to item i of claves
				if k is not "" then
					if tipoArg is "" then
						set tipoArg to k
					else
						set tipoArg to tipoArg & "," & k
					end if
				end if
			end if
		end repeat
	end repeat

	-- 3) ¿Solo el dossier (gratis) o también el barrido (~2 $)?
	set modo to button returned of (display dialog ¬
		"¿Qué hago con «" & zona & "»?" & return & return & ¬
		"• Dossier: lo que ya consta en registros. Gratis y en segundos." & return & ¬
		"• Completo: además el barrido de campo. Unos 12 minutos y ~2 $." ¬
		with title "Scout" buttons {"Cancelar", "Solo dossier", "Completo"} ¬
		default button "Completo" with icon note)
	if modo is "Cancelar" then return

	set cmd to "cd " & quoted form of crmDir & " && " & runner & " " & quoted form of zona
	if tipoArg is not "" then set cmd to cmd & " --tipo " & quoted form of tipoArg
	if modo is "Solo dossier" then set cmd to cmd & " --solo-dossier"

	tell application "Terminal"
		activate
		do script cmd
	end tell
end run
