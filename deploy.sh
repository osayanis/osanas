#!/bin/sh
# Compile OsaNAS pour le DNS-320 (ARMv5) et l'installe sur le NAS sous Alt-F.
# Usage : ./deploy.sh [ip]   — SSH root (mot de passe demandé, ou SSH_ASKPASS)
set -e
NAS=${1:-192.168.1.171}
cd "$(dirname "$0")"
mkdir -p build
(cd server && GOOS=linux GOARCH=arm GOARM=5 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o ../build/osanas .)
echo "binaire : $(du -h build/osanas | cut -f1)"

SSH="ssh -o PubkeyAuthentication=no root@$NAS"
DIR=/mnt/sda2/.osanas
$SSH "mkdir -p $DIR && cat > $DIR/osanas.new && chmod 755 $DIR/osanas.new" < build/osanas
# Alt-F ne lance le script utilisateur après montage que s'il est à la racine du volume
RUN=/mnt/sda2/.osanas.sh
$SSH "cat > $RUN && chmod 755 $RUN" < nas/start.sh
$SSH "chmod 700 $DIR && $RUN stop; mv -f $DIR/osanas.new $DIR/osanas && $RUN start; sleep 2; $RUN status"
echo "→ http://$NAS:8080"
