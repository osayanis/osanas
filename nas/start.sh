#!/bin/sh
# OsaNAS — script utilisateur Alt-F.
# Installé en /mnt/sda2/.osanas.sh : Alt-F l'appelle via USER_SCRIPT (/etc/misc.conf),
# soit au démarrage (S99user), soit dès que le disque est monté (hot_aux.sh) si le
# montage arrive plus tard (vérification fsck). Il doit être à la racine du volume.
# Un petit superviseur relance le serveur s'il s'arrête.

export PATH=/usr/sbin:/usr/bin:/sbin:/bin
VOL=/mnt/sda2
DIR=$VOL/.osanas
BIN=$DIR/osanas
PIDF=/var/run/osanas.pid
LOG=/var/log/osanas.log

supervise() {
	while true; do
		# le journal ne doit pas grossir sans fin (il vit en RAM)
		if [ -f $LOG ] && [ $(wc -c < $LOG) -gt 262144 ]; then
			tail -c 65536 $LOG > $LOG.1 && mv $LOG.1 $LOG
		fi
		$BIN -root $VOL -addr :8080 >> $LOG 2>&1
		echo "$(date) osanas s'est arrêté (code $?), relance dans 3 s" >> $LOG
		sleep 3
	done
}

case "$1" in
	start)
		# attend que le volume soit monté (3 min max)
		i=0
		while ! mountpoint -q $VOL || [ ! -x $BIN ]; do
			i=$((i + 1)); [ $i -gt 90 ] && { echo "$(date) volume absent" >> $LOG; exit 1; }
			sleep 2
		done
		[ -f $PIDF ] && kill -0 $(cat $PIDF) 2>/dev/null && exit 0
		supervise &
		echo $! > $PIDF
		;;
	stop)
		[ -f $PIDF ] && kill $(cat $PIDF) 2>/dev/null
		rm -f $PIDF
		killall osanas 2>/dev/null
		;;
	restart)
		$0 stop; sleep 1; $0 start
		;;
	status)
		pidof osanas > /dev/null && echo "osanas tourne" || { echo "osanas arrêté"; exit 1; }
		;;
	*)
		echo "usage: $0 start|stop|restart|status"; exit 1
		;;
esac
