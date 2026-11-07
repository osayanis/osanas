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

## Structure

```
server/        serveur Go (API + interface embarquée)
  www/         interface (HTML/CSS/JS sans dépendance)
nas/start.sh   script de démarrage Alt-F, avec relance automatique
deploy.sh      compilation croisée + installation
```
