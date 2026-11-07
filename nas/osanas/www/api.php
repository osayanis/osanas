<?php
/*
 * OsaNAS — API (PHP 5.2.17 du firmware DNS-320 : pas de closures, pas de [], pas de ?:).
 * Une seule porte d'entrée : api.php?a=<action>. Réponses JSON, sauf téléchargement/aperçu.
 * Connexion : on vérifie l'identifiant auprès du CGI de login D-Link (127.0.0.1:80),
 * donc les comptes sont ceux du NAS. Les actions qui modifient exigent l'en-tête X-Osa
 * (un formulaire d'un autre site ne peut pas l'envoyer : protection CSRF).
 */

define('ROOT', '/mnt/HD/HD_a2');
define('VERSION', '1.0.0');
error_reporting(E_ALL & ~E_NOTICE);
if (!is_dir('/tmp/osanas-sess')) @mkdir('/tmp/osanas-sess', 0700);
@ini_set('session.save_path', '/tmp/osanas-sess');
@ini_set('session.cookie_httponly', 1);
@ini_set('session.gc_maxlifetime', 60 * 60 * 24 * 14);
session_name('osanas');
// Durée en Max-Age (relative) : l'horloge du NAS peut être en 2000 si l'heure n'a pas pu être remise.
session_set_cookie_params(0, '/');
session_start();
function keep_cookie() {
    header('Set-Cookie: ' . session_name() . '=' . session_id() . '; Max-Age=' . (60 * 60 * 24 * 14) . '; Path=/; HttpOnly; SameSite=Lax', false);
}

$a = isset($_GET['a']) ? $_GET['a'] : '';

/* ---------- utilitaires ---------- */

function out($data, $code = 200) {
    if ($code != 200) header('HTTP/1.1 ' . $code . ' ' . ($code == 401 ? 'Unauthorized' : ($code == 404 ? 'Not Found' : 'Error')));
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}
function fail($msg, $code = 400) { out(array('error' => $msg), $code); }

function need_auth() {
    if (empty($_SESSION['user'])) fail('Connexion requise', 401);
}
function need_write() {
    need_auth();
    if ($_SERVER['REQUEST_METHOD'] != 'POST' || empty($_SERVER['HTTP_X_OSA'])) fail('Requête refusée', 403);
}
function need_admin() {
    if ($_SESSION['user'] != 'admin') fail('Réservé au compte admin', 403);
}
function body() {
    static $b = null;
    if ($b === null) {
        $b = json_decode(file_get_contents('php://input'), true);
        if (!is_array($b)) $b = array();
    }
    return $b;
}
function arg($k, $def = '') {
    $b = body();
    if (isset($b[$k])) return $b[$k];
    if (isset($_POST[$k])) return $_POST[$k];
    if (isset($_GET[$k])) return $_GET[$k];
    return $def;
}

/* Appel d'un CGI D-Link en local. */
function dlink($cgi, $fields, $cookie = 'username=admin', &$headers = null) {
    $ch = curl_init('http://127.0.0.1/cgi-bin/' . $cgi);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $fields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HEADER, 1);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 0);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_REFERER, 'http://127.0.0.1/web/management.html'); // exigé par cgi_restart
    if ($cookie) curl_setopt($ch, CURLOPT_COOKIE, $cookie);
    $res = curl_exec($ch);
    $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    if ($res === false) return '';
    $headers = substr($res, 0, $hsize);
    return substr($res, $hsize);
}
function xml_val($xml, $tag) {
    if (preg_match('#<' . $tag . '>([^<]*)</' . $tag . '>#', $xml, $m)) return trim($m[1]);
    return '';
}

/* Chemin relatif sûr → chemin absolu sous ROOT (ou échec). */
function safe_rel($rel) {
    $rel = str_replace('\\', '/', (string)$rel);
    $parts = array();
    foreach (explode('/', $rel) as $p) {
        if ($p === '' || $p === '.') continue;
        if ($p === '..') fail('Chemin interdit', 403);
        $parts[] = $p;
    }
    return implode('/', $parts);
}
function abs_path($rel) {
    $rel = safe_rel($rel);
    if ($rel !== '' && is_hidden_rel($rel)) fail('Introuvable', 404);
    return $rel === '' ? ROOT : ROOT . '/' . $rel;
}
function is_hidden_name($name, $atRoot) {
    if ($name === '' || $name[0] === '.') return true;
    if ($atRoot) {
        $sys = array('Nas_Prog', 'Ajaxpf', 'lost+found', 'fun_plug', 'Configuration');
        if (in_array($name, $sys)) return true;
        if (strpos($name, 'osanas-') === 0) return true;
    }
    return false;
}
function is_hidden_rel($rel) {
    $parts = explode('/', $rel);
    foreach ($parts as $i => $p) if (is_hidden_name($p, $i == 0)) return true;
    return false;
}
function valid_name($n) {
    $n = trim((string)$n);
    if ($n === '' || $n === '.' || $n === '..' || strpos($n, '/') !== false || strpos($n, "\0") !== false) fail('Nom invalide');
    if ($n[0] === '.') fail('Les noms commençant par un point sont réservés');
    if (strlen($n) > 240) fail('Nom trop long');
    return $n;
}
function rrmdir($p) {
    if (is_link($p) || !is_dir($p)) return @unlink($p);
    $dh = opendir($p);
    if (!$dh) return false;
    while (($e = readdir($dh)) !== false) {
        if ($e == '.' || $e == '..') continue;
        if (!rrmdir($p . '/' . $e)) { closedir($dh); return false; }
    }
    closedir($dh);
    return @rmdir($p);
}
/* PHP 32 bits : filesize() déborde (ou échoue) au-delà de 2 Go. On demande alors à ls (busybox, 64 bits). */
function ls_size($p) {
    $o = @exec('ls -ln ' . escapeshellarg($p) . ' 2>/dev/null');
    $f = preg_split('/\s+/', trim((string)$o));
    if (count($f) >= 5 && is_numeric($f[4])) return (float)$f[4];
    return null;
}
function fsize($p) {
    $s = @filesize($p);
    if ($s === false || $s < 0 || $s >= 2147483647) {
        $l = ls_size($p);
        return $l === null ? 0 : $l;
    }
    return (float)$s;
}
function is_regular($p) {
    if (is_file($p)) return true;
    return !is_dir($p) && ls_size($p) !== null; /* gros fichier que stat() 32 bits ne sait pas lire */
}

/* ---------- mot de passe OsaNAS ----------
 * Un seul compte. Tant qu'aucun mot de passe n'est choisi, c'est « admin » (comme le NAS),
 * et l'interface invite à le changer. Hash : sha256 itéré et salé (PHP 5.2 n'a ni bcrypt ni password_hash).
 */
define('CONF', '/mnt/HD/HD_a2/.osanas/conf');
define('PW_ITER', 4000);
function pw_hash($p, $salt, $iter) {
    $h = $salt;
    for ($i = 0; $i < $iter; $i++) $h = hash('sha256', $h . $p, true);
    return bin2hex($h);
}
function auth_conf() {
    $j = @file_get_contents(CONF . '/auth.json');
    $d = $j ? json_decode($j, true) : null;
    return (is_array($d) && !empty($d['hash'])) ? $d : null;
}
function same($a, $b) { /* comparaison à temps constant */
    if (strlen($a) != strlen($b)) return false;
    $r = 0;
    for ($i = 0; $i < strlen($a); $i++) $r |= ord($a[$i]) ^ ord($b[$i]);
    return $r === 0;
}
function pw_check($p) {
    $c = auth_conf();
    if (!$c) return same($p, 'admin');
    return same(pw_hash($p, $c['salt'], (int)$c['iter']), $c['hash']);
}

/* ---------- système ---------- */

function cpu_sample() {
    $l = @file('/proc/stat');
    $f = preg_split('/\s+/', trim($l[0]));
    $idle = $f[4] + (isset($f[5]) ? $f[5] : 0);
    $total = 0;
    for ($i = 1; $i < count($f); $i++) $total += $f[$i];
    return array($idle, $total);
}
function meminfo() {
    $m = array();
    foreach (@file('/proc/meminfo') as $line) {
        if (preg_match('/^(\w+):\s+(\d+)/', $line, $x)) $m[$x[1]] = (int)$x[2] * 1024;
    }
    $avail = $m['MemFree'] + (isset($m['Buffers']) ? $m['Buffers'] : 0) + (isset($m['Cached']) ? $m['Cached'] : 0);
    return array('total' => $m['MemTotal'], 'used' => $m['MemTotal'] - $avail);
}
function netbytes() {
    foreach (@file('/proc/net/dev') as $line) {
        if (preg_match('/^\s*egiga0:\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/', $line, $x)) {
            return array((float)$x[1], (float)$x[2]);
        }
    }
    return array(0, 0);
}
function disks() {
    $xml = dlink('dsk_mgr.cgi', 'cmd=SMART_List');
    $list = array();
    if (preg_match_all('#<row id="\d+">(.*?)</row>#s', $xml, $rows)) {
        foreach ($rows[1] as $r) {
            preg_match_all('#<cell>(.*?)</cell>#s', $r, $c);
            $cells = $c[1];
            $v = html_entity_decode($cells[0]);
            $dev = '';
            if (preg_match('/value="\d+,(\w+),/', $v, $mm)) $dev = $mm[1];
            $list[] = array(
                'bay' => trim($cells[1]) == 'L' ? 'gauche' : 'droite',
                'vendor' => trim($cells[2]),
                'model' => trim($cells[3]),
                'dev' => $dev,
                'size' => $dev ? (float)(trim(@file_get_contents('/sys/block/' . $dev . '/size'))) * 512 : 0,
            );
        }
    }
    return $list;
}

function system_status() {
    $st = dlink('status_mgr.cgi', 'cmd=cgi_get_status');
    $temp = xml_val($st, 'temperature');
    $tc = null;
    if (preg_match('/^(\d+):(\d+)$/', $temp, $t)) $tc = (int)$t[2];

    $up = explode(' ', trim(@file_get_contents('/proc/uptime')));
    $load = explode(' ', trim(@file_get_contents('/proc/loadavg')));

    // CPU : écart avec l'échantillon précédent de cette session
    $now = cpu_sample();
    $cpu = null;
    if (isset($_SESSION['cpu'])) {
        $di = $now[0] - $_SESSION['cpu'][0];
        $dt = $now[1] - $_SESSION['cpu'][1];
        if ($dt > 0) $cpu = round(100 * (1 - $di / $dt));
    }
    $_SESSION['cpu'] = $now;

    // Réseau : débit depuis l'appel précédent
    $nb = netbytes();
    $t = microtime(true);
    $rx = null; $tx = null;
    if (isset($_SESSION['net'])) {
        $dt = $t - $_SESSION['net'][2];
        if ($dt > 0.2) {
            $rx = max(0, ($nb[0] - $_SESSION['net'][0]) / $dt);
            $tx = max(0, ($nb[1] - $_SESSION['net'][1]) / $dt);
        }
    }
    $_SESSION['net'] = array($nb[0], $nb[1], $t);

    $total = (float)@disk_total_space(ROOT);
    $free = (float)@disk_free_space(ROOT);
    $mounted = false;
    foreach (@file('/proc/mounts') as $m) if (strpos($m, ' ' . ROOT . ' ') !== false) $mounted = true;

    $info = @file_get_contents('http://127.0.0.1/xml/info.xml');

    return array(
        'name' => xml_val($st, 'name'),
        'model' => xml_val($info, 'hw_ver') ? xml_val($info, 'hw_ver') : 'DNS-320',
        'firmware' => xml_val($info, 'version'),
        'ip' => xml_val($st, 'ip'),
        'mac' => xml_val($st, 'mac'),
        'gateway' => xml_val($st, 'gateway'),
        'dhcp' => xml_val($st, 'dhcp_enable') == '1',
        'workgroup' => xml_val($st, 'workgroup'),
        'temp' => $tc,
        'uptime' => (int)$up[0],
        'load' => (float)$load[0],
        'cpu' => $cpu,
        'mem' => meminfo(),
        'net' => array('rx' => $rx, 'tx' => $tx),
        'volume' => array('name' => 'Volume_1', 'mounted' => $mounted && $total > 0, 'total' => $total, 'free' => $free),
        'kernel' => trim(@exec('uname -r')),
        'time' => time(),
        'version' => VERSION,
    );
}

/* ---------- routes ---------- */

switch ($a) {

case 'me':
    if (empty($_SESSION['user'])) out(array('user' => null));
    out(array('user' => $_SESSION['user'], 'admin' => true, 'defaultPassword' => !auth_conf()));

case 'login':
    if ($_SERVER['REQUEST_METHOD'] != 'POST' || empty($_SERVER['HTTP_X_OSA'])) fail('Requête refusée', 403);
    $p = (string)arg('pass');
    // frein aux essais en rafale (par session et global)
    if (!isset($_SESSION['tries'])) $_SESSION['tries'] = 0;
    if ($_SESSION['tries'] > 3) sleep(min(8, $_SESSION['tries']));
    if (!pw_check($p)) { $_SESSION['tries']++; sleep(1); fail('Mot de passe incorrect', 401); }
    session_regenerate_id(true);
    $_SESSION['tries'] = 0;
    $_SESSION['user'] = 'admin';
    keep_cookie();
    out(array('user' => 'admin', 'admin' => true, 'defaultPassword' => !auth_conf()));

case 'password':
    need_write();
    if (!pw_check((string)arg('current'))) fail('Mot de passe actuel incorrect', 401);
    $n = (string)arg('next');
    if (strlen($n) < 6) fail('6 caractères minimum');
    $salt = bin2hex(pack('N4', mt_rand(), mt_rand(), mt_rand(), mt_rand()) . uniqid('', true));
    $data = array('salt' => $salt, 'iter' => PW_ITER, 'hash' => pw_hash($n, $salt, PW_ITER));
    if (!is_dir(CONF)) { @mkdir(CONF, 0700); }
    $tmp = CONF . '/auth.json.tmp';
    if (@file_put_contents($tmp, json_encode($data)) === false || !@rename($tmp, CONF . '/auth.json')) fail('Écriture impossible', 500);
    @chmod(CONF . '/auth.json', 0600);
    out(array('ok' => true));

case 'logout':
    $_SESSION = array();
    session_destroy();
    out(array('ok' => true));

case 'status':
    need_auth();
    out(system_status());

case 'disks':
    need_auth();
    out(array('disks' => disks()));

case 'ls':
    need_auth();
    $rel = safe_rel(arg('path'));
    $dir = abs_path($rel);
    if (!is_dir($dir)) fail('Dossier introuvable', 404);
    $items = array();
    $dh = opendir($dir);
    while (($e = readdir($dh)) !== false) {
        if ($e == '.' || $e == '..' || is_hidden_name($e, $rel === '')) continue;
        $p = $dir . '/' . $e;
        $isDir = is_dir($p);
        $items[] = array(
            'name' => $e,
            'dir' => $isDir,
            'size' => $isDir ? null : fsize($p),
            'mtime' => @filemtime($p),
        );
    }
    closedir($dh);
    out(array('path' => $rel, 'items' => $items));

case 'mkdir':
    need_write();
    $dir = abs_path(arg('path'));
    $name = valid_name(arg('name'));
    if (file_exists($dir . '/' . $name)) fail('Ce nom existe déjà');
    if (!@mkdir($dir . '/' . $name, 0777)) fail('Impossible de créer le dossier', 500);
    @chmod($dir . '/' . $name, 0777);
    out(array('ok' => true));

case 'rename':
    need_write();
    $rel = safe_rel(arg('path'));
    if ($rel === '') fail('Chemin invalide');
    $src = abs_path($rel);
    $name = valid_name(arg('name'));
    $dst = dirname($src) . '/' . $name;
    if (!file_exists($src)) fail('Introuvable', 404);
    if (file_exists($dst)) fail('Ce nom existe déjà');
    if (!@rename($src, $dst)) fail('Impossible de renommer', 500);
    out(array('ok' => true));

case 'move':
    need_write();
    $to = abs_path(arg('to'));
    if (!is_dir($to)) fail('Destination introuvable', 404);
    $paths = arg('paths', array());
    if (!is_array($paths)) fail('Liste invalide');
    foreach ($paths as $r) {
        $r = safe_rel($r);
        if ($r === '') continue;
        $src = abs_path($r);
        $dst = $to . '/' . basename($src);
        if (strpos($to . '/', $src . '/') === 0) fail('Impossible de déplacer un dossier dans lui-même');
        if (file_exists($dst)) fail('« ' . basename($src) . ' » existe déjà à destination');
        if (!@rename($src, $dst)) fail('Impossible de déplacer « ' . basename($src) . ' »', 500);
    }
    out(array('ok' => true));

case 'delete':
    need_write();
    $paths = arg('paths', array());
    if (!is_array($paths)) fail('Liste invalide');
    foreach ($paths as $r) {
        $r = safe_rel($r);
        if ($r === '') fail('Impossible de supprimer la racine');
        $p = abs_path($r);
        if (!file_exists($p) && !is_link($p)) continue;
        if (!rrmdir($p)) fail('Impossible de supprimer « ' . basename($p) . ' »', 500);
    }
    out(array('ok' => true));

case 'upload':
    need_write();
    $dir = abs_path(arg('path'));
    if (!is_dir($dir)) fail('Dossier introuvable', 404);
    if (empty($_FILES['file'])) fail('Aucun fichier reçu (trop gros ?)');
    $f = $_FILES['file'];
    if ($f['error'] != UPLOAD_ERR_OK) fail('Envoi interrompu (code ' . $f['error'] . ')', 500);
    $name = valid_name(arg('name') !== '' ? arg('name') : $f['name']);
    // sous-dossiers d'un dossier glissé : « relpath » = a/b/fichier
    $sub = safe_rel(arg('relpath'));
    if ($sub !== '' && strpos($sub, '/') !== false) {
        $d = $dir;
        $segs = explode('/', dirname($sub));
        foreach ($segs as $s) {
            valid_name($s);
            $d .= '/' . $s;
            if (!is_dir($d)) { @mkdir($d, 0777); @chmod($d, 0777); }
        }
        $dir = $d;
    }
    $dst = $dir . '/' . $name;
    if (file_exists($dst) && arg('overwrite') != '1') {
        $i = 2;
        $base = $name; $ext = '';
        if (preg_match('/^(.*)(\.[^.]+)$/', $name, $m) && $m[1] !== '') { $base = $m[1]; $ext = $m[2]; }
        while (file_exists($dir . '/' . $base . ' ' . $i . $ext)) $i++;
        $dst = $dir . '/' . $base . ' ' . $i . $ext;
    }
    if (!@move_uploaded_file($f['tmp_name'], $dst)) fail('Écriture impossible sur le disque', 500);
    @chmod($dst, 0666);
    out(array('ok' => true, 'name' => basename($dst)));

case 'get':
    // téléchargement ou aperçu : lighttpd envoie le fichier lui-même (X-Sendfile)
    need_auth();
    $rel = safe_rel(arg('path'));
    $p = abs_path($rel);
    if (!is_regular($p)) { header('HTTP/1.1 404 Not Found'); exit; }
    $name = basename($p);
    $inline = arg('inline') == '1';
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $types = array(
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp',
        'heic' => 'image/heic', 'svg' => 'image/svg+xml', 'bmp' => 'image/bmp',
        'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm', 'mkv' => 'video/x-matroska',
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac', 'wav' => 'audio/wav', 'flac' => 'audio/flac', 'ogg' => 'audio/ogg',
        'pdf' => 'application/pdf', 'txt' => 'text/plain; charset=utf-8', 'md' => 'text/plain; charset=utf-8', 'log' => 'text/plain; charset=utf-8',
        'json' => 'text/plain; charset=utf-8', 'csv' => 'text/plain; charset=utf-8',
    );
    $type = isset($types[$ext]) ? $types[$ext] : 'application/octet-stream';
    if ($inline && $ext == 'svg') $type = 'text/plain; charset=utf-8'; // pas de SVG actif dans l'origine de l'app
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    $enc = rawurlencode($name);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename=\"" . str_replace('"', '', $name) . "\"; filename*=UTF-8''" . $enc);
    header('X-LIGHTTPD-send-file: ' . $p);
    exit;

case 'power':
    need_write();
    need_admin();
    $what = arg('what');
    if ($what != 'restart' && $what != 'shutdown') fail('Action inconnue');
    dlink('system_mgr.cgi', 'cmd=cgi_' . $what);
    out(array('ok' => true));

default:
    fail('Action inconnue', 404);
}
