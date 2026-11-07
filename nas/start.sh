#!/bin/sh
# OsaNAS — script utilisateur Alt-F.
# Installé en /mnt/sda2/.osanas.sh : Alt-F l'appelle via USER_SCRIPT (/etc/misc.conf),
# soit au démarrage (S99user), soit dès que le disque est monté (hot_aux.sh) si le
# montage arrive plus tard (vérification fsck). Il doit être à la racine du volume.
#
# Lance le serveur OsaNAS et, si .osanas/tunnel.conf existe, un tunnel SSH inverse
# vers un serveur public (accès à distance). Chacun est relancé s'il s'arrête.

export PATH=/usr/sbin:/usr/bin:/sbin:/bin
# au démarrage, Alt-F lance ce script sans HOME : dbclient ne trouverait pas known_hosts
export HOME=/root
VOL=/mnt/sda2
DIR=$VOL/.osanas
BIN=$DIR/osanas
LOG=/var/log/osanas.log
PIDF=/var/run/osanas.pid
TPIDF=/var/run/osanas-tunnel.pid
# tunnel.conf : TUNNEL_DEST=utilisateur@hôte  TUNNEL_PORT=port d'écoute sur l'hôte (127.0.0.1)
TCONF=$DIR/tunnel.conf

trim_log() {
	# le journal vit en RAM : on le garde petit
	if [ -f $LOG ] && [ $(wc -c < $LOG) -gt 262144 ]; then
		tail -c 65536 $LOG > $LOG.1 && mv $LOG.1 $LOG
	fi
}

supervise() {
	while true; do
		trim_log
		$BIN -root $VOL -addr :8080 >> $LOG 2>&1
		echo "$(date) osanas s'est arrêté (code $?), relance dans 3 s" >> $LOG
		sleep 3
	done
}

tunnel() {
	. $TCONF
	# empreintes du serveur vérifiées à l'avance (le HOME de root vit en RAM)
	mkdir -p /root/.ssh && chmod 700 /root/.ssh && cp $DIR/known_hosts /root/.ssh/known_hosts
	while true; do
		trim_log
		dbclient -N -T -K 20 -o ExitOnForwardFailure=yes -i $DIR/tunnel_key \
			-R 127.0.0.1:$TUNNEL_PORT:127.0.0.1:8080 $TUNNEL_DEST < /dev/null >> $LOG 2>&1
		echo "$(date) tunnel coupé (code $?), nouvel essai dans 20 s" >> $LOG
		sleep 20
	done
}

running() { [ -f $1 ] && kill -0 $(cat $1) 2>/dev/null; }

case "$1" in
	start)
		# attend que le volume soit monté (3 min max)
		i=0
		while ! mountpoint -q $VOL || [ ! -x $BIN ]; do
			i=$((i + 1)); [ $i -gt 90 ] && { echo "$(date) volume absent" >> $LOG; exit 1; }
			sleep 2
		done
		running $PIDF || { supervise & echo $! > $PIDF; }
		if [ -f $TCONF ] && [ -f $DIR/tunnel_key ] && [ -f $DIR/known_hosts ]; then
			running $TPIDF || { tunnel & echo $! > $TPIDF; }
		fi
		;;
	stop)
		for f in $PIDF $TPIDF; do [ -f $f ] && kill $(cat $f) 2>/dev/null; rm -f $f; done
		killall osanas dbclient 2>/dev/null
		;;
	restart)
		$0 stop; sleep 1; $0 start
		;;
	status)
		pidof osanas > /dev/null && echo "osanas tourne" || { echo "osanas arrêté"; exit 1; }
		[ -f $TCONF ] && { pidof dbclient > /dev/null && echo "tunnel ouvert" || echo "tunnel fermé"; }
		;;
	*)
		echo "usage: $0 start|stop|restart|status"; exit 1
		;;
esac
