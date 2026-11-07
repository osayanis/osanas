/*
 * La mascotte de la suite Osa, en SVG — mêmes cotes que Mascot.swift (OsaHUB) / Mascot.tsx (OsaMaps) :
 * corps crème arrondi éclairé en haut à gauche, bras en capsules, pieds ovales,
 * yeux en capsules avec reflet, joues roses. Humeurs : calm, happy, busy, worried, sleepy.
 */
(function () {
  var INK = "#1b1d24", CHEEK = "#ff8096";
  var LIGHT = "#fefdf7", SHADE = "#d6cec2", FEET = "#b3ab9e";
  var n = 0;

  function smile(w, h, up) {
    var x0 = -w / 2, x1 = w / 2, y = up ? h / 2 : -h / 2, cy = up ? -h / 2 - h : h / 2 + h;
    return "M" + x0 + " " + y + " Q0 " + cy + " " + x1 + " " + y;
  }

  function eyes(mood) {
    var s = "";
    [-1, 1].forEach(function (side) {
      s += '<g transform="translate(' + side * 17 + ' -5)">';
      if (mood === "happy") {
        s += '<path d="' + smile(15, 8, true) + '" fill="none" stroke="' + INK + '" stroke-width="4.5" stroke-linecap="round"/>';
      } else if (mood === "sleepy") {
        s += '<path d="' + smile(14, 5, false) + '" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>';
      } else {
        var round = mood === "worried";
        s += '<g class="m-eye"><rect x="-6" y="' + (round ? -6.5 : -10) + '" width="12" height="' + (round ? 13 : 20) + '" rx="6" fill="' + INK + '"/>' +
          '<circle cx="1.5" cy="-3.5" r="2.25" fill="#fff" fill-opacity=".92"/></g>';
      }
      s += "</g>";
      if (mood === "worried") {
        s += '<rect x="-6.5" y="-1.5" width="13" height="3" rx="1.5" fill="' + INK + '" transform="translate(' + side * 18 + ' -20) rotate(' + side * 16 + ')"/>';
      }
      s += '<ellipse cx="' + side * 30 + '" cy="10" rx="8" ry="4" fill="' + CHEEK + '" fill-opacity=".55"/>';
    });
    return s;
  }

  function mouth(mood) {
    var s = '<g transform="translate(0 16)">';
    if (mood === "worried") s += '<rect x="-5" y="-1.5" width="10" height="3" rx="1.5" fill="' + INK + '"/>';
    else if (mood === "busy" || mood === "sleepy") s += '<circle r="' + (mood === "sleepy" ? 2.6 : 3.5) + '" fill="' + INK + '"/>';
    else s += '<path d="' + smile(mood === "happy" ? 24 : 18, 7, false) + '" fill="none" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round"/>';
    return s + "</g>";
  }

  /** Renvoie le SVG de la mascotte (chaîne). opts : { mood, arms: "rest"|"up"|"wave", size } */
  window.osaMascot = function (opts) {
    opts = opts || {};
    var mood = opts.mood || "calm", arms = opts.arms || "rest", size = opts.size || 96;
    var id = "m" + (++n);
    var w = size * 1.6, h = w * 134 / 160;
    var arm = function (side) {
      var deg = arms === "up" ? 150 : arms === "wave" ? (side > 0 ? 150 : 18) : 18;
      return '<g class="m-arm' + (arms === "wave" && side > 0 ? " is-waving" : "") + '" style="transform: translate(' + side * 44 + 'px, 2px) rotate(' + (-side * deg) + 'deg)">' +
        '<rect x="-7.5" y="0" width="15" height="36" rx="7.5" fill="url(#a' + id + ')"/></g>';
    };
    return '<svg class="mascot mood-' + mood + '" viewBox="-80 -72 160 134" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false">' +
      "<defs>" +
      '<radialGradient id="b' + id + '" gradientUnits="userSpaceOnUse" cx="-15" cy="-20" r="78"><stop offset="0" stop-color="' + LIGHT + '"/><stop offset=".5" stop-color="' + LIGHT + '"/><stop offset="1" stop-color="' + SHADE + '"/></radialGradient>' +
      '<linearGradient id="a' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + LIGHT + '"/><stop offset="1" stop-color="' + SHADE + '"/></linearGradient>' +
      '<linearGradient id="f' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + SHADE + '"/><stop offset="1" stop-color="' + FEET + '"/></linearGradient>' +
      '<filter id="s' + id + '" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="2.6"/></filter>' +
      "</defs>" +
      '<ellipse cx="0" cy="51.5" rx="42.5" ry="6" fill="#000" opacity=".5" filter="url(#s' + id + ')"/>' +
      '<g class="m-body"><g class="m-bob">' +
      '<ellipse cx="-20" cy="43.2" rx="12" ry="6.5" fill="url(#f' + id + ')"/><ellipse cx="20" cy="43.2" rx="12" ry="6.5" fill="url(#f' + id + ')"/>' +
      arm(-1) + arm(1) +
      '<rect x="-50" y="-46" width="100" height="92" rx="42" fill="url(#b' + id + ')"/>' +
      '<rect x="-49.4" y="-45.4" width="98.8" height="90.8" rx="41.4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.1"/>' +
      '<rect x="-50" y="-46" width="100" height="92" rx="42" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.2"/>' +
      '<g class="m-face">' + eyes(mood) + mouth(mood) + "</g>" +
      "</g></g></svg>";
  };
})();
