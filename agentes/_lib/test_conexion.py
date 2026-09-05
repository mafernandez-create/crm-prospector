"""Test de conexion a Firestore — solo lectura."""
import os
import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.expanduser("~/.firebase-keys/ferroplast-crm-admin.json")

print("=" * 60)
print("TEST CONEXION FIRESTORE — ferroplast-crm")
print("=" * 60)
print(f"Clave: {KEY_PATH}")

# Inicializar app
cred = credentials.Certificate(KEY_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()
print("OK — conexion establecida")
print()

# Contar studios
print("Leyendo coleccion 'studios'...")
studios_ref = db.collection("studios")
docs = list(studios_ref.stream())
print(f"  Total documentos: {len(docs)}")
print()

# Mostrar 3 ejemplos (solo campos no sensibles)
print("Primeros 3 documentos (resumen):")
for i, doc in enumerate(docs[:3], 1):
    data = doc.to_dict()
    print(f"\n  #{i} — ID: {doc.id}")
    print(f"     name:     {data.get('name', '(sin nombre)')}")
    print(f"     type:     {data.get('type', '?')}")
    print(f"     status:   {data.get('status', '?')}")
    print(f"     province: {data.get('province', '?')}")
    print(f"     priority: {data.get('priority', '?')}")
    print(f"     score:    {data.get('score', '?')}")
print()

# Leer _meta/planificador
print("Leyendo _meta/planificador...")
plan_doc = db.collection("_meta").document("planificador").get()
if plan_doc.exists:
    plan = plan_doc.to_dict()
    schedule = plan.get("schedule", {})
    print(f"  OK — fechas planificadas: {len(schedule)}")
    if schedule:
        last_dates = sorted(schedule.keys())[-3:]
        print(f"  Ultimas fechas: {', '.join(last_dates)}")
else:
    print("  (planificador vacio o no existe)")

print()
print("=" * 60)
print("TEST COMPLETADO CORRECTAMENTE")
print("=" * 60)
