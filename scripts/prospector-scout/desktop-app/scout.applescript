on run
	set crmDir to (POSIX path of (path to home folder)) & "Proyectos/Trabajo_GPF/crm"
	set runner to quoted form of (crmDir & "/scripts/prospector-scout/run-scout.sh")

	-- 1) Provincia / zona
	try
		set zonaRes to display dialog "¿Qué provincia o zona quieres prospectar?" default answer "" with title "Scout — Prospectos GPF" buttons {"Cancelar", "Buscar"} default button "Buscar" with icon note
	on error number -128
		return -- Cancelar
	end try
	set zona to text returned of zonaRes
	if zona is "" then
		display dialog "No has indicado ninguna zona." buttons {"OK"} default button "OK" with icon caution with title "Scout"
		return
	end if

	-- 2) Foco de producto (opcional)
	set foco to ""
	try
		set focoRes to display dialog "Foco de producto (opcional). Déjalo vacío para indistinto:" default answer "" with title "Scout — Prospectos GPF" buttons {"Cancelar", "Buscar"} default button "Buscar" with icon note
		set foco to text returned of focoRes
	on error number -128
		return
	end try

	-- 3) Construir el comando (con comillas seguras) y lanzarlo en Terminal
	set cmd to "cd " & quoted form of crmDir & " && " & runner & " --medir " & quoted form of zona
	if foco is not "" then set cmd to cmd & " " & quoted form of foco

	tell application "Terminal"
		activate
		do script cmd
	end tell
end run
