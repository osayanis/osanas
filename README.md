# OsaNAS

Une interface 2026 pour un vieux **D-Link DNS-320**, dans le style de la suite OSA.

Le NAS tourne sous [Alt-F](https://sourceforge.net/projects/alt-f/) (Linux 4.4), qui remplace le firmware D-Link. OsaNAS est un seul binaire Go (ARMv5, statique, ~6 Mo) qui contient l'interface et l'API.

- **Accueil** : état du NAS en direct (stockage, température, ventilateur, processeur, mémoire, réseau, santé SMART des disques), avec la mascotte qui change d'humeur.
- **Fichiers** : parcourir, envoyer (glisser-déposer de dossiers entiers, sans limite de taille), télécharger, prévisualiser (images, vidéos avec avance rapide, PDF, texte), renommer, déplacer, supprimer.
- **Système** : infos de l'appareil, adresses SMB à copier, mot de passe, redémarrage et extinction.

Le volume est aussi partagé en SMB invité (`smb://<ip>/Volume_1`).

## Installer

```sh
./deploy.sh 192.168.1.171   # compile pour ARMv5 et pousse sur le NAS (SSH root)
```

Puis, une fois sur le NAS :

```sh
echo "USER_SCRIPT=/mnt/sda2/.osanas.sh" >> /etc/misc.conf
loadsave_settings -sf
```

Alt-F lance `/mnt/sda2/.osanas.sh` au démarrage ou dès que le disque est monté. L'interface est sur `http://<ip>:8080` (mot de passe par défaut : `admin`, à changer dans Système).

## Accès à distance

Le NAS ouvre lui-même un tunnel SSH inverse vers un serveur public : aucun port à ouvrir sur la box. Sur le serveur, Nginx sert le tunnel en HTTPS (ici `https://nas.osalabs.fr`).

Sur le NAS, dans `/mnt/sda2/.osanas/` :

```sh
dropbearkey -t ecdsa -s 256 -f tunnel_key         # clé du tunnel (dropbear 2017 : pas d'ed25519)
printf 'TUNNEL_DEST=nastunnel@<serveur>\nTUNNEL_PORT=3080\n' > tunnel.conf
ssh-keyscan -t ecdsa,rsa <serveur> > known_hosts   # empreintes vérifiées à l'avance
```

Sur le serveur, la clé n'a droit qu'à ouvrir ce port :

```
restrict,port-forwarding,permitlisten="127.0.0.1:3080",command="/usr/sbin/nologin" ecdsa-sha2-nistp256 AAAA…
```

Puis un `server` Nginx qui fait `proxy_pass http://127.0.0.1:3080` avec `client_max_body_size 0`, `proxy_request_buffering off` et `X-Forwarded-Proto` (le cookie de session devient alors `Secure`). Le SMB, lui, reste réservé au réseau local.

## Structure

```
server/        serveur Go (API + interface embarquée)
  www/         interface (HTML/CSS/JS sans dépendance)
nas/start.sh   script de démarrage Alt-F, avec relance automatique
deploy.sh      compilation croisée + installation
```
