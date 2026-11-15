#!/bin/bash
# Descarga diaria de la serie histórica de temperatura por comuna (Open-Meteo), hasta agotar el presupuesto del día.
# Después recalcula qué comunas ya tienen clima propio para el mapa de riesgo (e6).
#   descarga_diaria.sh --iniciar   la lanza en segundo plano y vuelve de inmediato
#   descarga_diaria.sh --estado    muestra las últimas líneas del registro y lo que falta
#   descarga_diaria.sh             la ejecuta en primer plano
# Registro: ../.trabajo/clima_diaria.log. No corre dos veces a la vez. PRESUPUESTO=8000 llamadas por defecto.
cd "$(dirname "$0")" || exit 1
PY=../../.venv/bin/python
LOG=../.trabajo/clima_diaria.log
if [ "$1" = "--estado" ]; then
  pgrep -f p5_clima_historico.py >/dev/null && echo "descarga en curso" || echo "sin descarga en curso"
  tail -n 6 "$LOG" 2>/dev/null
  exit 0
fi
if pgrep -f p5_clima_historico.py >/dev/null; then echo "ya hay una descarga en curso; no se inicia otra"; exit 0; fi
if [ "$1" = "--iniciar" ]; then nohup "$0" >/dev/null 2>&1 & echo "descarga iniciada en segundo plano"; exit 0; fi
{
  echo "== $(date '+%F %T') inicio"
  "$PY" -u p5_clima_historico.py --presupuesto "${PRESUPUESTO:-8000}"
  echo "  código de salida: $?"
  "$PY" e6_riesgo.py
  echo "== $(date '+%F %T') fin"
} >> "$LOG" 2>&1
