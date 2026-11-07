#!/bin/bash
# Déploie OsaNAS sur le DNS-320 par le partage Volume_1 (SMB invité).
# Le web (www/) est pris en compte tout de suite ; start.sh / lighttpd.conf / fun_plug au prochain redémarrage.
set -euo pipefail
NAS=${NAS:-192.168.1.171}
HERE=$(cd "$(dirname "$0")" && pwd)
MNT=$(mktemp -d /tmp/osanas-mnt.XXXX)
cleanup() { diskutil unmount "$MNT" >/dev/null 2>&1 || umount "$MNT" 2>/dev/null || true; rmdir "$MNT" 2>/dev/null || true; }
trap cleanup EXIT

mount_smbfs -N "//guest@$NAS/Volume_1" "$MNT"
mkdir -p "$MNT/.osanas"
COPYFILE_DISABLE=1 rsync -rt --delete --exclude 'tmp/' --exclude 'log/' --exclude 'conf/' --exclude '.DS_Store' \
  "$HERE/nas/osanas/" "$MNT/.osanas/"
cp "$HERE/nas/fun_plug" "$MNT/fun_plug"
chmod 755 "$MNT/fun_plug" "$MNT/.osanas/start.sh"
find "$MNT/.osanas" "$MNT" -maxdepth 3 -name '._*' -delete 2>/dev/null || true
echo "OsaNAS déployé sur $NAS → http://$NAS:8080"
