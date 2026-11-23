#!/usr/bin/env bash
# =============================================================================
# Se ejecuta EN LA EC2 (lo invoca el job de despliegue por SSH).
# Uso: ./desplegar.sh <imagen:tag>
#   1. Prepara el servidor la primera vez (swap y plugin docker compose)
#   2. Descarga la nueva imagen de la app
#   3. Levanta/actualiza los servicios con docker compose
#   4. Verifica /api/health; si falla, regresa a la version anterior
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"
NUEVA="$1"

paso() { echo "==> $*"; }

# --- Memoria swap (la t3.micro solo tiene 1 GB de RAM) ---------------------
if ! sudo swapon --show | grep -q '/swapfile'; then
  paso "Creando 2 GB de memoria swap"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# --- Plugin docker compose ------------------------------------------------
if ! sudo docker compose version >/dev/null 2>&1; then
  paso "Instalando docker compose"
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-compose-v2 || sudo apt-get install -y -qq docker-compose-plugin || {
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }
fi
sudo docker compose version

# --- Contenedores de practicas anteriores que ocupaban el puerto 80 --------
sudo docker rm -f webapp-taskmanager webapp-container >/dev/null 2>&1 || true

ANTERIOR=$(grep '^APP_IMAGE=' .env.anterior 2>/dev/null | cut -d= -f2- || true)

paso "Descargando la nueva imagen $NUEVA"
sudo docker pull "$NUEVA"

paso "Levantando los servicios"
sudo docker compose pull --quiet otel-collector node-exporter openobserve
sudo docker compose up -d --remove-orphans

paso "Verificando /api/health"
for i in $(seq 1 30); do
  if curl -fsS http://localhost/api/health > /tmp/health.json 2>/dev/null; then
    echo "API arriba:"; cat /tmp/health.json; echo
    cp .env .env.anterior
    sudo docker image prune -f >/dev/null
    sudo docker compose ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: la nueva version no respondio."
sudo docker compose logs --tail 60 app || true
if [ -n "$ANTERIOR" ]; then
  echo "Restaurando la version anterior: $ANTERIOR"
  sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$ANTERIOR|" .env
  sudo docker compose up -d app
fi
exit 1
