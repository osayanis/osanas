#!/bin/sh
# OsaNAS — démarrage (root). Prépare les dossiers, remet l'heure, lance le serveur web sur :8080.
B=/mnt/HD/HD_a2/.osanas
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/modules/sbin:/usr/local/modules/usrsbin
echo "OsaNAS start — uptime $(cut -d' ' -f1 /proc/uptime)s"

# Dossiers : temporaire d'envoi sur le disque (le / ne fait que 8 Mo), sessions hors du partage.
mkdir -p $B/tmp $B/log /tmp/osanas-sess
chown nobody $B/tmp $B/log /tmp/osanas-sess
chmod 700 /tmp/osanas-sess
rm -rf $B/tmp/* 2>/dev/null

# Heure : le DNS-320 n'a pas de pile, il redémarre en 2000. On essaie plusieurs outils.
( for i in 1 2 3 4 5 6; do
    if sntp -s pool.ntp.org >/dev/null 2>&1 || sntp -r pool.ntp.org >/dev/null 2>&1 || rdate -s time.nist.gov >/dev/null 2>&1; then
      echo "heure OK : $(date)"; break
    fi
    sleep 10
  done ) &

# Annonce Bonjour : « OsaNAS » apparaît sur le réseau (navigateurs, apps).
if [ -d /etc/avahi/services ]; then
  cat > /etc/avahi/services/osanas.service <<'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>OsaNAS</name>
  <service><type>_http._tcp</type><port>8080</port><txt-record>path=/</txt-record></service>
</service-group>
EOF
fi

# Serveur web : seconde instance du lighttpd du firmware, en utilisateur « nobody ».
start_web() {
  /usr/sbin/lighttpd -m /usr/local/lib -f $1
}
start_web $B/lighttpd.conf
sleep 3
if netstat -lnt 2>/dev/null | grep -q ':8080 '; then
  echo "web OK (nobody)"
else
  echo "web KO en nobody, repli en root"
  sed -e '/server.username/d' -e '/server.groupname/d' $B/lighttpd.conf > /tmp/osanas-lighttpd-root.conf
  start_web /tmp/osanas-lighttpd-root.conf
  sleep 3
  netstat -lnt 2>/dev/null | grep -q ':8080 ' && echo "web OK (root)" || echo "web KO"
fi
