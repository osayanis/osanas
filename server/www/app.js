/* OsaNAS — interface (vanilla JS, aucun framework : servie par le DNS-320 lui-même). */
(function () {
  "use strict";

  /* ================= outils ================= */
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var fr = function (n, d) { return Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0 }); };

  function bytes(n) {
    if (n == null || isNaN(n)) return "—";
    var u = ["o", "Ko", "Mo", "Go", "To"], i = 0;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return fr(n, n < 10 && i > 0 ? 1 : 0) + " " + u[i];
  }
  function rate(n) { return n == null ? "—" : bytes(n) + "/s"; }
  function uptime(s) {
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return d + " j " + h + " h";
    if (h) return h + " h " + (m < 10 ? "0" : "") + m;
    return Math.max(1, m) + " min";
  }
  function when(ts) {
    if (!ts || ts < 1000000000) return "—"; // NAS pas encore à l'heure (2000)
    var d = new Date(ts * 1000), now = new Date();
    var hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return "Aujourd’hui, " + hm;
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Hier, " + hm;
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + ", " + hm;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }
  var plural = function (n, one, many) { return fr(n) + " " + (n > 1 ? many : one); };

  /* ================= icônes (24 × 24, trait 2, bouts ronds) ================= */
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    folderPlus: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M12 10.5v6M9 13.5h6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
    video: '<rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    chevronL: '<path d="m15 6-6 6 6 6"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
    restart: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
    disk: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="11" r="3.5"/><path d="M12 11h.01M7 17h.01"/>',
    temp: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 11v6"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    memory: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11v2M11 11v2M15 11v2M6 17v2M18 17v2"/>',
    network: '<path d="M7 17V5M3.5 8.5 7 5l3.5 3.5M17 7v12M13.5 15.5 17 19l3.5-3.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    finder: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4c-1.5 3-2 6-1.5 9H13c.3 2.5 0 5-1 7"/><path d="M7 9v1.5M17 9v1.5M8 15.5c2.5 1.6 5.5 1.6 8 0"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    sort: '<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>',
    up: '<path d="m7 14 5-5 5 5"/>',
    down: '<path d="m7 10 5 5 5-5"/>'
  };
  function icon(n, cls) { return '<svg class="i ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || P.file) + "</svg>"; }
  var MARK = '<svg class="mark" viewBox="0 0 36 38" aria-hidden="true"><rect width="36" height="10" rx="3" fill="#fff" fill-opacity=".95"/><rect y="14" width="36" height="10" rx="3" fill="#fff" fill-opacity=".42"/><rect y="28" width="36" height="10" rx="3" fill="#fff" fill-opacity=".95"/><circle cx="29" cy="5" r="2" fill="#0a0a0f"/><circle cx="29" cy="19" r="2" fill="#0a0a0f"/><circle cx="29" cy="33" r="2" fill="#0a0a0f"/></svg>';
  var WORDMARK = '<span class="wordmark">' + MARK + '<span><span class="osa">Osa</span><span class="prod">NAS</span></span></span>';

  /* ================= API ================= */
  function api(action, opts) {
    opts = opts || {};
    var q = "";
    if (opts.query) for (var k in opts.query) q += "&" + k + "=" + encodeURIComponent(opts.query[k]);
    var init = { credentials: "same-origin", headers: { "X-Osa": "1" } };
    if (opts.body) { init.method = "POST"; init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch("api?a=" + action + q, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && action !== "login" && action !== "password") { S.user = null; render(); }
        if (!r.ok) { var e = new Error(j.error || "Erreur " + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function fileURL(path, inline) { return "api?a=get&path=" + encodeURIComponent(path) + (inline ? "&inline=1" : ""); }

  /* ================= état ================= */
  var S = {
    user: undefined, defaultPassword: false,
    status: null, disks: null,
    hist: { cpu: [], rx: [], tx: [] },
    route: { name: "home", path: "" },
    files: { path: null, items: [], loading: false, sort: "name", dir: 1, view: "list", filter: "", sel: {} },
    uploads: [], uploading: false
  };
  try { S.files.view = localStorage.getItem("osanas.view") || "list"; } catch (e) {}

  /* ================= routeur ================= */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/");
    if (parts[0] === "fichiers") return { name: "files", path: parts.slice(1).filter(Boolean).map(decodeURIComponent).join("/") };
    if (parts[0] === "systeme") return { name: "system", path: "" };
    return { name: "home", path: "" };
  }
  function go(name, path) {
    var h = name === "files" ? "#/fichiers/" + (path ? path.split("/").map(encodeURIComponent).join("/") : "") : name === "system" ? "#/systeme" : "#/";
    if (location.hash === h) route(); else location.hash = h;
  }
  window.addEventListener("hashchange", route);
  function route() { S.route = parseHash(); render(); }

  /* ================= rendu principal ================= */
  var app = $("#app");
  var shellOn = false;
  var shownRoute = null; // dernière section affichée : l'entrée animée complète ne joue qu'à l'ouverture

  function render() {
    if (S.user === undefined) return;
    if (!S.user) { shellOn = false; stopPoll(); return renderLogin(); }
    if (!shellOn) renderShell();
    updateTabs();
    var v = $("#view");
    // 1re ouverture : entrée en cascade. Changement d'onglet : fondu bref. Même section (dossier) : rien.
    v.className = shownRoute === null ? "" : shownRoute !== S.route.name ? "quick" : "still";
    if (shownRoute !== null && shownRoute !== S.route.name) window.scrollTo(0, 0);
    shownRoute = S.route.name;
    if (S.route.name === "files") renderFiles(v);
    else if (S.route.name === "system") renderSystem(v);
    else renderHome(v);
    startPoll();
  }

  /* ---------- connexion ---------- */
  function renderLogin() {
    app.innerHTML =
      '<div class="login"><div class="login-box enter">' +
      '<div style="display:grid;place-items:center">' + osaMascot({ mood: "calm", arms: "wave", size: 92 }) + "</div>" +
      "<div>" + WORDMARK + "</div>" +
      "<p>Ton NAS, version 2026.</p>" +
      '<form id="lf" autocomplete="on">' +
      '<input type="text" name="username" value="admin" autocomplete="username" class="sr" tabindex="-1" aria-hidden="true">' +
      '<input class="field" id="pw" type="password" placeholder="Mot de passe" autocomplete="current-password" required autofocus>' +
      '<div class="err" id="lerr"></div>' +
      '<button class="pill" type="submit">Se connecter</button>' +
      "</form>" +
      '<div class="login-foot">D-Link DNS-320 · Alt-F</div>' +
      "</div></div>";
    $("#lf").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("#lf .pill"); btn.disabled = true; $("#lerr").textContent = "";
      api("login", { body: { pass: $("#pw").value } }).then(function (r) {
        S.user = r.user; S.defaultPassword = r.defaultPassword; render();
      }).catch(function (err) {
        btn.disabled = false;
        $("#lerr").textContent = err.message;
        var f = $("#lf"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
        $("#pw").select();
      });
    });
  }

  /* ---------- coquille ---------- */
  function renderShell() {
    shellOn = true;
    shownRoute = null;
    app.innerHTML =
      '<header class="topbar" id="top">' +
      '<a href="#/" aria-label="Accueil OsaNAS" style="text-decoration:none">' + WORDMARK + "</a>" +
      '<nav class="seg" id="tabs" aria-label="Sections">' +
      '<span class="thumb" id="thumb"></span>' +
      '<button data-r="home">' + icon("home", "sm") + "Accueil</button>" +
      '<button data-r="files">' + icon("folder", "sm") + "Fichiers</button>" +
      '<button data-r="system">' + icon("server", "sm") + "Système</button>" +
      "</nav>" +
      '<span class="spacer"></span>' +
      '<span class="host"><span class="dot pulse" id="hostdot"></span><span class="hn" id="hostname">NAS</span></span>' +
      '<button class="icon-btn" id="logout" title="Se déconnecter" aria-label="Se déconnecter">' + icon("logout") + "</button>" +
      "</header>" +
      '<main id="view"></main>' +
      '<input type="file" id="picker" multiple hidden>';
    $$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.r, b.dataset.r === "files" ? (S.files.path || "") : ""); }); });
    $("#logout").addEventListener("click", function () { api("logout", { body: {} }).then(function () { S.user = null; render(); }); });
    $("#picker").addEventListener("change", function (e) { queueFiles(Array.prototype.map.call(e.target.files, function (f) { return { file: f, rel: "" }; })); e.target.value = ""; });
  }
  window.addEventListener("scroll", function () { var t = $("#top"); if (t) t.classList.toggle("scrolled", window.scrollY > 4); }, { passive: true });
  window.addEventListener("resize", function () { if (shellOn) { updateTabs(); segThumb(); } });
  function updateTabs() {
    var on = null;
    $$("#tabs button").forEach(function (b) { var a = b.dataset.r === S.route.name; b.classList.toggle("on", a); if (a) on = b; b.setAttribute("aria-current", a ? "page" : "false"); });
    var t = $("#thumb");
    if (on && t) { t.style.width = on.offsetWidth + "px"; t.style.transform = "translateX(" + (on.offsetLeft) + "px)"; }
  }

  /* ================= état du système (sondage) ================= */
  var pollT = null, fails = 0;
  function startPoll() { if (!pollT) { poll(); pollT = setInterval(poll, 3000); } }
  function stopPoll() { clearInterval(pollT); pollT = null; }
  function poll() {
    if (document.hidden || !S.user) return;
    api("status").then(function (st) {
      fails = 0; hideOffline();
      S.status = st;
      push(S.hist.cpu, st.cpu); push(S.hist.rx, st.net.rx); push(S.hist.tx, st.net.tx);
      $("#hostname") && ($("#hostname").textContent = st.name);
      updateLive();
    }).catch(function (e) {
      if (e.status === 401) return;
      if (++fails >= 2) showOffline("Le NAS ne répond plus", "Je réessaie toutes les 3 secondes…");
    });
    if (!S.disks || S.disks.some(function (d) { return d.health === "pending"; }) || Math.random() < 0.05) api("disks").then(function (d) { S.disks = d.disks; updateLive(); }).catch(function () {});
  }
  function push(arr, v) { if (v == null) return; arr.push(v); if (arr.length > 40) arr.shift(); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });

  function health(st) {
    var v = st.volume, usedPct = v.total ? (1 - v.free / v.total) * 100 : 0;
    if (!v.mounted) return { mood: "worried", title: "Le volume n’est pas monté.", level: "bad" };
    if (st.temp != null && st.temp >= 58) return { mood: "worried", title: "J’ai trop chaud.", level: "bad" };
    if (usedPct >= 95) return { mood: "worried", title: "Le disque est plein.", level: "bad" };
    if (st.temp != null && st.temp >= 52) return { mood: "worried", title: "Je chauffe un peu.", level: "warn" };
    if (usedPct >= 85) return { mood: "worried", title: "Le disque se remplit.", level: "warn" };
    var sick = (S.disks || []).filter(function (d) { return d.health === "bad" || d.health === "error"; })[0];
    if (sick) return { mood: "worried", title: "Un disque fatigue.", level: "warn" };
    if (S.uploading) return { mood: "busy", title: "Je range tes fichiers…", level: "ok" };
    var h = new Date().getHours();
    if (h >= 0 && h < 6) return { mood: "sleepy", title: "Tout est calme.", level: "ok" };
    return { mood: "happy", title: "Tout roule.", level: "ok" };
  }
  function tempState(t) { return t == null ? ["off", "—"] : t >= 58 ? ["bad", "Trop chaud"] : t >= 52 ? ["warn", "Chaud"] : ["ok", "Normal"]; }

  function spark(arrs, max) {
    var W = 100, H = 38, out = "";
    var m = max || Math.max.apply(null, [1].concat(arrs[0], arrs[1] || []));
    arrs.forEach(function (a, k) {
      if (a.length < 2) return;
      var span = Math.max(a.length, 12) - 1, off = span - (a.length - 1); // peu de points : on étire, puis ça défile
      var pts = a.map(function (v, i) { return [(W * (off + i)) / span, H - 2 - (Math.min(v, m) / m) * (H - 6)]; });
      var d = "M" + pts.map(function (p) { return p[0].toFixed(2) + " " + p[1].toFixed(2); }).join(" L");
      if (k === 0) out += '<path class="area" d="' + d + " L" + pts[pts.length - 1][0].toFixed(2) + " " + H + " L" + pts[0][0].toFixed(2) + " " + H + ' Z"/>';
      out += '<path class="line' + (k ? " alt" : "") + '" d="' + d + '"/>';
    });
    return '<svg class="spark" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true">' + out + "</svg>";
  }

  /* ================= accueil ================= */
  function renderHome(v) {
    v.innerHTML =
      '<div class="page"><div class="grid enter" id="home">' +
      (S.defaultPassword ? '<div class="c-12"><div class="banner">' + icon("lock") + '<div class="grow"><b>Mot de passe par défaut.</b> <span class="dim">OsaNAS utilise encore « admin ». Choisis le tien.</span></div><button class="pill sm" id="gopw">Changer</button></div></div>' : "") +
      '<section class="card hero c-12"><div class="mascot-wrap" id="mascot"></div><div class="grow">' +
      '<h2 id="h-title">Bonjour.</h2><p id="h-sub">Je regarde comment va le NAS…</p>' +
      '<div class="actions"><button class="pill" id="h-files">' + icon("folder", "sm") + "Parcourir les fichiers</button>" +
      '<button class="pill secondary" id="h-up">' + icon("upload", "sm") + "Envoyer</button>" +
      '<a class="pill secondary" id="h-finder" href="#">' + icon("finder", "sm") + "Ouvrir dans le Finder</a></div>" +
      "</div></section>" +
      '<section class="card c-8"><div class="card-head"><span class="tile">' + icon("disk", "sm") + '</span><h3>Stockage</h3><span class="meta">Volume_1 · ext4</span></div>' +
      '<div class="storage-top"><div class="big num" id="s-free">—</div><div class="label" id="s-pct"></div></div>' +
      '<div class="bar thick" id="s-bar"><i></i></div>' +
      '<div class="legend"><span id="s-used">—</span><span id="s-total">—</span></div></section>' +
      '<section class="card c-4"><div class="card-head"><span class="tile">' + icon("temp", "sm") + '</span><h3>Température</h3><span class="dot" id="t-dot"></span></div>' +
      '<div class="big num" id="t-val">—</div><div class="label" id="t-lab" style="margin-top:6px">—</div></section>' +
      '<section class="card c-4"><div class="card-head"><span class="tile">' + icon("cpu", "sm") + '</span><h3>Processeur</h3><span class="meta">ARMv5 · 800 MHz</span></div>' +
      '<div class="big num" id="c-val">—</div><div id="c-spark">' + spark([[]]) + "</div></section>" +
      '<section class="card c-4"><div class="card-head"><span class="tile">' + icon("memory", "sm") + '</span><h3>Mémoire</h3><span class="meta" id="m-tot"></span></div>' +
      '<div class="big num" id="m-val">—</div><div class="bar" id="m-bar" style="margin-top:22px"><i></i></div></section>' +
      '<section class="card c-4"><div class="card-head"><span class="tile">' + icon("network", "sm") + '</span><h3>Réseau</h3><span class="meta">Gigabit</span></div>' +
      '<div class="netrow"><div><div class="label">Reçu</div><div class="num" style="font-weight:700;font-size:15px" id="n-rx">—</div></div>' +
      '<div><div class="label">Envoyé</div><div class="num" style="font-weight:700;font-size:15px" id="n-tx">—</div></div></div>' +
      '<div id="n-spark">' + spark([[]]) + "</div></section>" +
      '<section class="card c-6"><div class="card-head"><span class="tile">' + icon("server", "sm") + '</span><h3>Disques</h3><span class="meta" id="d-meta"></span></div><div class="bays" id="bays"></div></section>' +
      '<section class="card c-6"><div class="card-head"><span class="tile">' + icon("share", "sm") + '</span><h3>Sur le réseau</h3></div><dl class="kv" id="h-kv"></dl></section>' +
      "</div></div>";
    $("#h-files").onclick = function () { go("files", ""); };
    $("#h-up").onclick = function () { go("files", S.files.path || ""); setTimeout(function () { $("#picker").click(); }, 50); };
    if ($("#gopw")) $("#gopw").onclick = function () { go("system"); setTimeout(function () { var f = $("#pw-cur"); f && f.focus(); }, 80); };
    lastMood = null;
    updateLive();
  }

  var lastMood = null;
  function updateLive() {
    var st = S.status;
    if (S.route.name === "home" && $("#home")) {
      if (st) {
        var hl = health(st);
        if (lastMood !== hl.mood) { $("#mascot").innerHTML = osaMascot({ mood: hl.mood, arms: lastMood === null && hl.mood === "happy" ? "wave" : "rest", size: 96 }); lastMood = hl.mood; }
        $("#h-title").textContent = hl.title;
        $("#h-sub").textContent = st.name + " · allumé depuis " + uptime(st.uptime) + " · " + bytes(st.volume.free) + " libres";
        $("#h-finder").href = "smb://" + st.ip + "/Volume_1";
        var used = st.volume.total - st.volume.free, pct = st.volume.total ? used / st.volume.total * 100 : 0;
        $("#s-free").innerHTML = esc(bytes(st.volume.free)) + "<small>libres</small>";
        $("#s-pct").textContent = fr(pct, pct < 10 ? 1 : 0) + " % utilisés";
        var sb = $("#s-bar"); sb.className = "bar thick" + (pct >= 95 ? " bad" : pct >= 85 ? " warn" : ""); sb.firstChild.style.width = Math.max(pct, 0.6) + "%";
        $("#s-used").textContent = bytes(used) + " utilisés"; $("#s-total").textContent = bytes(st.volume.total) + " au total";
        var ts = tempState(st.temp);
        $("#t-val").innerHTML = st.temp == null ? "—" : st.temp + "<small>°C</small>";
        $("#t-dot").className = "dot " + ts[0]; $("#t-lab").textContent = ts[1] + (st.fan ? " · ventilateur " + fr(st.fan, 0) + " tr/min" : " · ventilateur à l’arrêt");
        $("#c-val").innerHTML = st.cpu == null ? "…" : st.cpu + "<small>%</small>";
        $("#c-spark").innerHTML = spark([S.hist.cpu], 100);
        $("#m-val").innerHTML = esc(bytes(st.mem.used)) + "<small>utilisés</small>"; $("#m-tot").textContent = bytes(st.mem.total);
        $("#m-bar").firstChild.style.width = (st.mem.used / st.mem.total * 100) + "%";
        $("#n-rx").textContent = rate(st.net.rx); $("#n-tx").textContent = rate(st.net.tx);
        $("#n-spark").innerHTML = spark([S.hist.rx, S.hist.tx]);
        $("#h-kv").innerHTML = kv([["Nom", st.name], ["Adresse", st.ip], ["Allumé depuis", uptime(st.uptime)], ["Interface", location.host]]);
      }
      $("#bays").innerHTML = baysHTML(false);
      $("#d-meta").textContent = S.disks ? plural(S.disks.length, "disque", "disques") + " sur 2 baies" : "";
    }
    if (S.route.name === "system" && $("#sys")) updateSystem();
    var hd = $("#hostdot"); if (hd && st) { var l = health(st).level; hd.className = "dot pulse" + (l === "ok" ? "" : " " + l); }
  }
  function kv(rows) { return rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd title=\"" + esc(r[1]) + "\">" + esc(r[1]) + "</dd>"; }).join(""); }
  var DISK = {
    ok: ["", "SMART OK"], sleep: ["off", "en veille"], bad: ["bad", "erreurs de lecture, à remplacer"],
    error: ["bad", "ne répond plus, à remplacer"], unknown: ["off", "état inconnu"], pending: ["off", "vérification…"]
  };
  function baysHTML(detail) {
    if (!S.disks) return '<div class="skel"><i style="width:40%"></i></div>';
    return ["gauche", "droite"].map(function (b) {
      var d = S.disks.filter(function (x) { return x.bay === b; })[0];
      if (!d) return '<div class="bay vacant"><span class="bay-label">' + b + '</span><div class="grow">Baie vide' + (detail ? " — ou disque non détecté (vérifie qu’il est bien enfoncé)" : "") + '</div><span class="dot off"></span></div>';
      var hs = DISK[d.health] || DISK.unknown, err = d.health === "error";
      var name = d.family || (d.vendor + " " + d.model);
      var cap = d.size || (parseFloat(d.label) || 0) * (/TB/i.test(d.label) ? 1e12 : 1e9);
      var bits = [cap ? bytes(cap) : "taille inconnue"];
      if (d.temp) bits.push(d.temp + " °C");
      bits.push(hs[1]);
      if (detail) { bits.push("/dev/" + d.dev); bits.push(d.dev === "sda" ? "Volume_1" : "non utilisé"); }
      return '<div class="bay' + (err ? " sick" : "") + '"><span class="bay-label">' + b + '</span><div class="grow"><div class="name">' + esc(name) + '</div><div class="label">' +
        esc(bits.join(" · ")) + '</div></div><span class="dot ' + hs[0] + '" title="' + esc(hs[1]) + '"></span></div>';
    }).join("");
  }

  /* ================= fichiers ================= */
  var KIND = {
    image: /\.(jpe?g|png|gif|webp|heic|bmp|svg|avif)$/i, video: /\.(mp4|m4v|mov|webm|mkv|avi)$/i,
    audio: /\.(mp3|m4a|aac|wav|flac|ogg)$/i, pdf: /\.pdf$/i, text: /\.(txt|md|log|json|csv|xml|ini|conf|sh|yml|yaml)$/i,
    archive: /\.(zip|rar|7z|tar|gz|tgz|bz2|dmg|iso)$/i, code: /\.(js|ts|tsx|py|php|c|h|swift|java|html|css|go|rs)$/i,
    doc: /\.(docx?|xlsx?|pptx?|pages|numbers|key|odt|rtf)$/i
  };
  var KIND_ICON = { image: "image", video: "video", audio: "music", pdf: "doc", text: "doc", archive: "archive", code: "code", doc: "doc" };
  function kindOf(name) { for (var k in KIND) if (KIND[k].test(name)) return k; return "file"; }
  function canView(name) { var k = kindOf(name); return k === "image" && !/\.heic$/i.test(name) || k === "video" && /\.(mp4|m4v|mov|webm)$/i.test(name) || k === "audio" || k === "pdf" || k === "text" || k === "code"; }
  function joinPath(a, b) { return a ? a + "/" + b : b; }

  function renderFiles(v) {
    var F = S.files, path = S.route.path;
    if (F.path !== path) { F.path = path; F.items = []; F.sel = {}; F.filter = ""; F.loading = true; loadDir(); }
    var segs = path ? path.split("/") : [];
    var crumbs = '<button data-p="" class="' + (segs.length ? "" : "cur") + '">Volume_1</button>' + segs.map(function (s, i) {
      return icon("chevron", "sep") + '<button data-p="' + esc(segs.slice(0, i + 1).join("/")) + '" class="' + (i === segs.length - 1 ? "cur" : "") + '">' + esc(s) + "</button>";
    }).join("");
    v.innerHTML =
      '<div class="page"><div class="enter">' +
      '<div class="page-head"><div class="grow"><nav class="crumbs" aria-label="Chemin">' + crumbs + '</nav><div class="sub" id="f-sub">&nbsp;</div></div>' +
      '<div class="toolbar">' +
      '<label class="search">' + icon("search", "sm") + '<input id="f-q" type="search" placeholder="Filtrer ce dossier" value="' + esc(F.filter) + '"></label>' +
      '<div class="seg small" id="vseg"><span class="thumb"></span><button data-v="list" title="Liste" aria-label="Liste">' + icon("list", "sm") + '</button><button data-v="grid" title="Grille" aria-label="Grille">' + icon("grid", "sm") + "</button></div>" +
      '<button class="pill secondary sm" id="f-mk">' + icon("folderPlus", "sm") + "Dossier</button>" +
      '<button class="pill sm" id="f-up">' + icon("upload", "sm") + "Envoyer</button>" +
      "</div></div>" +
      '<div id="f-body"></div>' +
      "</div></div>" +
      '<div class="selbar" id="selbar"><span class="count" id="selcount"></span>' +
      '<button class="pill secondary sm" id="sel-dl">' + icon("download", "sm") + "Télécharger</button>" +
      '<button class="pill danger sm" id="sel-rm">' + icon("trash", "sm") + "Supprimer</button>" +
      '<button class="icon-btn" id="sel-x" aria-label="Tout désélectionner">' + icon("x") + "</button></div>";
    $$(".crumbs button").forEach(function (b) { b.onclick = function () { go("files", b.dataset.p); }; });
    $("#f-q").addEventListener("input", function (e) { F.filter = e.target.value; drawFiles(); });
    $$("#vseg button").forEach(function (b) { b.onclick = function () { F.view = b.dataset.v; try { localStorage.setItem("osanas.view", F.view); } catch (e) {} drawFiles(); segThumb(); }; });
    $("#f-mk").onclick = newFolder;
    $("#f-up").onclick = function () { $("#picker").click(); };
    $("#sel-x").onclick = function () { F.sel = {}; drawFiles(); };
    $("#sel-rm").onclick = function () { removeItems(selected()); };
    $("#sel-dl").onclick = function () { selected().filter(function (it) { return !it.dir; }).forEach(function (it, i) { setTimeout(function () { download(it); }, i * 400); }); };
    segThumb();
    drawFiles();
  }
  function segThumb() {
    $$("#vseg button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === S.files.view); });
    var on = $("#vseg button.on"), t = $("#vseg .thumb");
    if (on && t) { t.style.width = on.offsetWidth + "px"; t.style.transform = "translateX(" + on.offsetLeft + "px)"; }
  }
  function loadDir() {
    var F = S.files, want = F.path;
    F.loading = true;
    return api("ls", { query: { path: want } }).then(function (r) {
      if (F.path !== want) return;
      F.items = r.items; F.loading = false;
      var keep = {}; r.items.forEach(function (it) { if (F.sel[it.name]) keep[it.name] = true; }); F.sel = keep;
      drawFiles();
    }).catch(function (e) {
      F.loading = false;
      if (e.status === 404) { toast("Dossier introuvable"); go("files", ""); return; }
      if (e.status !== 401) toast(e.message);
    });
  }
  function visibleItems() {
    var F = S.files, q = F.filter.trim().toLowerCase();
    var list = F.items.filter(function (it) { return !q || it.name.toLowerCase().indexOf(q) !== -1; });
    var dir = F.dir, by = F.sort;
    list.sort(function (a, b) {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      var r = 0;
      if (by === "size") r = (a.size || 0) - (b.size || 0);
      else if (by === "date") r = (a.mtime || 0) - (b.mtime || 0);
      if (!r) r = a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" });
      return r * dir;
    });
    return list;
  }
  function selected() { var F = S.files; return F.items.filter(function (it) { return F.sel[it.name]; }); }

  function drawFiles() {
    var F = S.files, body = $("#f-body");
    if (!body) return;
    var items = visibleItems();
    var nd = F.items.filter(function (i) { return i.dir; }).length, nf = F.items.length - nd;
    var total = F.items.reduce(function (s, i) { return s + (i.size || 0); }, 0);
    $("#f-sub").textContent = F.loading ? "Chargement…" : (F.items.length ? [nd ? plural(nd, "dossier", "dossiers") : "", nf ? plural(nf, "fichier", "fichiers") + " · " + bytes(total) : ""].filter(Boolean).join(" · ") : "Vide");
    if (F.loading && !F.items.length) {
      body.innerHTML = '<div class="files">' + [60, 42, 70, 35].map(function (w) { return '<div class="skel"><i style="width:30px;height:30px;border-radius:8px"></i><i style="width:' + w + '%"></i></div>'; }).join("") + "</div>";
      return;
    }
    if (!items.length) {
      body.innerHTML = '<div class="files"><div class="empty">' + icon(F.filter ? "search" : "upload") + "<p>" +
        (F.filter ? "Rien ne correspond à « " + esc(F.filter) + " »." : "Ce dossier est vide.<br>Glisse des fichiers ici, ou utilise « Envoyer ».") + "</p></div></div>";
    } else if (F.view === "grid") {
      body.innerHTML = '<div class="gridview">' + items.map(function (it, i) {
        var k = it.dir ? "folder" : kindOf(it.name), p = joinPath(F.path, it.name);
        var thumb = it.dir ? '<div class="thumb folder">' + icon("folder") + "</div>" :
          k === "image" && !/\.heic$/i.test(it.name) ? '<div class="thumb"><img loading="lazy" alt="" src="' + esc(fileURL(p, true)) + '"></div>' :
          '<div class="thumb">' + icon(KIND_ICON[k] || "file") + "</div>";
        return '<div class="gcard' + (F.sel[it.name] ? " sel" : "") + '" data-i="' + i + '">' +
          '<button class="check' + (F.sel[it.name] ? " on" : "") + '" data-act="sel" aria-label="Sélectionner">' + icon("check") + "</button>" +
          thumb + '<div class="t" title="' + esc(it.name) + '">' + esc(it.name) + '</div><div class="s">' + (it.dir ? "Dossier" : esc(bytes(it.size))) + "</div>" +
          '<button class="open" data-act="open" aria-label="Ouvrir ' + esc(it.name) + '"></button></div>';
      }).join("") + "</div>";
    } else {
      var arrow = function (k) { return F.sort === k ? icon(F.dir > 0 ? "up" : "down", "sm") : ""; };
      body.innerHTML = '<div class="files" role="table"><div class="files-head" role="row"><span></span>' +
        '<button data-sort="name">Nom ' + arrow("name") + '</button><button class="r" data-sort="size">Taille ' + arrow("size") + '</button><button class="dt" data-sort="date">Modifié ' + arrow("date") + "</button><span></span></div>" +
        items.map(function (it, i) {
          var k = it.dir ? "folder" : kindOf(it.name);
          return '<div class="row' + (F.sel[it.name] ? " sel" : "") + '" role="row" data-i="' + i + '">' +
            '<button class="check' + (F.sel[it.name] ? " on" : "") + '" data-act="sel" aria-label="Sélectionner ' + esc(it.name) + '">' + icon("check") + "</button>" +
            '<div class="name"><button data-act="open"><span class="ftile' + (it.dir ? " folder" : "") + '">' + icon(it.dir ? "folder" : KIND_ICON[k] || "file", "sm") + "</span><span>" + esc(it.name) + "</span></button></div>" +
            '<span class="sz r">' + (it.dir ? "—" : esc(bytes(it.size))) + "</span>" +
            '<span class="dt">' + esc(when(it.mtime)) + "</span>" +
            '<span class="acts r">' + (it.dir ? "" : '<button class="icon-btn hide-sm" data-act="dl" title="Télécharger" aria-label="Télécharger">' + icon("download", "sm") + "</button>") +
            '<button class="icon-btn hide-sm" data-act="ren" title="Renommer" aria-label="Renommer">' + icon("pencil", "sm") + "</button>" +
            '<button class="icon-btn" data-act="rm" title="Supprimer" aria-label="Supprimer">' + icon("trash", "sm") + "</button></span></div>";
        }).join("") + "</div>";
      $$(".files-head [data-sort]").forEach(function (b) { b.onclick = function () { var s = b.dataset.sort; if (F.sort === s) F.dir = -F.dir; else { F.sort = s; F.dir = s === "name" ? 1 : -1; } drawFiles(); }; });
    }
    $$("[data-act]", body).forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var it = items[+b.closest("[data-i]").dataset.i], act = b.dataset.act;
        if (act === "sel") { if (F.sel[it.name]) delete F.sel[it.name]; else F.sel[it.name] = true; drawFiles(); }
        else if (act === "open") openItem(it, items);
        else if (act === "dl") download(it);
        else if (act === "ren") renameItem(it);
        else if (act === "rm") removeItems([it]);
      });
    });
    var n = selected().length;
    $("#selbar").classList.toggle("show", n > 0);
    if (n) { $("#selcount").textContent = plural(n, "élément", "éléments"); $("#sel-dl").style.display = selected().some(function (i) { return !i.dir; }) ? "" : "none"; }
  }

  function openItem(it, list) {
    if (it.dir) return go("files", joinPath(S.files.path, it.name));
    if (canView(it.name)) return viewer(it, list);
    download(it);
  }
  function download(it) {
    var a = document.createElement("a");
    a.href = fileURL(joinPath(S.files.path, it.name)); a.download = it.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function newFolder() {
    sheet({ title: "Nouveau dossier", field: { value: "", placeholder: "Nom du dossier" }, ok: "Créer" }, function (name) {
      return api("mkdir", { body: { path: S.files.path, name: name } }).then(function () { toast("Dossier « " + name + " » créé"); loadDir(); });
    });
  }
  function renameItem(it) {
    sheet({ title: "Renommer", field: { value: it.name, placeholder: "Nouveau nom", selectBase: !it.dir }, ok: "Renommer" }, function (name) {
      if (name === it.name) return Promise.resolve();
      return api("rename", { body: { path: joinPath(S.files.path, it.name), name: name } }).then(function () { delete S.files.sel[it.name]; toast("Renommé"); loadDir(); });
    });
  }
  function removeItems(list) {
    if (!list.length) return;
    var one = list.length === 1;
    sheet({
      title: one ? "Supprimer « " + list[0].name + " » ?" : "Supprimer " + list.length + " éléments ?",
      text: "C’est définitif : il n’y a pas de corbeille sur le NAS." + (list.some(function (i) { return i.dir; }) ? " Les dossiers sont supprimés avec tout leur contenu." : ""),
      ok: "Supprimer", danger: true
    }, function () {
      return api("delete", { body: { paths: list.map(function (i) { return joinPath(S.files.path, i.name); }) } }).then(function () {
        list.forEach(function (i) { delete S.files.sel[i.name]; });
        toast(one ? "Supprimé" : plural(list.length, "élément supprimé", "éléments supprimés")); loadDir();
      });
    });
  }

  /* ---------- visionneuse ---------- */
  function viewer(it, list) {
    var media = list.filter(function (x) { return !x.dir && canView(x.name); });
    var idx = media.indexOf(it);
    var el = document.createElement("div");
    el.className = "viewer"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
    function show() {
      var cur = media[idx], p = joinPath(S.files.path, cur.name), k = kindOf(cur.name), url = fileURL(p, true), stage;
      if (k === "image") stage = '<img alt="' + esc(cur.name) + '" src="' + esc(url) + '">';
      else if (k === "video") stage = '<video src="' + esc(url) + '" controls autoplay playsinline></video>';
      else if (k === "audio") stage = '<div style="text-align:center">' + osaMascot({ mood: "happy", size: 80 }) + '<audio src="' + esc(url) + '" controls autoplay></audio></div>';
      else if (k === "pdf") stage = '<iframe src="' + esc(url) + '" title="' + esc(cur.name) + '"></iframe>';
      else stage = '<pre id="vtext">Chargement…</pre>';
      el.innerHTML = "<header><b>" + esc(cur.name) + '</b><span class="label num">' + esc(bytes(cur.size)) + (media.length > 1 ? " · " + (idx + 1) + "/" + media.length : "") + "</span>" +
        '<button class="icon-btn" data-v="dl" title="Télécharger" aria-label="Télécharger">' + icon("download") + '</button><button class="icon-btn" data-v="x" title="Fermer" aria-label="Fermer">' + icon("x") + "</button></header>" +
        '<div class="stage">' + stage + "</div>" +
        (media.length > 1 ? '<button class="icon-btn nav prev" data-v="p" aria-label="Précédent">' + icon("chevronL") + '</button><button class="icon-btn nav next" data-v="n" aria-label="Suivant">' + icon("chevron") + "</button>" : "");
      if (k === "text" || k === "code") {
        if ((cur.size || 0) > 1500000) $("#vtext", el).textContent = "Fichier trop gros pour l’aperçu : télécharge-le.";
        else fetch(url, { credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (t) { var pre = $("#vtext", el); if (pre) pre.textContent = t; });
      }
      $$("[data-v]", el).forEach(function (b) {
        b.onclick = function () { var a = b.dataset.v; if (a === "x") close(); else if (a === "dl") download(cur); else step(a === "n" ? 1 : -1); };
      });
    }
    function step(d) { idx = (idx + d + media.length) % media.length; show(); }
    function key(e) { if (e.key === "Escape") close(); else if (e.key === "ArrowRight" && media.length > 1) step(1); else if (e.key === "ArrowLeft" && media.length > 1) step(-1); }
    function close() { document.removeEventListener("keydown", key); el.remove(); }
    document.addEventListener("keydown", key);
    el.addEventListener("click", function (e) { if (e.target.classList.contains("stage")) close(); });
    show();
  }

  /* ---------- envois ---------- */
  function queueFiles(list) {
    if (!list.length) return;
    var dest = S.files.path || "";
    list.forEach(function (x) { S.uploads.push({ file: x.file, rel: x.rel, dest: dest, sent: 0, state: "wait" }); });
    drawUploads(); pumpUploads(); updateLive();
  }
  function pumpUploads() {
    if (S.uploading) return;
    var u = S.uploads.filter(function (x) { return x.state === "wait"; })[0];
    if (!u) {
      var ok = S.uploads.filter(function (x) { return x.state === "done"; }).length, ko = S.uploads.filter(function (x) { return x.state === "error"; }).length;
      if (ok || ko) toast(ko ? plural(ko, "envoi a échoué", "envois ont échoué") : plural(ok, "fichier envoyé", "fichiers envoyés"));
      updateLive();
      setTimeout(function () { if (!S.uploading && !S.uploads.some(function (x) { return x.state === "wait"; })) { S.uploads = []; drawUploads(); } }, 4000);
      return;
    }
    S.uploading = true; u.state = "send"; u.t0 = Date.now();
    var fd = new FormData();
    fd.append("path", u.dest); fd.append("relpath", u.rel || ""); fd.append("file", u.file, u.file.name);
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "api?a=upload");
    xhr.setRequestHeader("X-Osa", "1");
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) { u.sent = e.loaded; drawUploads(); } };
    xhr.onload = function () {
      var j = {}; try { j = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status === 200 && j.ok) { u.state = "done"; u.sent = u.file.size; } else { u.state = "error"; u.err = j.error || "Erreur " + xhr.status; }
      next();
    };
    xhr.onerror = function () { u.state = "error"; u.err = "Connexion perdue"; next(); };
    xhr.send(fd);
    function next() {
      S.uploading = false; drawUploads();
      if (S.route.name === "files" && S.files.path === u.dest) loadDir();
      pumpUploads();
    }
    drawUploads();
  }
  function drawUploads() {
    var box = $("#uploads");
    if (!S.uploads.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("section"); box.className = "uploads"; box.id = "uploads"; document.body.appendChild(box); }
    var left = S.uploads.filter(function (x) { return x.state === "wait" || x.state === "send"; }).length;
    box.innerHTML = "<header><b>" + (left ? "Envoi · " + plural(left, "fichier restant", "fichiers restants") : "Envois terminés") + "</b>" +
      '<button class="icon-btn" id="up-x" aria-label="Masquer">' + icon("x", "sm") + "</button></header>" +
      '<div class="list">' + S.uploads.map(function (u) {
        var pct = u.file.size ? Math.round(u.sent / u.file.size * 100) : 100;
        var speed = u.state === "send" && u.t0 ? u.sent / Math.max(0.5, (Date.now() - u.t0) / 1000) : null;
        var right = u.state === "done" ? "Terminé" : u.state === "error" ? esc(u.err) : u.state === "wait" ? "En attente" : pct + " %" + (speed ? " · " + esc(rate(speed)) : "");
        return '<div class="up ' + u.state + '"><div class="l"><span>' + esc(u.rel || u.file.name) + "</span><span>" + right + '</span></div><div class="bar"><i style="width:' + (u.state === "error" ? 100 : pct) + '%"></i></div></div>';
      }).join("") + "</div>";
    $("#up-x").onclick = function () { S.uploads = S.uploads.filter(function (x) { return x.state === "wait" || x.state === "send"; }); if (!S.uploads.length) box.remove(); else box.style.display = "none"; };
  }

  /* glisser-déposer (fichiers et dossiers) */
  var drop = document.createElement("div");
  drop.className = "drop"; drop.innerHTML = '<div class="zone">' + osaMascot({ mood: "happy", arms: "up", size: 70 }) + '<b>Lâche pour envoyer</b><span id="drop-to"></span></div>';
  document.body.appendChild(drop);
  var dragN = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") !== -1; }
  window.addEventListener("dragenter", function (e) {
    if (!S.user || !hasFiles(e)) return;
    e.preventDefault(); dragN++;
    $("#drop-to").textContent = "dans " + (S.route.name === "files" && S.files.path ? S.files.path.split("/").pop() : "Volume_1");
    drop.classList.add("show");
  });
  window.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", function () { if (--dragN <= 0) { dragN = 0; drop.classList.remove("show"); } });
  window.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragN = 0; drop.classList.remove("show");
    if (!S.user) return;
    if (S.route.name !== "files") go("files", S.files.path || "");
    var items = e.dataTransfer.items, entries = [];
    if (items && items.length && items[0].webkitGetAsEntry) {
      for (var i = 0; i < items.length; i++) { var en = items[i].webkitGetAsEntry(); if (en) entries.push(en); }
      walk(entries).then(queueFiles);
    } else queueFiles(Array.prototype.map.call(e.dataTransfer.files, function (f) { return { file: f, rel: "" }; }));
  });
  function walk(entries, prefix) {
    prefix = prefix || "";
    return Promise.all(entries.map(function (en) {
      if (en.isFile) return new Promise(function (res) { en.file(function (f) { res([{ file: f, rel: prefix ? prefix + "/" + f.name : "" }]); }, function () { res([]); }); });
      if (en.isDirectory) {
        var reader = en.createReader(), all = [];
        return new Promise(function (res) {
          (function read() {
            reader.readEntries(function (batch) {
              if (!batch.length) return walk(all, prefix ? prefix + "/" + en.name : en.name).then(res);
              all = all.concat(Array.prototype.slice.call(batch)); read();
            }, function () { res([]); });
          })();
        }).then(function (r) { return r.length ? r : []; });
      }
      return [];
    })).then(function (lists) {
      var out = [];
      lists.forEach(function (l) { out = out.concat(l); });
      // un dossier vide transporté seul : on ignore (rien à envoyer)
      return out.filter(function (x) { return !/(^|\/)\.DS_Store$/.test(x.rel || x.file.name); });
    });
  }

  /* ================= système ================= */
  function renderSystem(v) {
    v.innerHTML =
      '<div class="page"><div class="page-head"><div class="grow"><h1>Système</h1><div class="sub">Ton DNS-320, ses disques et comment y accéder.</div></div></div>' +
      '<div class="grid enter" id="sys">' +
      '<section class="card c-6"><div class="card-head"><span class="tile">' + icon("server", "sm") + '</span><h3>Appareil</h3><span class="meta" id="y-model"></span></div><dl class="kv" id="y-kv"></dl></section>' +
      '<section class="card c-6"><div class="card-head"><span class="tile">' + icon("disk", "sm") + '</span><h3>Disques</h3></div><div class="bays" id="y-bays"></div>' +
      '<p class="label" style="margin:12px 2px 0">Volume_1 : volume standard (sans miroir). Pour protéger tes fichiers d’une panne de disque, il faudra un second disque en RAID 1.</p></section>' +
      '<section class="card c-6"><div class="card-head"><span class="tile">' + icon("share", "sm") + '</span><h3>Accéder au NAS</h3></div><div id="y-access"></div></section>' +
      '<section class="card c-6"><div class="card-head"><span class="tile">' + icon("lock", "sm") + '</span><h3>Mot de passe d’OsaNAS</h3></div>' +
      '<form id="pwf"><input class="field" id="pw-cur" type="password" placeholder="Mot de passe actuel" autocomplete="current-password" required style="margin-bottom:8px">' +
      '<input class="field" id="pw-new" type="password" placeholder="Nouveau (6 caractères minimum)" autocomplete="new-password" minlength="6" required style="margin-bottom:8px">' +
      '<input class="field" id="pw-new2" type="password" placeholder="Confirmer" autocomplete="new-password" required style="margin-bottom:10px">' +
      '<div class="btnrow"><button class="pill sm" type="submit">Changer le mot de passe</button><span class="err" id="pw-err" style="align-self:center"></span></div></form></section>' +
      '<section class="card c-12"><div class="card-head"><span class="tile">' + icon("power", "sm") + '</span><h3>Alimentation</h3></div>' +
      '<p class="dim" style="margin:0 0 14px">Un redémarrage prend environ deux minutes. OsaNAS revient tout seul.</p>' +
      '<div class="btnrow"><button class="pill secondary" id="y-restart">' + icon("restart", "sm") + 'Redémarrer</button><button class="pill danger" id="y-off">' + icon("power", "sm") + "Éteindre</button></div></section>" +
      "</div>" +
      '<div class="foot"><span id="y-ver">OsaNAS</span><a id="y-legacy" href="#" target="_blank" rel="noopener">Interface Alt-F ↗</a></div></div>';
    $("#pwf").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#pw-err"); err.textContent = "";
      if ($("#pw-new").value !== $("#pw-new2").value) { err.textContent = "Les deux mots de passe ne correspondent pas"; return; }
      api("password", { body: { current: $("#pw-cur").value, next: $("#pw-new").value } }).then(function () {
        S.defaultPassword = false; $("#pwf").reset(); toast("Mot de passe changé");
      }).catch(function (x) { err.textContent = x.message; });
    });
    $("#y-restart").onclick = function () { power("restart"); };
    $("#y-off").onclick = function () { power("shutdown"); };
    updateSystem();
  }
  function copyRow(label, val, href) {
    return '<div class="copy"><span class="label">' + esc(label) + "</span><code>" + esc(val) + "</code>" +
      (href ? '<a class="icon-btn" href="' + esc(href) + '" title="Ouvrir" aria-label="Ouvrir">' + icon("external", "sm") + "</a>" : "") +
      '<button class="icon-btn" data-copy="' + esc(val) + '" title="Copier" aria-label="Copier">' + icon("copy", "sm") + "</button></div>";
  }
  function updateSystem() {
    var st = S.status;
    $("#y-bays").innerHTML = baysHTML(true);
    if (!st) return;
    var late = st.time < 1500000000;
    $("#y-model").textContent = "D-Link " + st.model + " · " + st.firmware;
    $("#y-kv").innerHTML = kv([
      ["Nom", st.name], ["Modèle", "D-Link " + st.model], ["Firmware", st.firmware], ["Système", "Linux " + st.kernel + " · ARMv5"],
      ["Adresse IP", st.ip], ["Passerelle", st.gateway || "—"], ["Adresse MAC", st.mac],
      ["Ventilateur", st.fan ? fr(st.fan, 0) + " tr/min" : "à l’arrêt"],
      ["Allumé depuis", uptime(st.uptime)], ["Heure du NAS", late ? "Pas à l’heure (pas d’accès NTP)" : new Date(st.time * 1000).toLocaleString("fr-FR")]
    ]);
    if (!$("#y-access").dataset.done) {
      $("#y-access").dataset.done = "1";
      $("#y-access").innerHTML =
        '<p class="dim" style="margin:0 0 4px">Dans le Finder : <b>⌘K</b> puis colle l’adresse. Connexion en invité.</p>' +
        copyRow("macOS", "smb://" + st.ip + "/Volume_1", "smb://" + st.ip + "/Volume_1") +
        copyRow("Windows", "\\\\" + st.ip + "\\Volume_1") +
        copyRow("OsaNAS", "http://" + st.ip + ":8080", "http://" + st.ip + ":8080");
      $$("[data-copy]", $("#y-access")).forEach(function (b) {
        b.onclick = function () {
          var t = b.dataset.copy;
          (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copié"); }).catch(function () {
            var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
            try { document.execCommand("copy"); toast("Copié"); } catch (e) {} ta.remove();
          });
        };
      });
    }
    $("#y-ver").textContent = "OsaNAS " + st.version + " · servi par le NAS sur le port 8080";
    $("#y-legacy").href = "http://" + st.ip + "/";
  }
  function power(what) {
    var off = what === "shutdown";
    sheet({
      title: off ? "Éteindre le NAS ?" : "Redémarrer le NAS ?",
      text: off ? "Il faudra appuyer sur son bouton pour le rallumer. Les envois en cours seront perdus." : "OsaNAS sera indisponible environ deux minutes.",
      ok: off ? "Éteindre" : "Redémarrer", danger: off
    }, function () {
      return api("power", { body: { what: what } }).then(function () {
        stopPoll();
        if (off) { showOffline("Le NAS s’éteint", "Tu peux fermer cette page. Rallume-le avec son bouton en façade.", "sleepy"); return; }
        showOffline("Redémarrage…", "Environ deux minutes. La page revient toute seule.", "busy");
        var t0 = Date.now(), seenDown = false;
        var iv = setInterval(function () {
          fetch("api?a=me", { cache: "no-store" }).then(function (r) { if (seenDown || Date.now() - t0 > 60000) { clearInterval(iv); location.reload(); } return r; })
            .catch(function () { seenDown = true; });
        }, 4000);
      });
    });
  }

  /* ================= composants ================= */
  function sheet(o, onOk) {
    var el = document.createElement("div");
    el.className = "scrim";
    el.innerHTML = '<form class="sheet" role="dialog" aria-modal="true"><h3>' + esc(o.title) + "</h3>" + (o.text ? "<p>" + esc(o.text) + "</p>" : "") +
      (o.field ? '<input class="field" id="sh-f" value="' + esc(o.field.value) + '" placeholder="' + esc(o.field.placeholder) + '" required>' : "") +
      '<div class="err" id="sh-e"></div><div class="btns"><button type="button" class="pill secondary" id="sh-c">Annuler</button>' +
      '<button type="submit" class="pill' + (o.danger ? " danger solid" : "") + '" id="sh-ok">' + esc(o.ok) + "</button></div></form>";
    document.body.appendChild(el);
    var f = $("#sh-f", el);
    if (f) { f.focus(); if (o.field.selectBase && f.value.lastIndexOf(".") > 0) f.setSelectionRange(0, f.value.lastIndexOf(".")); else f.select(); }
    else $("#sh-ok", el).focus();
    function close() { document.removeEventListener("keydown", key); el.remove(); }
    function key(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", key);
    $("#sh-c", el).onclick = close;
    el.addEventListener("mousedown", function (e) { if (e.target === el) close(); });
    $("form", el).addEventListener("submit", function (e) {
      e.preventDefault();
      var b = $("#sh-ok", el); b.disabled = true;
      Promise.resolve(onOk(f ? f.value.trim() : true)).then(close).catch(function (x) { b.disabled = false; $("#sh-e", el).textContent = x.message; });
    });
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.innerHTML = icon("check", "sm") + esc(msg);
    $("#toasts").appendChild(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }
  var offEl = null;
  function showOffline(title, text, mood) {
    if (!offEl) { offEl = document.createElement("div"); offEl.className = "offline"; document.body.appendChild(offEl); }
    offEl.innerHTML = "<div>" + '<div style="display:grid;place-items:center">' + osaMascot({ mood: mood || "worried", size: 90 }) + "</div><h2>" + esc(title) + "</h2><p>" + esc(text) + "</p></div>";
  }
  function hideOffline() { if (offEl) { offEl.remove(); offEl = null; } }

  /* raccourcis clavier (fichiers) */
  document.addEventListener("keydown", function (e) {
    if (S.route.name !== "files" || !S.user || $(".scrim") || $(".viewer")) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input") { if (e.key === "Escape") e.target.blur(); return; }
    if (e.key === "/") { e.preventDefault(); var q = $("#f-q"); q && q.focus(); }
    else if (e.key === "Escape" && selected().length) { S.files.sel = {}; drawFiles(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && selected().length) { e.preventDefault(); removeItems(selected()); }
    else if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); visibleItems().forEach(function (i) { S.files.sel[i.name] = true; }); drawFiles(); }
    else if (e.key === "Backspace" && S.files.path) { go("files", S.files.path.split("/").slice(0, -1).join("/")); }
  });

  /* ================= démarrage ================= */
  S.route = parseHash();
  api("me").then(function (r) { S.user = r.user; S.defaultPassword = !!r.defaultPassword; render(); })
    .catch(function () { S.user = null; render(); });
})();
