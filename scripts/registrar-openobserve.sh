#!/usr/bin/env bash
# =============================================================================
# Envia a OpenObserve (API HTTP/JSON) el resultado de la ejecucion del pipeline.
# Lo ejecuta el ultimo job del workflow (siempre, aunque algo haya fallado).
#
# Stream: cicd_pipeline   (un registro por job + uno de resumen del pipeline)
# Variables requeridas: O2_URL, O2_USER, O2_PASSWORD y las R_* con el resultado
# de cada job (success, failure, cancelled o skipped).
# =============================================================================
set -uo pipefail

if [ -z "${O2_URL:-}" ] || [ -z "${O2_USER:-}" ] || [ -z "${O2_PASSWORD:-}" ]; then
  echo "::warning::OpenObserve no configurado (faltan secrets); no se registra la ejecucion"
  exit 0
fi

AHORA=$(date -u +%s%6N)   # microsegundos desde 1970 (formato de _timestamp en OpenObserve)
RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
COMMIT_MSG=$(echo "${COMMIT_MSG:-}" | head -1 | cut -c1-200)

# Estado global: si alguna prueba fallo es un incidente y el despliegue quedo bloqueado
if [ "$R_JEST" = "success" ] && [ "$R_E2E" = "success" ] && [ "$R_DEPLOY" = "success" ]; then
  ESTADO=exito; INCIDENTE=false; MENSAJE="Pruebas aprobadas y despliegue completado en EC2"
elif [ "$R_JEST" = "failure" ] || [ "$R_E2E" = "failure" ]; then
  ESTADO=fallo; INCIDENTE=true; MENSAJE="Fallaron las pruebas (Jest: $R_JEST, Playwright: $R_E2E); despliegue SSH a EC2 bloqueado"
elif [ "$R_EVENTO" = "pull_request" ]; then
  ESTADO=exito; INCIDENTE=false; MENSAJE="Pull request: solo se ejecutan las pruebas"
else
  ESTADO=fallo; INCIDENTE=true; MENSAJE="Fallo en build ($R_BUILD) o despliegue ($R_DEPLOY)"
fi

DESPLEGADO=false; [ "$R_DEPLOY" = "success" ] && DESPLEGADO=true

registro() { # $1 tipo  $2 job  $3 resultado  $4 detalle(JSON extra)
  local extra="${4:-}"; [ -z "$extra" ] && extra='{}'
  jq -n --argjson ts "$AHORA" --arg tipo "$1" --arg job "$2" --arg resultado "$3" \
    --arg commit "$GITHUB_SHA" --arg commit_corto "${GITHUB_SHA:0:7}" --arg rama "$GITHUB_REF_NAME" \
    --arg usuario "$GITHUB_ACTOR" --arg evento "$R_EVENTO" --arg repo "$GITHUB_REPOSITORY" \
    --arg run_id "$GITHUB_RUN_ID" --arg run_numero "$GITHUB_RUN_NUMBER" --arg run_url "$RUN_URL" \
    --arg mensaje_commit "$COMMIT_MSG" --argjson extra "$extra" \
    '{_timestamp: $ts, tipo: $tipo, job: $job, resultado: $resultado, exito: ($resultado == "success" or $resultado == "exito"),
      commit: $commit, commit_corto: $commit_corto, rama: $rama, usuario: $usuario, evento: $evento,
      repositorio: $repo, run_id: $run_id, run_numero: $run_numero, run_url: $run_url,
      mensaje_commit: $mensaje_commit} + $extra'
}

{
  registro job pruebas_jest "$R_JEST" "{\"pruebas_total\": ${JEST_TOTAL:-0}, \"pruebas_fallidas\": ${JEST_FALLIDAS:-0}, \"cobertura_lineas\": ${JEST_COBERTURA:-0}}"
  registro job pruebas_playwright "$R_E2E" "{\"pruebas_total\": ${E2E_TOTAL:-0}, \"pruebas_fallidas\": ${E2E_FALLIDAS:-0}}"
  registro job build_push "$R_BUILD"
  registro job despliegue_ec2 "$R_DEPLOY"
  registro pipeline resumen "$ESTADO" "{\"incidente\": $INCIDENTE, \"desplegado\": $DESPLEGADO, \"mensaje\": $(jq -Rn --arg m "$MENSAJE" '$m')}"
  if [ "$DESPLEGADO" = true ]; then
    registro despliegue evento_despliegue success "{\"imagen\": \"${IMAGEN:-}\", \"servidor\": \"EC2\", \"mensaje\": \"Contenedores actualizados en AWS EC2\"}"
  fi
} | jq -s '.' > registros.json

echo "Registros enviados a OpenObserve:"; jq -c '.[] | {tipo, job, resultado}' registros.json

for intento in 1 2 3; do
  if curl -fsS -u "$O2_USER:$O2_PASSWORD" -H 'Content-Type: application/json' \
       --data @registros.json "$O2_URL/api/default/cicd_pipeline/_json"; then
    echo; echo "OK: ejecucion registrada en el stream cicd_pipeline"
    {
      echo "## Registro en OpenObserve"
      echo ""
      echo "Estado: **$ESTADO** · Incidente: **$INCIDENTE** · Desplegado: **$DESPLEGADO**"
      echo ""
      echo "$MENSAJE"
    } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    exit 0
  fi
  sleep 5
done
echo "::warning::No se pudo registrar la ejecucion en OpenObserve"
exit 0
