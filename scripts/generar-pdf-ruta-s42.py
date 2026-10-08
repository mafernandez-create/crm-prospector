#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera la hoja de ruta EDITABLE (AcroForm) de la semana 42.

    python3 scripts/generar-pdf-ruta-s42.py [salida.pdf]

Por defecto escribe ~/Downloads/Visitas-S42-confirmaciones.pdf y guarda la
version anterior como .bak.pdf. Los campos rellenables se abren con Preview,
Acrobat o cualquier lector que soporte formularios.

Datos: reorganizacion del 8-oct-2026 (ruta Alicante/Murcia 12-16 oct).
Distancias medidas con OSRM sobre OpenStreetMap: son tiempos en flujo libre,
es decir un SUELO, no una promesa. Festivos verificados contra DOGV y BORM.
Sin precios: los precios son del comercial, no del prescriptor.
"""
import os, shutil, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

VERDE = HexColor("#1b7a43")   # confirmada por escrito
AMBAR = HexColor("#b26a00")   # sin confirmar
ROJO  = HexColor("#9c2525")   # problema / sin pedir
GRIS  = HexColor("#555555")
AZUL  = HexColor("#13406b")
FONDO = HexColor("#eef2f6")

# (hora, estado, titulo, direccion, contacto, nota)
# estado: "OK" confirmada | "?" sin confirmar | "!" problema
DIAS = [
 ("LUNES 12 DE OCTUBRE  ·  Malaga -> Alicante  ·  Fiesta Nacional", [
  ("15:30", "OK", "Salida de Malaga hacia Alicante capital",
   "Destino: Alicante (se duerme alli lunes y martes)",
   "472,7 km / 5 h 24 medidos. Llegada ~21:00",
   "La planificacion decia 4h45: un 12% optimista. El martes se abre a las 9:00 en Avda. de Orihuela 128, "
   "asi que hay que dormir en la capital. En el coche: catalogos y fichas tecnicas de ecoSan, Biopipe y Mute. "
   "Los argumentarios y comparativos son de uso interno: no salen del coche. Tarifas no."),
 ]),
 ("MARTES 13 DE OCTUBRE  ·  Alicante - Xabia - El Verger", [
  ("09:00", "OK", "Fernando Perez Calvo - Diputacion de Alicante (y Marina Alta)",
   "Avda. de Orihuela 128, 03006 Alicante",
   "T. 965 107 375 · fernando.perez@diputacionalicante.es · fichas 2281 y 3166",
   "CONFIRMADA POR ESCRITO. Hora no tocada. Cubre tambien el Consorcio Marina Alta: es su Ingeniero del Area "
   "Tecnica. Tutea. Temas: pliego tipo provincial y conducciones en redaccion. Preguntar que ingenierias les redactan."),
  ("10:30", "?", "Proaguas Costablanca, S.A.",
   "Avda. de Orihuela 39, 03007 Alicante",
   "T. 965 111 376 · proaguas@diputacionalicante.es · ficha 3164",
   "A 517 m andando de la anterior: se encadenan. Rafael Perez Ochoa (Proyectos y Obras), Antonio Carbonell (Agua "
   "Potable). OJO: amontfer@diputacionalicante.es reboto el 8-oct. Pregunta de oro: quien redacto la conduccion "
   "Xabia - Poble Nou de Benitatxell y si hay otra en marcha con la CHJ."),
  ("13:00", "!", "AMJASA - Aguas Municipales de Xabia  (ocupa el hueco de Marina Alta)",
   "Xabia - DIRECCION POSTAL SIN CONFIRMAR: pedirla por telefono",
   "T. 965 790 162 · amjasa@amjasa.com · ficha 3169",
   "Nos remite aqui Fernando Perez por escrito: la redaccion la hizo la empresa municipal de aguas de Javea. "
   "No publican responsable tecnico: conseguir nombre por telefono y NO construir ningun correo. El CIF P0308200E "
   "es del Ayuntamiento, no de AMJASA. Gancho: conduccion Xabia - Benitatxell (3,2 M EUR, 3.170 m de DN400 "
   "fundicion): PE100 compite de frente. Salir de Alicante 11:45 - 87,0 km / 71 min."),
  ("15:30", "?", "Hidrosal SA   (movida de las 17:30)",
   "C/ Moli 27, 03770 El Verger",
   "T. 965 750 220 · hidrosal@hidrosal.es · ficha 2670",
   "Se adelanta para cerrar el dia antes y volver a dormir a Alicante. Avisar del cambio de hora. En pliego se "
   "escribe PE100, no «P100». Vuelta El Verger - Alicante 86,3 km / 66 min medidos (la planificacion decia 55: "
   "un 17% por debajo)."),
 ]),
 ("MIERCOLES 14 DE OCTUBRE  ·  Callosa - Elche - Petrer", [
  ("09:30", "!", "Consorcio Marina Baja   (MOVIDA DEL MARTES: fiesta local en Callosa)",
   "Partida Algar, 03510 Callosa d'en Sarria",
   "T. 965 880 950 · consorcio@consorciomarinabaja.org · ficha 3165",
   "El 13 de octubre es fiesta patronal en Callosa (DOGV num. 10238 de 14-11-2025). La fiesta es solo el 13: el "
   "miercoles esta limpio. AVISAR DEL CAMBIO DE DIA. Jaume Berenguer Ponsoda (Director Tecnico), Antonio «Toni» "
   "Perez (Presidente). Gancho: tuberia maestra del Guadalest y renovaciones de red. NO sacar la desaladora de "
   "Benidorm. Salir de Alicante 08:15 - 69,8 km / 62 min."),
  ("12:45", "?", "C.G.R. Riegos de Levante Izquierda del Segura   (movida de las 09:30)",
   "C/ Santuario de la Luz 1, 03290 Elche",
   "T. 966 631 000 · comunidadgeneral@rlevante.com · ficha 2656",
   "LA MAS VALIOSA DEL DIA: la comunidad general esta por encima de las de base. Roque Bru Bonet (Presidente), "
   "Jose Vicente Martinez (Gerente). Biopipe: PVC-O, ISO 16422 y UNE-EN 17176, clase 500, D 90-630, PN 12,5-25, "
   "barras de 5,9 m. No decir que somos los primeros ni los unicos con la 17176. Bajada Callosa - Elche ~99 km / "
   "~88 min por Alicante."),
  ("14:00", "?", "Illa Infraestructuras SLU   (movida de las 12:45)",
   "C/ Juan de la Cierva 31 (2E), P.E. Torrellano, 03320 Elche",
   "T. 653 899 698 · administracion@illainfraestructuras.es · ficha 2671",
   "Es CONTRATISTA DE OBRA CIVIL, no redactor: pedirle su lista de materiales y para que ingenierias trabaja. "
   "ecoSan: PVC-U tricapa, UNE-EN 13476-2, DN 110-800, barras de 6 m, SN4 y SN8. El 60% de reciclado esta "
   "certificado por diametro, no en bloque. No decir que los pozos cumplen la UNE-EN 13598-2."),
  ("15:00", "!", "CAINUR - Consultores Asociados   HUECO OFRECIDO, PENDIENTE DE RESPUESTA",
   "Domicilio registral en Benidorm 03502 - DONDE NOS RECIBEN ESTA SIN RESOLVER",
   "direccion@cainur.com · telefono [SIN DATO] · ficha 3168",
   "Es la hora que les propusimos nosotros. Benidorm esta a ~90 km de Elche y NO cabe en este hueco; Elche si. "
   "La nota de «oficina en el Parque Empresarial de Elche» no esta verificada y contradice el registro. Si "
   "contestan, lo primero es preguntar DONDE. Gancho sin gastar: EPSAR Lote 7, colectores de La Nucia y l'Alfas "
   "del Pi, 63.000 EUR, exp. 2021/SA/0034, adjudicado el 8-feb-2023."),
  ("16:00", "?", "GEA Architects",
   "Calle Luis Gonzaga Llorente 4, 03202 Elche",
   "T. 966 674 318 · info@geaarchitects.es · ficha 298",
   "ESTUDIO DE ARQUITECTURA: el producto que manda es MUTE y el discurso de la LCSP NO APLICA - un estudio "
   "privado especifica en memoria y mediciones, no en un pliego administrativo. Alvaro Pico, Sergio Navarro, "
   "Raquel (tecnica de materiales)."),
  ("17:45", "?", "Pablo Munoz Paya Arquitectos",
   "Carrer Babieca 1, bajo izquierda, 03610 Petrer",
   "T. 966 311 916 · pablo@munozpaya.com · ficha 279",
   "ESTUDIO DE ARQUITECTURA: MUTE, nada de LCSP. Cierra el dia. Petrer - Elche 35,0 km / 27 min para dormir."),
  ("--:--", "!", "Aigues i Sanejament d'Elx   FUERA DE RUTA - NO ES VISITA",
   "Plaza de la Lonja 1, 03202 Elx",
   "T. 900 700 749 · ficha 2668",
   "Han dicho NO por escrito el 8-oct: contesto el buzon de licitaciones, no la Gerente, con la plantilla "
   "«empresa mixta obligada por la LCSP, esten atentos a la PLACSP». Contestado el mismo dia con copia a Clemente. "
   "Queda solo la llamada: es un 900 de atencion al cliente, pedir el Area Tecnica y no quedarse en el primer "
   "nivel. El buzon de la Gerente no es publico: no construir uno."),
 ]),
 ("JUEVES 15 DE OCTUBRE  ·  Redovan - Crevillent - Torrevieja", [
  ("09:30", "OK", "Jose Manuel Carrillo - Ingenieria de regadios",
   "Calle Maria Cristina 6, bajo, 03370 Redovan   (NO Orihuela)",
   "T. 607 238 020 · jcarrilloc@telefonica.net · ficha 3167",
   "CONFIRMADA POR CORREO. Hora no tocada. Tecnico externo del Juzgado Privativo de Aguas de Orihuela, no "
   "plantilla. Proyectos y direccion de obra de comunidades de regantes. Salir de Elche 08:45 - 35,3 km / 32 min."),
  ("11:15", "!", "C.R. San Felipe Neri   VISITA SIN PEDIR",
   "Partida San Felipe Neri, 03158 Crevillent - direccion exacta a confirmar",
   "T. 965 484 606 · SIN CORREO EN LA FICHA · ficha 2669",
   "La carta del 8-oct no les llego: al no haber correo salio al buzon del SCRATS. ELLOS NO SABEN QUE VAMOS. "
   "Llamar y pedir la cita de viva voz. DISTANCIA CORREGIDA: Redovan - San Felipe Neri son 21,6 km / 26 min, no "
   "los 11,5 km / 15 min de la planificacion. Saliendo a las 10:40 se llega a las ~11:06: el margen real es de "
   "9 minutos, no de 20."),
  ("12:45", "!", "C.R. Riegos de Levante - Margen Derecha",
   "SITIO SIN RESOLVER: el CRM dice Orihuela, la agenda dice Los Montesinos (~25 km)",
   "T. 965 300 303 (via Juzgado de Aguas) · rlmargenderecha@gmail.com · ficha 2666",
   "Preguntar DONDE antes que cualquier otra cosa: 25 km cambian la tarde entera. Sin telefono propio."),
  ("16:00", "?", "INGLOBA Ingenieros y Arquitectos",
   "Calle Fotografos Darblade 5, P3, 03181 Torrevieja",
   "T. 965 705 133 · info@estudioingloba.com · ficha 299",
   "Jorge Bernabe (Ingeniero, 617 15 68 11) es la entrada tecnica. Tambien Paco Bernabe, Santiago Aniorte, "
   "Jose Luis Garcia, Manuel Villena, Cayetano Bernabe."),
  ("17:30", "!", "GAMA Grupo Inmobiliario",
   "Calle Luis Canovas Martinez 1, 03183 Torrevieja",
   "WhatsApp Business +34 694 42 42 95 · T. 965 709 386 · ficha 3126",
   "roman@gamagrupo.es REBOTO por buzon lleno: la via es el WhatsApp, y va por la cuenta BUSINESS (el Mac solo "
   "tiene la normal: precargar con web.whatsapp.com/send). ES PROMOTORA: producto MUTE, nada de LCSP. Cierra el "
   "dia. Torrevieja - Murcia 50,8 km / 53,5 min: contar 50 min, no los 45 de la planificacion."),
 ]),
 ("VIERNES 16 DE OCTUBRE  ·  Murcia - Cartagena - Malaga", [
  ("09:00", "?", "ESAMUR",
   "C/ Santiago Navarro 4, Espinardo, 30100 Murcia",
   "T. 968 879 520 · esamur@esamur.com · ficha 2683",
   "Ignacio Diaz Rodriguez-Valdes (Director Gerente), Pedro Simon Andreu (Area Tecnica). Se puede llamar el "
   "viernes 9: en la Region de Murcia es laborable (verificado contra el BORM, los 45 municipios). Salir 08:30 - "
   "Murcia - Espinardo 5,2 km / 7 min."),
  ("10:15", "?", "SCRATS",
   "C/ Azucaque 4, 30001 Murcia",
   "T. 968 221 422 · scrats@scrats.com · ficha 2684",
   "OJO: a este buzon llego por error la carta de la C.R. San Felipe Neri. Si lo mencionan, reconocerlo sin mas."),
  ("12:00", "OK", "Mancomunidad de los Canales del Taibilla - Pablo Roa",
   "C/ Mayor 1, 30201 Cartagena - 5a planta, primera puerta a la izquierda",
   "pablo.roa@mct.es · 868 901 564 ext. 564 · movil 674 709 866 · ficha 2364",
   "CONFIRMADA. Hora no tocada. Jefe de Area de Explotacion. Preguntar por el en centralita. Tambien Carlos "
   "Conradi Monner (Director), secretaria 868 901 541. Murcia - Cartagena 48,9 km / 39 min."),
  ("13:15", "!", "Hidrogea / EMUASA   DIRECCION SIN RESOLVER",
   "La ficha dice Plaza Circular 9, 30008 MURCIA - y esto va despues de Cartagena",
   "T. 968 278 000 · aguas@emuasa.es · ficha 2313",
   "O el sitio es Murcia (y entonces este hueco es imposible) o hay una oficina en Cartagena que no tenemos. "
   "Preguntarlo al llamar. ES LA VISITA MAS PRESCINDIBLE DEL VIERNES: si el dia se desborda, esta es la que se "
   "cae. Hay 6 fichas Hidralia/Hidrogea duplicadas; la de Murcia es la 2313."),
  ("14:15", "OK", "Regreso a Malaga",
   "Cartagena -> Malaga: 392,0 km / 4 h 32 por la AP-7 de la costa (peaje)",
   "Llegada estimada 18:45 - 19:15",
   "PARADA DURA: clase de mates de Marta a las 20:00. El itinerario medido no pasa por Murcia (RM-36, RM-332, "
   "CT-31, AP-7, A-7); forzar la salida por Alhama-Totana da 416,8 km / 4 h 53, o sea 21 minutos mas. Si el dia "
   "se desborda, la palanca es Hidrogea."),
 ]),
]

PERNOCTAS = [
 ("ALICANTE", "Noches del LUNES 12 y MARTES 13",
  "El martes empieza a las 9:00 en Alicante capital y acaba en El Verger (86,3 km / 66 min de vuelta); el "
  "miercoles abre en Callosa (69,8 km / 62 min). Dormir las dos noches en la capital es lo que menos kilometros "
  "cuesta. Denia se descarto porque no se pudo verificar ningun hotel alli y no me invento uno.",
  [("SI", "AC Hotel Alicante", "Avda. de Elche 3, 03008",
    "Garaje propio de pago, PLAZAS LIMITADAS: llamar antes si se va cargado. El rotulo no lleva «by Marriott»."),
   ("SI", "Hospes Amerigo", "C/ Rafael Altamira 7, 03002",
    "Parking privado limitado y punto de recarga electrica."),
   ("SI", "INNSiDE Alicante Porta Maris", "Plaza Puerta del Mar 3, 03002",
    "Parking self-service en el propio hotel. Ya NO se llama «Hotel Spa Porta Maris by Melia»: ese nombre solo "
    "sobrevive en la URL antigua."),
   ("??", "Melia Alicante", "Plaza del Puerto 3, 03001",
    "Direccion verificada, PARKING NO CONFIRMADO: la pagina en espanol dice «parking cercano» y la inglesa «car "
    "park». Hay que llamar antes de reservar."),
   ("NO", "Eurostars Mediterranea Plaza", "Plaza del Ayuntamiento 6, 03002",
    "DESCARTADO: no tiene garaje propio. Usa plazas reservadas en el Parking Casino publico, con fianza y a "
    "peticion en recepcion. Descartado por logistica, no por el hotel.")]),
 ("ELCHE", "Noche del MIERCOLES 14",
  "El miercoles acaba a las 18:45 en Petrer (Petrer - Elche 35,0 km / 27 min) y el jueves abre a las 9:30 en "
  "Redovan (Elche - Redovan 35,3 km / 32 min, salir 08:45). Elche parte la diferencia. Los dos candidatos son "
  "del grupo Port Hotels: una sola llamada resuelve los dos.",
  [("SI", "Hotel Huerto del Cura", "Porta de la Morera 14, 03203 Elx",
    "El numero es el 14, no el 20: el 20 es una direccion de parking que aparece en huertocura.com, que es la "
    "web del JARDIN, no del hotel. Ahora opera bajo Port Hotels. Parking de pago PROBABLE segun agregadores; el "
    "«sin reserva previa» NO esta confirmado."),
   ("SI", "Hotel Port Jardin Milenio", "Carrer Curtidors 17, 03203 Elx",
    "El «s/n» que circula esta incompleto. Parking de pago en el propio hotel PROBABLE, 5 plazas accesibles y "
    "punto de recarga electrica.")]),
 ("MURCIA", "Noche del JUEVES 15",
  "El jueves acaba a las 18:30 en Torrevieja (50,8 km / 53,5 min a Murcia) y el viernes abre a las 9:00 en "
  "Espinardo (5,2 km / 7 min, salir 08:30). Dormir en Murcia capital ahorra la hora de la manana.",
  [("SI", "Barcelo Murcia Siete Coronas", "Paseo de Garay 5, 30003",
    "RECOMENDADO. Es el unico de los tres con parking propio de pago verificado en su propia web, «sujeto a "
    "disponibilidad a la llegada»."),
   ("??", "Hotel Murcia Nelva", "Avda. Primero de Mayo 5, 30006",
    "Grupo Hoteles Santos. El dominio oficial es hotelmurcianelva.com; hotelnelva.com rechaza la conexion en 443 "
    "y la cadena de certificados del www. no se puede verificar. PARKING PROPIO NO CONFIRMADO: solo consta un "
    "garaje cubierto 24 h de terceros en Avda. Primero de Mayo 9, altura maxima 2,10 m."),
   ("??", "Hesperia Murcia Centro", "C/ Madre de Dios 4, 30004  (3 estrellas)",
    "Tiene parking, pero el propio hotel dice que las plazas en superficie son muy limitadas. NO afirmar que "
    "alguna vez se llamara «NH Murcia Centro»: no hay ninguna fuente que lo respalde.")]),
]

AVISOS = [
 "Los festivos estan verificados: viernes 9-oct Dia de la Comunitat Valenciana (Decreto 100/2025 del Consell) y "
 "lunes 12-oct Fiesta Nacional. Por eso la ronda de llamadas a Alicante es HOY, jueves 8. En la Region de Murcia "
 "el 9 SI es laborable: ESAMUR, SCRATS, MCT e Hidrogea se pueden llamar manana.",
 "Todas las distancias y tiempos estan medidos con OSRM sobre OpenStreetMap y son de FLUJO LIBRE: son un suelo, "
 "no una promesa. Los tiempos de la planificacion original iban entre un 12% y un 17% por debajo de lo medido.",
 "Nada de «homologacion de material», «alta de proveedor» ni «lista de materiales admitidos»: no existen como "
 "figura en la LCSP y suenan a peticion de acceso privilegiado. Decir «criterios tecnicos del pliego» y "
 "«acreditacion de equivalencia».",
 "El articulo 115 de la LCSP es una FACULTAD del organo de contratacion, no un derecho nuestro. Si sale, citarlo "
 "con sus propias cautelas y nunca atado a un expediente vivo.",
 "Las formas de redactar prescripciones estan en el 126.5 y la prohibicion de marcas en el 126.6. La prueba de "
 "equivalencia, en el 126.7 y 126.8.",
 "Precios no: eso es del comercial. El prescriptor no lleva tarifas.",
 "Argumentarios, comparativos y dosieres son de USO INTERNO y se quedan en el coche. Solo salen catalogos y "
 "fichas tecnicas de ecoSan, Biopipe y Mute.",
 "El 60% de material reciclado del ecoSan esta certificado POR DIAMETRO, no en bloque: en la FT rev.7 el SN4 "
 "excluye DN 110/125/160 y el SN8 esos mas el DN 800. Si sale el dato, ofrecer el alcance exacto.",
 "Biopipe tiene dos certificados AENOR: 001/007135 es de Archidona y 001/007801 de Lantaron. Cual citar depende "
 "del pliego. No afirmar que GPF fue la primera o la unica con la UNE-EN 17176.",
 "No presentar el ACS frances como equivalente a la conformidad sanitaria espanola del RD 3/2023.",
 "Con estudios de arquitectura y promotoras (GEA, Pablo Munoz Paya, GAMA) el producto es MUTE y el discurso de "
 "la LCSP NO aplica: especifican en memoria y mediciones, no en un pliego.",
 "Los que licitan y pierden tambien son cartera: se presentaran a mas licitaciones.",
 "Las tres visitas confirmadas por escrito (Fernando Perez martes 9:00, Carrillo jueves 9:30, MCT viernes 12:00) "
 "NO se han tocado en la reorganizacion.",
]

W, H = A4
M = 15 * mm
nfield = [0]

def field(c, x, y, w, h, value="", multi=False):
    nfield[0] += 1
    c.acroForm.textfield(name="f%03d" % nfield[0], value=value,
        x=x, y=y, width=w, height=h, fontSize=8,
        borderColor=HexColor("#9aa7b4"), fillColor=white,
        textColor=HexColor("#111111"), borderWidth=0.5,
        forceBorder=True, fieldFlags="multiline" if multi else "")

def wrap(c, text, font, size, maxw):
    c.setFont(font, size)
    out, line = [], ""
    for word in text.split():
        probe = (line + " " + word).strip()
        if c.stringWidth(probe, font, size) <= maxw:
            line = probe
        else:
            if line: out.append(line)
            line = word
    if line: out.append(line)
    return out

class Sheet:
    def __init__(self, c):
        self.c = c; self.y = 0; self.page = 0; self.newpage()

    def newpage(self):
        c = self.c
        if self.page: c.showPage()
        self.page += 1
        c.setFillColor(AZUL); c.rect(0, H - 17*mm, W, 17*mm, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("Helvetica-Bold", 13)
        c.drawString(M, H - 11*mm, "RUTA S42  ·  12 - 16 de octubre de 2026  ·  Alicante y Murcia")
        c.setFont("Helvetica", 7.5)
        c.drawRightString(W - M, H - 11*mm, "Reorganizada el 8-oct-2026  ·  pag. %d" % self.page)
        c.setFillColor(GRIS); c.setFont("Helvetica", 6.5)
        c.drawString(M, 8*mm, "Manuel Fernandez Garcia  ·  Prescriptor  ·  Grupo Plasticos Ferro  ·  "
                              "ma.fernandez@grupogpf.com  ·  647 403 603")
        c.drawRightString(W - M, 8*mm, "Campos rellenables: escribir directamente en el PDF")
        self.y = H - 24*mm

    def need(self, h):
        if self.y - h < 14*mm: self.newpage()

    def daytitle(self, t):
        self.need(16*mm)
        c = self.c
        c.setFillColor(FONDO); c.rect(M, self.y - 6.5*mm, W - 2*M, 6.5*mm, stroke=0, fill=1)
        c.setFillColor(AZUL); c.setFont("Helvetica-Bold", 9.5)
        c.drawString(M + 2*mm, self.y - 4.6*mm, t)
        self.y -= 9*mm

    def visit(self, hora, estado, titulo, direccion, contacto, nota):
        c = self.c
        col = {"OK": VERDE, "?": AMBAR, "!": ROJO}[estado]
        tag = {"OK": "CONFIRMADA", "?": "SIN CONFIRMAR", "!": "ATENCION"}[estado]
        body = W - 2*M - 20*mm
        tl = wrap(c, titulo, "Helvetica-Bold", 8.8, body)
        nl = wrap(c, nota, "Helvetica", 6.6, body)
        h = (4.6 + 3.9*len(tl) + 3.4 + 3.4 + 2.6*len(nl) + 7.5 + 9.5) * mm
        self.need(h)
        top = self.y
        c.setFillColor(col); c.rect(M, top - h + 2*mm, 1.1*mm, h - 2*mm, stroke=0, fill=1)
        x = M + 4*mm
        c.setFillColor(col); c.setFont("Helvetica-Bold", 11)
        c.drawString(x, top - 4.2*mm, hora)
        c.setFont("Helvetica-Bold", 5.6)
        c.drawString(x, top - 7.4*mm, tag)
        tx = x + 17*mm
        c.setFillColor(HexColor("#111111")); y = top - 4.2*mm
        for ln in tl:
            c.setFont("Helvetica-Bold", 8.8); c.drawString(tx, y, ln); y -= 3.9*mm
        c.setFillColor(GRIS); c.setFont("Helvetica", 7); c.drawString(tx, y, direccion); y -= 3.4*mm
        c.setFont("Helvetica", 7); c.drawString(tx, y, contacto); y -= 3.4*mm
        c.setFillColor(HexColor("#333333"))
        for ln in nl:
            c.setFont("Helvetica", 6.6); c.drawString(tx, y, ln); y -= 2.6*mm
        y -= 1.5*mm
        c.setFillColor(GRIS); c.setFont("Helvetica", 6)
        c.drawString(tx, y + 1.2*mm, "Me recibe:")
        field(c, tx + 15*mm, y - 0.4*mm, 42*mm, 4.6*mm)
        c.drawString(tx + 59*mm, y + 1.2*mm, "Cargo / movil / correo:")
        field(c, tx + 90*mm, y - 0.4*mm, W - M - (tx + 90*mm), 4.6*mm)
        y -= 6.4*mm
        c.drawString(tx, y + 1.2*mm, "Lo que sale de aqui:")
        field(c, tx, y - 6.2*mm, W - M - tx, 6.8*mm, multi=True)
        self.y = top - h

    def pernocta(self, ciudad, noches, porque, opciones):
        c = self.c
        pl = wrap(c, porque, "Helvetica", 6.8, W - 2*M - 6*mm)
        h = (7 + 2.8*len(pl) + 3) * mm
        for _, nom, dirn, obs in opciones:
            h += (4.2 + 2.6*len(wrap(c, obs, "Helvetica", 6.4, W - 2*M - 30*mm)) + 1.6) * mm
        h += 9*mm
        self.need(min(h, 200*mm))
        top = self.y
        c.setFillColor(FONDO); c.rect(M, top - 6.5*mm, W - 2*M, 6.5*mm, stroke=0, fill=1)
        c.setFillColor(AZUL); c.setFont("Helvetica-Bold", 9.5)
        c.drawString(M + 2*mm, top - 4.6*mm, "PERNOCTA %s  ·  %s" % (ciudad, noches))
        c.setFillColor(ROJO); c.setFont("Helvetica-Bold", 6.2)
        c.drawRightString(W - M - 2*mm, top - 4.4*mm, "POSIBLE RESERVA - SIN RESERVAR")
        y = top - 10*mm
        c.setFillColor(HexColor("#333333"))
        for ln in pl:
            c.setFont("Helvetica", 6.8); c.drawString(M + 2*mm, y, ln); y -= 2.8*mm
        y -= 2*mm
        for marca, nom, dirn, obs in opciones:
            ol = wrap(c, obs, "Helvetica", 6.4, W - 2*M - 30*mm)
            bh = (4.2 + 2.6*len(ol) + 1.6) * mm
            if y - bh < 16*mm:
                self.y = y; self.newpage(); y = self.y
            col = {"SI": VERDE, "??": AMBAR, "NO": ROJO}[marca]
            sym = {"SI": "[ ]", "??": "[?]", "NO": "[X]"}[marca]
            c.setFillColor(col); c.setFont("Helvetica-Bold", 7.5)
            c.drawString(M + 2*mm, y, sym)
            c.setFillColor(HexColor("#111111")); c.setFont("Helvetica-Bold", 7.8)
            c.drawString(M + 10*mm, y, nom)
            c.setFillColor(GRIS); c.setFont("Helvetica", 6.8)
            c.drawString(M + 10*mm + c.stringWidth(nom, "Helvetica-Bold", 7.8) + 3*mm, y, "- " + dirn)
            y -= 3.4*mm
            c.setFillColor(HexColor("#333333"))
            for ln in ol:
                c.setFont("Helvetica", 6.4); c.drawString(M + 10*mm, y, ln); y -= 2.6*mm
            y -= 1.6*mm
        c.setFillColor(GRIS); c.setFont("Helvetica", 6)
        c.drawString(M + 2*mm, y + 1.2*mm, "Reservado en:")
        field(c, M + 20*mm, y - 0.4*mm, 55*mm, 4.6*mm)
        c.drawString(M + 78*mm, y + 1.2*mm, "Localizador / plaza de garaje:")
        field(c, M + 118*mm, y - 0.4*mm, W - M - (M + 118*mm), 4.6*mm)
        self.y = y - 7*mm

    def avisos(self, items):
        self.newpage()
        c = self.c
        c.setFillColor(FONDO); c.rect(M, self.y - 6.5*mm, W - 2*M, 6.5*mm, stroke=0, fill=1)
        c.setFillColor(AZUL); c.setFont("Helvetica-Bold", 9.5)
        c.drawString(M + 2*mm, self.y - 4.6*mm, "LO QUE NO SE PUEDE DECIR, Y LO QUE HAY QUE RECORDAR")
        y = self.y - 11*mm
        for it in items:
            lines = wrap(c, it, "Helvetica", 7.2, W - 2*M - 8*mm)
            if y - (3*len(lines) + 2)*mm < 16*mm:
                self.y = y; self.newpage(); y = self.y
            c.setFillColor(AZUL); c.setFont("Helvetica-Bold", 7.2)
            c.drawString(M + 2*mm, y, "-")
            c.setFillColor(HexColor("#222222"))
            for ln in lines:
                c.setFont("Helvetica", 7.2); c.drawString(M + 6*mm, y, ln); y -= 3*mm
            y -= 2*mm
        y -= 3*mm
        c.setFillColor(GRIS); c.setFont("Helvetica", 6)
        c.drawString(M + 2*mm, y, "Notas libres de la semana:")
        field(c, M + 2*mm, y - 30*mm, W - 2*M - 4*mm, 28*mm, multi=True)
        self.y = y - 34*mm


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
        "~/Downloads/Visitas-S42-confirmaciones.pdf")
    if os.path.exists(out):
        shutil.copy2(out, out.replace(".pdf", ".bak.pdf"))
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle("Ruta S42 - 12 a 16 de octubre de 2026")
    c.setAuthor("Manuel Fernandez Garcia")
    s = Sheet(c)
    for titulo, visitas in DIAS:
        s.daytitle(titulo)
        for v in visitas:
            s.visit(*v)
    s.newpage()
    for p in PERNOCTAS:
        s.pernocta(*p)
    s.avisos(AVISOS)
    c.save()
    print("%s  ·  %d campos rellenables" % (out, nfield[0]))

if __name__ == "__main__":
    main()
