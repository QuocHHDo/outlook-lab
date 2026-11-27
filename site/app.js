(function () {
  var NAMES = { SPY: "SPDR S&P 500 ETF", QQQ: "Invesco QQQ Trust", SMH: "VanEck Semiconductor ETF", IWM: "iShares Russell 2000 ETF", XLF: "Financial Select Sector SPDR", XLE: "Energy Select Sector SPDR", XLV: "Health Care Select Sector SPDR", TLT: "iShares 20+ Year Treasury Bond ETF", GLD: "SPDR Gold Shares", XLK: "Technology Select Sector SPDR", XLY: "Consumer Discretionary Select Sector SPDR", XLP: "Consumer Staples Select Sector SPDR", XLI: "Industrial Select Sector SPDR", XLB: "Materials Select Sector SPDR", XLU: "Utilities Select Sector SPDR", XLRE: "Real Estate Select Sector SPDR", XLC: "Communication Services Select Sector SPDR", AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", AMZN: "Amazon", GOOGL: "Alphabet (Class A)", META: "Meta Platforms", EFA: "iShares MSCI EAFE ETF", EEM: "iShares MSCI Emerging Markets ETF", HYG: "iShares iBoxx High Yield Corporate Bond ETF", TSLA: "Tesla", AVGO: "Broadcom", JPM: "JPMorgan Chase", "BRK.B": "Berkshire Hathaway (Class B)", LLY: "Eli Lilly", JNJ: "Johnson & Johnson", XOM: "ExxonMobil", WMT: "Walmart", COST: "Costco", GE: "GE Aerospace", RTX: "RTX", LIN: "Linde", NEE: "NextEra Energy", PLD: "Prologis", MSTR: "Strategy Inc.", SCCO: "Southern Copper", WELL: "Welltower", SO: "Southern Company", CVX: "Chevron", AMD: "Advanced Micro Devices", XBI: "SPDR S&P Biotech ETF", KRE: "SPDR S&P Regional Banking ETF", ITB: "iShares U.S. Home Construction ETF", USO: "United States Oil Fund", UNH: "UnitedHealth Group", V: "Visa", SLV: "iShares Silver Trust", IEF: "iShares 7-10 Year Treasury Bond ETF", IBIT: "iShares Bitcoin Trust ETF", ORCL: "Oracle", MU: "Micron Technology" };
  var HLABEL = { "1w": "1 week", "1m": "1 month", "3m": "3 months", "6m": "6 months", "1y": "1 year", "5y": "5 years" };
  var HORDER = ["1w", "1m", "3m", "6m", "1y", "5y"];
  var state = { preds: [], summary: null, prices: {}, events: [], symbol: null, horizon: null, evTab: "scheduled", evAll: false, homeGroup: "all", homeSort: "default", chartWin: "1m", chartLog: false };

  function syncTheme() {
    var d = document.documentElement.getAttribute("data-theme") === "dark";
    var b = document.getElementById("theme-btn");
    b.textContent = d ? "\u2600 Light" : "\u263E Dark";
    b.setAttribute("aria-pressed", d ? "true" : "false");
  }
  document.getElementById("theme-btn").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ol-theme", next); } catch (e) {}
    syncTheme();
    if (state.lastRows && state.tv) renderChart(state.lastRows);
  });
  syncTheme();
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function money(v) { return v == null ? "" : "$" + Number(v).toFixed(2); }
  function range(r) { return r ? money(r.low) + " – " + money(r.high) : ""; }
  function pct(v) { return v == null ? "n/a" : Math.round(v * 100) + "%"; }
  function fmtDate(iso) {
    var d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function safeUrl(u) { return typeof u === "string" && /^https:\/\//.test(u) ? u : null; }
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  function load(path) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      // tolerate a stray NaN (invalid JSON) from the price fetcher instead of losing the whole file
      return r.text().then(function (t) { return JSON.parse(t.replace(/:\s*NaN\b/g, ": null")); });
    });
  }

  function symbols() {
    var seen = {};
    state.preds.forEach(function (p) { seen[p.symbol] = true; });
    var pref = ["SPY", "QQQ", "IWM", "SMH", "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE", "XLC", "TLT", "GLD", "EFA", "EEM", "HYG", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "BRK.B", "LLY", "JNJ", "XOM", "WMT", "GE", "RTX", "LIN", "NEE", "PLD", "SLV", "IEF", "IBIT", "ORCL", "MU", "AMD", "XBI", "KRE", "ITB", "USO", "UNH", "V"];
    var all = Object.keys(seen);
    return pref.filter(function (s) { return seen[s]; }).concat(all.filter(function (s) { return pref.indexOf(s) < 0; }).sort());
  }
  function earningsIn(p) {
    var d = state.earnings && state.earnings.dates && state.earnings.dates[p.symbol];
    if (!d) return null;
    for (var i = 0; i < d.length; i++) if (d[i] > p.made_at && d[i] <= p.resolves_on) return d[i];
    return null;
  }
  function forSymbol(sym) { return state.preds.filter(function (p) { return p.symbol === sym; }); }
  function latestByHorizon(list) {
    var map = {};
    list.forEach(function (p) {
      var cur = map[p.horizon];
      if (!cur || p.made_at >= cur.made_at) map[p.horizon] = p;
    });
    return HORDER.filter(function (h) { return map[h]; }).map(function (h) { return map[h]; });
  }

  function makeScale(rows, centered) {
    var vals = [];
    rows.forEach(function (p) {
      vals.push(p.ai.low, p.ai.high, p.baseline.low, p.baseline.high, p.price_at_prediction);
      if (p.result) vals.push(p.result.close);
    });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    if (centered && rows.length === 1) {
      // symmetric around the start price so it sits in the middle of the bar
      var c = rows[0].price_at_prediction, half = Math.max(c - lo, hi - c);
      lo = c - half; hi = c + half;
    }
    var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { if ((hi - lo) / steps[i] <= 6) { step = steps[i]; break; } }
    var ticks = [];
    for (var t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    return { lo: lo, hi: hi, ticks: ticks };
  }
  function pos(sc, v) { return ((v - sc.lo) / (sc.hi - sc.lo) * 100).toFixed(2) + "%"; }
  function wid(sc, a, b) { return ((b - a) / (sc.hi - sc.lo) * 100).toFixed(2) + "%"; }

  function watchList() {
    try { var a = JSON.parse(localStorage.getItem("ol-watch") || "[]"); return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string"; }) : []; } catch (e) { return []; }
  }
  function saveWatch(a) { try { localStorage.setItem("ol-watch", JSON.stringify(a)); } catch (e) {} }
  function toggleWatch(sym) {
    var a = watchList(), i = a.indexOf(sym);
    if (i >= 0) a.splice(i, 1); else a.push(sym);
    saveWatch(a);
  }
  function syncStar() {
    var b = $("sym-star");
    if (!state.symbol) { b.hidden = true; return; }
    var on = watchList().indexOf(state.symbol) >= 0;
    b.hidden = false;
    b.textContent = on ? "★ Watching" : "☆ Watch";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.title = on ? "Stop watching " + state.symbol : "Watch " + state.symbol + ": it shows under Overview, Watching (saved in this browser only)";
  }
  function renderMethod() {
    var host = $("method-body");
    if (state.methodLoaded) return;
    state.methodLoaded = true;
    fetch("methodology.html", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) {
      var doc = new DOMParser().parseFromString(t, "text/html");
      var card = doc.querySelector("main .card");
      if (!card) throw new Error("no content");
      clear(host);
      Array.prototype.slice.call(card.childNodes).forEach(function (n) { host.appendChild(document.importNode(n, true)); });
    }).catch(function () {
      state.methodLoaded = false;
      clear(host);
      var p = el("p", "Could not load this page here. "); var a = el("a", "Open the methodology page"); a.href = "methodology.html"; p.appendChild(a);
      host.appendChild(p);
    });
  }

  function renderTabs() {
    var nav = $("tabs");
    clear(nav);
    var syms = symbols();
    var home = el("a", "Overview"); home.href = "#home";
    if (!state.symbol && !state.view) home.setAttribute("aria-current", "page");
    nav.appendChild(home);
    var sc = el("a", "Scorecard"); sc.href = "#scorecard";
    if (state.view === "scorecard") sc.setAttribute("aria-current", "page");
    nav.appendChild(sc);
    var pd = el("a", "Predictions"); pd.href = "#predictions";
    if (state.view === "predictions") pd.setAttribute("aria-current", "page");
    nav.appendChild(pd);
    var an = el("a", "Analysis"); an.href = "#analysis";
    if (state.view === "analysis") an.setAttribute("aria-current", "page");
    nav.appendChild(an);
    var me = el("a", "Methodology"); me.href = "#methodology";
    if (state.view === "methodology") me.setAttribute("aria-current", "page");
    nav.appendChild(me);

    var wrap = el("div", undefined, "symmenu");
    var btn = el("button", state.symbol ? state.symbol : "Symbols"); btn.type = "button"; btn.className = "symbtn";
    btn.appendChild(el("span", "\u25BE", "caret"));
    btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    if (state.symbol) btn.setAttribute("aria-current", "page");
    var panel = el("div", undefined, "sympanel"); panel.hidden = true;
    var input = el("input"); input.type = "search"; input.placeholder = "Find a symbol or company"; input.setAttribute("aria-label", "Find a symbol or company");
    panel.appendChild(input);
    var groups = el("div", undefined, "symgroups");
    var labels = { index: "Indexes", sector: "Sectors", other: "Bonds and commodities", stock: "Stocks" };
    var order = ["index", "sector", "stock", "other"], links = [];
    order.forEach(function (g) {
      var members = syms.filter(function (x) { return groupOf(x) === g; });
      if (!members.length) return;
      var box = el("div", undefined, "symgroup");
      box.appendChild(el("h4", labels[g]));
      var grid = el("div", undefined, "symgrid");
      members.forEach(function (x) {
        var a = el("a"); a.href = "#" + x;
        a.appendChild(el("b", x)); a.appendChild(el("span", NAMES[x] || ""));
        if (x === state.symbol) a.setAttribute("aria-current", "page");
        grid.appendChild(a); links.push(a);
      });
      box.appendChild(grid); groups.appendChild(box);
    });
    var none = el("p", "No match. Try a ticker like SPY or a name like Apple.", "symnone"); none.hidden = true;
    groups.appendChild(none);
    panel.appendChild(groups);
    function setOpen(open) {
      panel.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { input.value = ""; filter(); input.focus(); }
    }
    function filter() {
      var q = input.value.trim().toLowerCase(), shown = 0;
      links.forEach(function (a) {
        var hit = !q || a.textContent.toLowerCase().indexOf(q) >= 0;
        a.hidden = !hit; if (hit) shown++;
      });
      [].forEach.call(groups.querySelectorAll(".symgroup"), function (g) { g.hidden = !g.querySelector("a:not([hidden])"); });
      none.hidden = shown > 0;
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(panel.hidden); });
    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var f = links.filter(function (a) { return !a.hidden; })[0]; if (f) { location.hash = f.getAttribute("href"); } }
    });
    panel.addEventListener("click", function (e) { e.stopPropagation(); if (e.target.closest && e.target.closest("a")) setOpen(false); });
    wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") { setOpen(false); btn.focus(); } });
    wrap.appendChild(btn); wrap.appendChild(panel);
    nav.appendChild(wrap);
    state.closeMenu = function () { if (!panel.hidden) setOpen(false); };

    if (state.symbol) {
      var i = syms.indexOf(state.symbol);
      var stepper = el("span", undefined, "symstep");
      [[-1, "\u2039", "Previous symbol"], [1, "\u203A", "Next symbol"]].forEach(function (d) {
        var t = syms[(i + d[0] + syms.length) % syms.length];
        var a = el("a", d[1]); a.href = "#" + t; a.setAttribute("aria-label", d[2] + ": " + t); a.title = d[2] + " (" + t + ")";
        stepper.appendChild(a);
      });
      nav.appendChild(stepper);
    }
  }
  document.addEventListener("click", function () { if (state.closeMenu) state.closeMenu(); });

  function renderHeader(rows) {
    $("sym-title").textContent = state.symbol;
    $("sym-name").textContent = NAMES[state.symbol] || "";
    var p = $("sym-price");
    var series = state.prices[state.symbol];
    var text = null, sub = null;
    if (series) {
      var dates = Object.keys(series).sort();
      if (dates.length) { text = money(series[dates[dates.length - 1]]); sub = "Close " + fmtDate(dates[dates.length - 1]); }
    }
    if (!text && rows.length) { text = money(rows[rows.length - 1].price_at_prediction); sub = "At prediction"; }
    clear(p);
    if (text) { p.appendChild(document.createTextNode(text)); p.appendChild(el("small", sub)); p.hidden = false; }
    else { p.hidden = true; }
  }


  function hpct(sc, v) { return ((v - sc.lo) / (sc.hi - sc.lo) * 100).toFixed(2) + "%"; }
  function homeCard(d, sc, hero) {
    var p = d.p, st = p.price_at_prediction;
    var a = el("a", undefined, "hcard" + (hero ? " hero" : ""));
    a.href = "#" + d.s;
    a.addEventListener("click", function () { state.fromHome = state.homeH; });
    var top = el("div", undefined, "hc-top");
    top.appendChild(el("b", d.s));
    top.appendChild(el("small", "from " + money(st)));
    a.appendChild(top);
    a.appendChild(el("div", NAMES[d.s] || "", "hc-name"));
    var bars = el("div", undefined, "bars");
    var lo = p.ai.low / st - 1, hi = p.ai.high / st - 1, bl = p.baseline.low / st - 1, bh = p.baseline.high / st - 1;
    var b1 = el("div", undefined, "bar-base"); b1.style.left = hpct(sc, bl); b1.style.width = ((bh - bl) / (sc.hi - sc.lo) * 100).toFixed(2) + "%";
    var b2 = el("div", undefined, "bar-ai"); b2.style.left = hpct(sc, lo); b2.style.width = ((hi - lo) / (sc.hi - sc.lo) * 100).toFixed(2) + "%";
    var z = el("div", undefined, "mark-today"); z.style.left = hpct(sc, 0);
    bars.appendChild(b1); bars.appendChild(b2); bars.appendChild(z);
    a.appendChild(bars);
    var nums = el("div", undefined, "hc-nums");
    var l = el("span"); var k = el("span", moveText(p.ai, st), "ai-k"); l.appendChild(k); l.appendChild(el("span", "  AI", "sub")); nums.appendChild(l);
    var up = p.ai.prob_up;
    if (up != null) nums.appendChild(el("span", pct(up) + " chance up", up >= 0.5 ? "up" : "down"));
    a.appendChild(nums);
    nums.appendChild(el("span", "Baseline " + moveText(p.baseline, st), "sub"));
    if (hero) {
      var cs = el("div", undefined, "hc-cases");
      [["bull", "Bull case", "up"], ["bear", "Bear case", "down"]].forEach(function (c) {
        var it = (p.catalysts && p.catalysts[c[0]] || [])[0];
        if (!it) return;
        var box = el("div"); box.appendChild(el("b", c[1], c[2])); box.appendChild(document.createTextNode(it.text)); cs.appendChild(box);
      });
      if (cs.childNodes.length) a.appendChild(cs);
    }
    return a;
  }

  function squarify(items, x, y, w, h) {
    var out = [], total = items.reduce(function (a, i) { return a + i.v; }, 0);
    var rest = items.map(function (i) { return { d: i.d, a: i.v / total * w * h }; });
    function worst(row, side) {
      var s = row.reduce(function (a, r) { return a + r.a; }, 0), mx = 0, mn = Infinity;
      row.forEach(function (r) { mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); });
      return Math.max(side * side * mx / (s * s), s * s / (side * side * mn));
    }
    while (rest.length) {
      var side = Math.min(w, h), row = [rest[0]], i = 1;
      while (i < rest.length && worst(row.concat([rest[i]]), side) <= worst(row, side)) { row.push(rest[i]); i++; }
      var s = row.reduce(function (a, r) { return a + r.a; }, 0), t = s / side, off = 0;
      row.forEach(function (r) {
        var l = r.a / t;
        if (w >= h) out.push({ d: r.d, x: x, y: y + off, w: t, h: l }); else out.push({ d: r.d, x: x + off, y: y, w: l, h: t });
        off += l;
      });
      if (w >= h) { x += t; w -= t; } else { y += t; h -= t; }
      rest = rest.slice(row.length);
    }
    return out;
  }
  function tileColor(up) {
    if (up == null) return "oklch(0.42 0.02 250)";
    var dev = Math.max(-1, Math.min(1, (up - 0.5) / 0.1));
    var a = Math.abs(dev);
    if (a < 0.06) return "oklch(0.44 0.03 250)";
    return "oklch(" + (0.44 + a * 0.06).toFixed(3) + " " + (0.04 + a * 0.1).toFixed(3) + " " + (dev > 0 ? 175 : 28) + ")";
  }
  function renderMap(data) {
    var host = $("home-map"); clear(host);
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    var items = data.map(function (d) {
      var st = d.p.price_at_prediction, width = (d.p.ai.high - d.p.ai.low) / st;
      var cap = state.meta && state.meta.market_cap && state.meta.market_cap[d.s];
      var v = state.homeSize === "equal" ? 1 : state.homeSize === "cap" && cap ? Math.sqrt(cap) : Math.max(width, 0.01);
      return { d: d, v: v };
    }).sort(function (a, b) { return b.v - a.v; });
    var mx = 0.05;
    data.forEach(function (d) { var st = d.p.price_at_prediction; mx = Math.max(mx, Math.abs(d.p.ai.low / st - 1), Math.abs(d.p.ai.high / st - 1)); });
    var first = !state.mapSeen; state.mapSeen = true;
    squarify(items, 0, 0, w, h).forEach(function (t, idx) {
      var d = t.d, p = d.p, st = p.price_at_prediction, up = p.ai.prob_up;
      var a = el("a", undefined, "tile" + (t.w < 100 || t.h < 84 ? " sm" : "") + (t.w < 44 || t.h < 30 ? " xs" : ""));
      a.href = "#" + d.s;
      a.addEventListener("click", function () { state.fromHome = state.homeH; });
      a.style.left = t.x + "px"; a.style.top = t.y + "px"; a.style.width = t.w + "px"; a.style.height = t.h + "px";
      a.style.background = tileColor(up);
      a.title = d.s + (NAMES[d.s] ? " \u2013 " + NAMES[d.s] : "") + ": " + (up != null ? pct(up) + " chance up; " : "") + "AI range " + moveText(p.ai, st);
      a.appendChild(el("b", d.s));
      a.appendChild(el("span", up != null ? pct(up) + " up" : ""));
      a.appendChild(el("span", moveText(p.ai, st)));
      if (NAMES[d.s] && t.w >= 110 && t.h >= 104) a.appendChild(el("span", NAMES[d.s], "nm"));
      var wk = el("div", undefined, "wk"); wk.setAttribute("aria-hidden", "true");
      var pos = function (v) { return Math.max(0, Math.min(100, (v / st - 1) / (2 * mx) * 100 + 50)); };
      var lo = pos(p.ai.low), hi = pos(p.ai.high);
      var tr = el("i"), zr = el("u"), br = el("s");
      zr.style.left = "50%"; br.style.left = lo + "%"; br.style.width = Math.max(2, hi - lo) + "%";
      wk.appendChild(tr); wk.appendChild(zr); wk.appendChild(br); a.appendChild(wk);
      if (first) { a.classList.add("enter"); a.style.animationDelay = Math.min(idx * 22, 500) + "ms"; }
      host.appendChild(a);
    });
  }

  function groupOf(s) {
    if (s === "SPY" || s === "QQQ" || s === "IWM") return "index";
    if (/^XL/.test(s) || s === "SMH" || s === "XBI" || s === "KRE" || s === "ITB") return "sector";
    if (s === "EFA" || s === "EEM") return "intl";
    if (s === "TLT" || s === "IEF" || s === "HYG" || s === "GLD" || s === "SLV" || s === "USO" || s === "IBIT") return "other";
    return "stock";
  }
  function seg2(host, opts, key, after) {
    clear(host);
    opts.forEach(function (o) {
      var b = el("button", o[1]); b.type = "button";
      b.setAttribute("aria-pressed", state[key] === o[0] ? "true" : "false");
      b.addEventListener("click", function () { state[key] = o[0]; after(); });
      host.appendChild(b);
    });
  }
  function svgEl(name, attrs, cls) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (cls) n.setAttribute("class", cls);
    return n;
  }
  function dayNum(iso) { return Math.round(Date.parse(iso + "T00:00:00Z") / 86400000); }
  function niceTicks(lo, hi, n) {
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
    var step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }
  var SHORT = { "1w": "1W", "1m": "1M", "3m": "3M", "6m": "6M", "1y": "1Y", "5y": "5Y" };
  function cssRgb(name, a) {
    var probe = document.createElement("span"); probe.style.color = "var(" + name + ")"; document.body.appendChild(probe);
    var col = getComputedStyle(probe).color; document.body.removeChild(probe);
    var c = document.createElement("canvas"); c.width = c.height = 1;
    var x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = col; x.fillRect(0, 0, 1, 1);
    var d = x.getImageData(0, 0, 1, 1).data;
    return "rgba(" + d[0] + "," + d[1] + "," + d[2] + "," + (a == null ? 1 : a) + ")";
  }
  function isoOf(d) { return new Date(d * 86400000).toISOString().slice(0, 10); }
  function BandPrimitive(chart, hiSeries, loSeries, hiPts, loPts, fill) {
    var self = this;
    this._views = [{
      zOrder: function () { return "bottom"; },
      renderer: function () {
        return { draw: function (target) {
          target.useMediaCoordinateSpace(function (scope) {
            var ctx = scope.context, ts = chart.timeScale(), up = [], dn = [], i, x, y;
            for (i = 0; i < hiPts.length; i++) {
              x = ts.timeToCoordinate(hiPts[i].time); y = hiSeries.priceToCoordinate(hiPts[i].value);
              if (x === null || y === null) continue; up.push([x, y]);
              y = loSeries.priceToCoordinate(loPts[i].value); if (y !== null) dn.push([x, y]);
            }
            if (up.length < 2 || dn.length < 2) return;
            ctx.beginPath(); ctx.moveTo(up[0][0], up[0][1]);
            for (i = 1; i < up.length; i++) ctx.lineTo(up[i][0], up[i][1]);
            for (i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
            ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
          });
        } };
      }
    }];
  }
  BandPrimitive.prototype.paneViews = function () { return this._views; };
  BandPrimitive.prototype.updateAllViews = function () {};

  function renderChart(rows) {
    if (!window.LightweightCharts) { renderChartSvg(rows); return; }
    state.lastRows = rows;
    var LW = window.LightweightCharts;
    var candleMap = null, chart, lastApply = 0, lastTouch = 0, applyWin, controls, keep = state.keepRange; state.keepRange = null;
    var host = $("chart"); clear(host);
    if (state.tv) { try { state.tv.remove(); } catch (e) {} state.tv = null; }
    var cone = rows.slice().sort(function (a, b) { return a.resolves_on < b.resolves_on ? -1 : 1; });
    if (!cone.length) return;
    var base = cone[0], t0 = dayNum(base.made_at), s0 = base.price_at_prediction;
    var span = dayNum(cone[cone.length - 1].resolves_on) - t0;
    var back = 1900;
    var series = state.prices[state.symbol] || {}, keys = Object.keys(series).sort();
    var histData = keys.filter(function (d) { return dayNum(d) >= t0 - back && d <= base.made_at; }).map(function (d) { return { time: d, value: series[d] }; });
    var afterData = keys.filter(function (d) { return d > base.made_at; }).map(function (d) { return { time: d, value: series[d] }; });
    if (!histData.length || histData[histData.length - 1].time !== base.made_at) histData.push({ time: base.made_at, value: s0 });
    function curveAt(get, d) {
      var anchors = [[0, 0]].concat(cone.map(function (p) { return [Math.sqrt(dayNum(p.resolves_on) - t0), Math.log(get(p) / s0)]; }));
      var r = Math.sqrt(d), k = 1;
      while (k < anchors.length - 1 && r > anchors[k][0]) k++;
      var a0 = anchors[k - 1], a1 = anchors[k], u = a1[0] === a0[0] ? 0 : (r - a0[0]) / (a1[0] - a0[0]);
      return s0 * Math.exp(a0[1] + (a1[1] - a0[1]) * u);
    }
    function curveFor(batch, bt0, bs0) {
      var anchors = [[0, 0]].concat(batch.map(function (p) { return [Math.sqrt(dayNum(p.resolves_on) - bt0), 0, p]; }));
      return function (get, d) {
        var an = [[0, 0]].concat(batch.map(function (p) { return [Math.sqrt(dayNum(p.resolves_on) - bt0), Math.log(get(p) / bs0)]; }));
        var r = Math.sqrt(d), k = 1;
        while (k < an.length - 1 && r > an[k][0]) k++;
        var a0 = an[k - 1], a1 = an[k], u = a1[0] === a0[0] ? 0 : (r - a0[0]) / (a1[0] - a0[0]);
        return bs0 * Math.exp(a0[1] + (a1[1] - a0[1]) * u);
      };
    }
    var days = [0], dd;
    for (dd = 1; dd <= span; dd++) { var wd = new Date((t0 + dd) * 86400000).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(dd); }
    if (days[days.length - 1] !== span) days.push(span);
    function build(get) { return days.map(function (d) { return { time: isoOf(t0 + d), value: Math.round(curveAt(get, d) * 100) / 100 }; }); }
    var aiHi = build(function (p) { return p.ai.high; }), aiLo = build(function (p) { return p.ai.low; });
    var bHi = build(function (p) { return p.baseline.high; }), bLo = build(function (p) { return p.baseline.low; });

    var ink = cssRgb("--ink"), muted = cssRgb("--muted"), card = cssRgb("--card"), accent = cssRgb("--accent"), line = cssRgb("--line-2");
    var box = document.createElement("div"); box.className = "tvbox";
    box.style.height = (host.clientWidth < 560 ? 320 : 420) + "px";
    var legend = document.createElement("div"); legend.className = "tvlegend";
    host.appendChild(box); host.appendChild(legend);
    chart = LW.createChart(box, {
      autoSize: true,
      layout: { background: { type: "solid", color: card }, textColor: muted, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { color: line } },
      rightPriceScale: { borderVisible: false, mode: state.chartLog ? LW.PriceScaleMode.Logarithmic : LW.PriceScaleMode.Normal, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderVisible: false, rightOffset: 2, timeVisible: false, minBarSpacing: 0.05, fixLeftEdge: false, fixRightEdge: false },
      crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: muted, style: 3, width: 1, labelBackgroundColor: ink }, horzLine: { color: muted, style: 3, width: 1, labelBackgroundColor: ink } }
    });
    state.tv = chart;
    ["wheel", "pointerdown", "touchstart", "touchmove", "keydown"].forEach(function (ev) { box.addEventListener(ev, function () { lastTouch = Date.now(); }, { passive: true }); });
    function lineOpts(color, width, style, last) {
      return { color: color, lineWidth: width, lineStyle: style, lastValueVisible: !!last, priceLineVisible: false, crosshairMarkerVisible: false };
    }
    var sBHi = chart.addSeries(LW.LineSeries, lineOpts(cssRgb("--muted", 0.75), 1, 2, false));
    var sBLo = chart.addSeries(LW.LineSeries, lineOpts(cssRgb("--muted", 0.75), 1, 2, false));
    var sHi = chart.addSeries(LW.LineSeries, lineOpts(accent, 2, 0, false));
    var sLo = chart.addSeries(LW.LineSeries, lineOpts(accent, 2, 0, false));
    var sHist = chart.addSeries(LW.AreaSeries, { lineColor: ink, lineWidth: 2, topColor: cssRgb("--ink", 0.16), bottomColor: cssRgb("--ink", 0.0), priceLineVisible: true, priceLineStyle: 3, priceLineColor: muted, crosshairMarkerRadius: 4 });
    sBHi.setData(bHi); sBLo.setData(bLo); sHi.setData(aiHi); sLo.setData(aiLo);
    sHist.setData(histData.concat(afterData));
    sBHi.attachPrimitive(new BandPrimitive(chart, sBHi, sBLo, bHi, bLo, cssRgb("--muted", 0.16)));
    sHi.attachPrimitive(new BandPrimitive(chart, sHi, sLo, aiHi, aiLo, cssRgb("--accent", 0.28)));
    var dotsHi = [], dotsLo = [];
    // label each horizon end with its % distance from the current (latest close) price
    var lcNow = latestClose(state.symbol), refPx = lcNow ? lcNow.price : s0;
    cone.forEach(function (p) {
      dotsHi.push({ time: p.resolves_on, position: "aboveBar", shape: "circle", color: accent, size: 0.7, text: signed((p.ai.high / refPx - 1) * 100) });
      dotsLo.push({ time: p.resolves_on, position: "belowBar", shape: "circle", color: accent, size: 0.7, text: signed((p.ai.low / refPx - 1) * 100) });
    });
    LW.createSeriesMarkers(sHi, dotsHi); LW.createSeriesMarkers(sLo, dotsLo);
    // earlier forecasts: faint bands from each earlier prediction date (up to 8 batches)
    var ghostOn = state.chartGhosts !== false, evOn = state.chartEvents !== false, candleOn = !!state.chartCandles && !!state.ohlc && !!state.ohlc[state.symbol];
    var nGhost = 0;
    if (ghostOn) {
      var allSym = forSymbol(state.symbol), byDate = {};
      allSym.forEach(function (p) { if (p.made_at < base.made_at) (byDate[p.made_at] = byDate[p.made_at] || []).push(p); });
      Object.keys(byDate).sort().slice(-8).forEach(function (md) {
        var batch = byDate[md].slice().sort(function (x, y) { return x.resolves_on < y.resolves_on ? -1 : 1; });
        var gt0 = dayNum(md), gs0 = batch[0].price_at_prediction, gspan = dayNum(batch[batch.length - 1].resolves_on) - gt0;
        var cf = curveFor(batch, gt0, gs0), gdays = [0], gi;
        for (gi = 1; gi <= gspan; gi++) { var gw = new Date((gt0 + gi) * 86400000).getUTCDay(); if (gw !== 0 && gw !== 6) gdays.push(gi); }
        if (gdays[gdays.length - 1] !== gspan) gdays.push(gspan);
        function gb(get) { return gdays.map(function (d) { return { time: isoOf(gt0 + d), value: Math.round(cf(get, d) * 100) / 100 }; }); }
        var gHi = gb(function (p) { return p.ai.high; }), gLo = gb(function (p) { return p.ai.low; });
        var o = lineOpts("rgba(0,0,0,0)", 1, 0, false); o.lineVisible = false;
        var s1 = chart.addSeries(LW.LineSeries, o), s2 = chart.addSeries(LW.LineSeries, o);
        s1.setData(gHi); s2.setData(gLo);
        s1.attachPrimitive(new BandPrimitive(chart, s1, s2, gHi, gLo, cssRgb("--accent", 0.09)));
        nGhost++;
      });
    }
    // markers: resolved outcomes on the price line, events on an invisible helper line
    var outMarks = [];
    forSymbol(state.symbol).forEach(function (p) {
      if (p.status !== "resolved" || !p.result || !p.result.close_date) return;
      var held = p.result.ai && p.result.ai.result === "held";
      outMarks.push({ time: p.result.close_date, position: "inBar", shape: "circle", color: held ? cssRgb("--ok") : cssRgb("--bad"), size: 1.1 });
    });
    outMarks.sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; });
    var evs = evOn ? (state.events || []).filter(function (e) {
      return e.type !== "watch" && e.date && appliesTo(e, state.symbol) && e.kind !== "market";
    }) : [];
    var evByDay = {};
    var priceDays = {}; histData.concat(afterData).forEach(function (q) { priceDays[q.time] = q.value; });
    function snapIso(d) { var n = dayNum(d), g = 0; while (g++ < 4) { var w = new Date(n * 86400000).getUTCDay(); if (w !== 0 && w !== 6) break; n += 1; } return isoOf(n); }
    evs.forEach(function (e) { var k = snapIso(e.date); (evByDay[k] = evByDay[k] || []).push(e); });
    var evDays = Object.keys(evByDay).sort(), evPts = [], evMarks = [];
    evDays.forEach(function (d) {
      var v = priceDays[d];
      if (v === undefined) { var h = aiHi.filter(function (q) { return q.time === d; })[0], l = aiLo.filter(function (q) { return q.time === d; })[0]; if (h && l) v = (h.value + l.value) / 2; }
      if (v === undefined) return;
      var shock = evByDay[d].some(function (e) { return e.kind === "shock"; });
      evPts.push({ time: d, value: v });
      evMarks.push({ time: d, position: "inBar", shape: "square", color: shock ? cssRgb("--bad", 0.9) : cssRgb("--ink", 0.45), size: 0.5 });
    });
    if (evPts.length) {
      var eo = lineOpts("rgba(0,0,0,0)", 1, 0, false); eo.lineVisible = false;
      var sEv = chart.addSeries(LW.LineSeries, eo); sEv.setData(evPts); LW.createSeriesMarkers(sEv, evMarks);
    }
    // Street target: one dot at about +12 months (targets are 12-month views). Not a range, not scored on the chart.
    var rt = state.ratings && state.ratings.symbols && state.ratings.symbols[state.symbol];
    var streetOk = !!(rt && rt.target && rt.target.mean && span >= 360), tgtDay = null, tgtTxt = "";
    if (streetOk && (state.chartStreet === undefined ? false : state.chartStreet)) {
      var tn = t0 + 365, tg;
      for (tg = 0; tg < 4; tg++) { var tw = new Date(tn * 86400000).getUTCDay(); if (tw !== 0 && tw !== 6) break; tn -= 1; }
      tgtDay = isoOf(tn);
      var tt = rt.target, noScale = function () { return null; };
      var sTg = chart.addSeries(LW.LineSeries, (function () { var o = lineOpts("rgba(0,0,0,0)", 1, 0, false); o.lineVisible = false; return o; })());
      sTg.setData([{ time: tgtDay, value: tt.mean }]);
      LW.createSeriesMarkers(sTg, [{ time: tgtDay, position: "inBar", shape: "circle", color: cssRgb("--ink"), size: 2, text: "Street $" + Math.round(tt.mean) }]);
      [["high", tt.high], ["low", tt.low]].forEach(function (x) {
        if (!x[1]) return;
        var o2 = lineOpts("rgba(0,0,0,0)", 1, 0, false); o2.lineVisible = false; o2.autoscaleInfoProvider = noScale;
        var sx = chart.addSeries(LW.LineSeries, o2); sx.setData([{ time: tgtDay, value: x[1] }]);
        LW.createSeriesMarkers(sx, [{ time: tgtDay, position: "inBar", shape: "square", color: cssRgb("--ink", 0.5), size: 0.6 }]);
      });
      tgtTxt = "Street (Yahoo Finance, " + fmtDate(rt.as_of) + "): mean " + money(tt.mean) + (tt.low && tt.high ? ", range " + money(tt.low) + " to " + money(tt.high) : "") + ". A 12-month view; context only, not an input to the forecast";
    }
    if (outMarks.length) LW.createSeriesMarkers(sHist, outMarks);
    if (candleOn) {
      var oh = state.ohlc[state.symbol], first = oh[0][0];
      sHist.setData(histData.concat(afterData).filter(function (q) { return q.time < first; }));
      var sCan = chart.addSeries(LW.CandlestickSeries, { upColor: cssRgb("--ok"), downColor: cssRgb("--bad"), borderVisible: false, wickUpColor: cssRgb("--ok"), wickDownColor: cssRgb("--bad"), priceLineVisible: true, priceLineStyle: 3, priceLineColor: muted, lastValueVisible: true });
      sCan.setData(oh.map(function (r) { return { time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] }; }));
      candleMap = {}; oh.forEach(function (r) { candleMap[r[0]] = r; });
    }
    var padDays = Math.max(6, Math.round(span * 0.06)), pad = [];
    for (dd = 1; dd <= padDays; dd++) { var w2 = new Date((t0 + span + dd) * 86400000).getUTCDay(); if (w2 !== 0 && w2 !== 6) pad.push({ time: isoOf(t0 + span + dd) }); }
    sHi.setData(aiHi.concat(pad));
    var firstDay = dayNum(histData[0].time), lastDay = t0 + span + padDays;
    function snapDay(d, dir) { var g = 0; while (g++ < 4) { var w = new Date(d * 86400000).getUTCDay(); if (w !== 0 && w !== 6) break; d += dir; } return d; }
    var PRESET = { "1m": [68, 31], "6m": [165, 183], "1y": [330, 365], "5y": [back, span] };
    applyWin = function (win) {
      var pr = PRESET[win]; if (!pr) return;
      var fwd = pr[1], fromD = Math.max(firstDay, t0 - pr[0]), toD = Math.min(lastDay, t0 + fwd + Math.max(6, Math.round(fwd * (tgtDay ? 0.11 : 0.06))));
      lastApply = Date.now();
      try { chart.timeScale().setVisibleRange({ from: isoOf(snapDay(fromD, 1)), to: isoOf(snapDay(toD, -1)) }); } catch (e) {}
      setTimeout(updateEnds, 80);
    };
    var endLines = [];
    function updateEnds() {
      endLines.forEach(function (h) { try { h[0].removePriceLine(h[1]); } catch (e) {} }); endLines = [];
      var r = chart.timeScale().getVisibleRange(); if (!r) return;
      var t = String(r.to), lastT = aiHi[aiHi.length - 1].time, k = 0;
      if (t > lastT) t = lastT;
      while (mAiHi[t] === undefined && k++ < 4) t = isoOf(dayNum(t) - 1);
      if (mAiHi[t] === undefined || t < base.made_at) return;
      [[sHi, mAiHi[t]], [sLo, mAiLo[t]]].forEach(function (x) {
        endLines.push([x[0], x[0].createPriceLine({ price: x[1], color: accent, lineVisible: false, axisLabelVisible: true, title: "" })]);
      });
    }
    controls = function () {
      seg2($("chart-pick"), [["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"], ["5y", "5 years"]], "chartWin", function () { applyWin(state.chartWin); controls(); });
      clear($("chart-tools"));
      var lg = el("button", "Log scale"); lg.type = "button"; lg.className = "logtoggle";
      lg.setAttribute("aria-pressed", state.chartLog ? "true" : "false");
      lg.addEventListener("click", function () {
        state.chartLog = !state.chartLog;
        chart.priceScale("right").applyOptions({ mode: state.chartLog ? LW.PriceScaleMode.Logarithmic : LW.PriceScaleMode.Normal });
        lg.setAttribute("aria-pressed", state.chartLog ? "true" : "false");
      });
      $("chart-tools").appendChild(lg);
      function tog(label, key, dflt, extra) {
        var on = state[key] === undefined ? dflt : state[key];
        var b = el("button", label); b.type = "button"; b.className = "logtoggle"; b.style.marginLeft = "6px";
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.addEventListener("click", function () {
          var rng = null; try { rng = chart.timeScale().getVisibleRange(); } catch (e) {}
          state[key] = !on;
          state.keepRange = rng && state.chartWin === null ? rng : null;
          if (extra) { extra(state[key], function () { renderChart(state.lastRows); }); } else renderChart(state.lastRows);
        });
        $("chart-tools").appendChild(b);
      }
      tog("Earlier forecasts", "chartGhosts", true);
      tog("Events", "chartEvents", true);
      if (streetOk) tog("Street target", "chartStreet", false);
      tog("Candles", "chartCandles", false, function (v, redraw) {
        if (!v || state.ohlc) { redraw(); return; }
        load("data/ohlc.json").then(function (d) { state.ohlc = d; redraw(); }).catch(function () { state.chartCandles = false; legend.textContent = "Candle data is not published yet. It appears after the next scheduled update."; });
      });
    };
    controls();

    var mapOf = function (arr) { var m = {}; arr.forEach(function (q) { m[q.time] = q.value; }); return m; };
    var mHist = mapOf(histData.concat(afterData)), mAiHi = mapOf(aiHi), mAiLo = mapOf(aiLo), mBHi = mapOf(bHi), mBLo = mapOf(bLo);
    var rangeTxt = function (a, b) { return "$" + a.toFixed(2) + " – $" + b.toFixed(2); };
    function setLegend(t) {
      var out = state.symbol + " · ";
      if (!t) { legend.textContent = out + "predicted " + fmtDate(base.made_at) + " at $" + s0.toFixed(2) + " · labels show % from " + (lcNow ? "latest close" : "start") + " $" + refPx.toFixed(2); return; }
      out += fmtDate(t);
      if (mHist[t] !== undefined && t <= base.made_at) out += " · close $" + mHist[t].toFixed(2);
      else if (mAiHi[t] !== undefined) out += " · AI " + rangeTxt(mAiLo[t], mAiHi[t]) + " (" + signed((mAiLo[t] / refPx - 1) * 100) + " to " + signed((mAiHi[t] / refPx - 1) * 100) + ") · baseline " + rangeTxt(mBLo[t], mBHi[t]) + (mHist[t] !== undefined ? " · actual $" + mHist[t].toFixed(2) : "");
      if (candleMap && candleMap[t]) { var r = candleMap[t]; out += " · O " + r[1].toFixed(2) + " H " + r[2].toFixed(2) + " L " + r[3].toFixed(2) + " C " + r[4].toFixed(2); }
      if (evByDay[t]) out += " · " + evByDay[t].map(function (e) { return e.title; }).join("; ");
      if (tgtDay && t === tgtDay) out += " · " + tgtTxt;
      legend.textContent = out;
    }
    setLegend(null);
    chart.subscribeCrosshairMove(function (param) { setLegend(param && param.time ? String(param.time) : null); });
    chart.timeScale().subscribeVisibleTimeRangeChange(function () {
      if (Date.now() - lastTouch < 1500 && Date.now() - lastApply > 300 && state.chartWin) { state.chartWin = null; controls(); }
      updateEnds();
    });
    applyWin(state.chartWin || "1m");
    if (keep) { try { chart.timeScale().setVisibleRange(keep); } catch (e) {} setTimeout(updateEnds, 80); }
  }

  function renderChartSvg(rows) {
    clear($("chart-tools"));
    seg2($("chart-pick"), [["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"], ["5y", "5 years"]], "chartWin", function () { renderChart(rows); });
    var lg = el("button", "Log scale"); lg.type = "button"; lg.className = "logtoggle";
    lg.setAttribute("aria-pressed", state.chartLog ? "true" : "false");
    lg.addEventListener("click", function () { state.chartLog = !state.chartLog; renderChart(rows); });
    $("chart-pick").appendChild(lg);
    var host = $("chart"); clear(host);
    var maxH = { "1m": 31, "6m": 190, "1y": 366, "5y": 1830 }[state.chartWin] || 31;
    var cone = rows.filter(function (p) { return dayNum(p.resolves_on) - dayNum(p.made_at) <= maxH + 1; })
      .sort(function (a, b) { return a.resolves_on < b.resolves_on ? -1 : 1; });
    if (!cone.length) return;
    var base = cone[0], t0 = dayNum(base.made_at), s0 = base.price_at_prediction;
    var span = dayNum(cone[cone.length - 1].resolves_on) - t0;
    var back = Math.max(45, Math.round(span * (state.chartWin === "1m" ? 2.2 : 0.9)));
    var series = state.prices[state.symbol] || {};
    var keys = Object.keys(series).sort();
    var hist = keys.filter(function (d) { return dayNum(d) >= t0 - back && d <= base.made_at; }).map(function (d) { return [dayNum(d), series[d]]; });
    var after = keys.filter(function (d) { return d > base.made_at; }).map(function (d) { return [dayNum(d), series[d]]; });
    var x0 = hist.length ? Math.min(hist[0][0], t0) : t0 - Math.round(span * 0.5), x1 = t0 + span + Math.round(span * 0.02);
    // smooth cone: log distance from today grows with sqrt(time), interpolated between the stored horizon ranges
    function curve(get) {
      var anchors = [[0, 0]].concat(cone.map(function (p) { return [Math.sqrt(dayNum(p.resolves_on) - t0), Math.log(get(p) / s0)]; }));
      var out = [];
      for (var i = 0; i <= 60; i++) {
        var d = span * i / 60, r = Math.sqrt(d), k = 1;
        while (k < anchors.length - 1 && r > anchors[k][0]) k++;
        var a0 = anchors[k - 1], a1 = anchors[k], u = a1[0] === a0[0] ? 0 : (r - a0[0]) / (a1[0] - a0[0]);
        out.push([t0 + d, s0 * Math.exp(a0[1] + (a1[1] - a0[1]) * u)]);
      }
      return out;
    }
    var aiHi = curve(function (p) { return p.ai.high; }), aiLo = curve(function (p) { return p.ai.low; });
    var bHi = curve(function (p) { return p.baseline.high; }), bLo = curve(function (p) { return p.baseline.low; });
    var dr = cone.filter(function (p) { return p.baseline_drift; }).length === cone.length;
    var dHi = dr ? curve(function (p) { return p.baseline_drift.high; }) : null, dLo = dr ? curve(function (p) { return p.baseline_drift.low; }) : null;
    var all = [];
    [aiHi, aiLo, bHi, bLo].forEach(function (c) { c.forEach(function (pt) { all.push(pt[1]); }); });
    hist.concat(after).forEach(function (pt) { all.push(pt[1]); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    var W = 720, H = 372, L = 8, R = 70, T = 16, B = 48, PW = W - L - R;
    function X(d) { return L + (d - x0) / (x1 - x0) * PW; }
    var useLog = state.chartLog && lo > 0, llo = Math.log(Math.max(lo, 0.01)), lhi = Math.log(hi);
    function Y(v) { return useLog ? T + (lhi - Math.log(v)) / (lhi - llo) * (H - T - B) : T + (hi - v) / (hi - lo) * (H - T - B); }
    function logTicks() {
      var out = [], k = Math.floor(Math.log(lo) / Math.LN10) - 1;
      for (; Math.pow(10, k) <= hi; k++) [1, 2, 3, 4, 5, 6, 8].forEach(function (m) { var v = m * Math.pow(10, k); if (v >= lo && v <= hi) out.push(v); });
      return out.length > 8 ? out.filter(function (v, i) { return i % 2 === 0; }) : out;
    }
    function money0(v) { return "$" + (v >= 100 ? v.toFixed(0) : v.toFixed(2)); }
    function pts(arr) { return arr.map(function (pt) { return X(pt[0]).toFixed(1) + "," + Y(pt[1]).toFixed(1); }).join(" "); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
    svg.setAttribute("aria-label", state.symbol + " price history with the AI forecast range for the next " + (HLABEL[state.chartWin] || "month") + ", from " + money0(Math.min.apply(null, aiLo.map(function (q) { return q[1]; }))) + " to " + money0(Math.max.apply(null, aiHi.map(function (q) { return q[1]; }))));
    var endYs = [Y(Math.max.apply(null, aiHi.map(function (q) { return q[1]; }))), Y(Math.min.apply(null, aiLo.map(function (q) { return q[1]; })))];
    (useLog ? logTicks() : niceTicks(lo, hi, 5)).forEach(function (v) {
      var y = Y(v), near = endYs.some(function (e) { return Math.abs(e - y) < 20; });
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y }, "gridl"));
      if (near) return;
      var tx = svgEl("text", { x: W - R + 8, y: y + 4 }, "ylab"); tx.textContent = "$" + (v >= 100 ? v.toFixed(0) : v.toFixed(1)); svg.appendChild(tx);
    });
    // time axis: month ticks
    var dt0 = new Date(x0 * 86400000), mt = new Date(Date.UTC(dt0.getUTCFullYear(), dt0.getUTCMonth() + 1, 1));
    var step = (x1 - x0) > 1400 ? 12 : (x1 - x0) > 600 ? 6 : (x1 - x0) > 300 ? 3 : 1, cnt = 0;
    for (; mt.getTime() / 86400000 < x1; mt = new Date(Date.UTC(mt.getUTCFullYear(), mt.getUTCMonth() + 1, 1)), cnt++) {
      if (cnt % step) continue;
      var xd = mt.getTime() / 86400000;
      if (Math.abs(X(xd) - X(t0)) < 40 || X(xd) < L + 24) continue;
      svg.appendChild(svgEl("line", { x1: X(xd), x2: X(xd), y1: H - B, y2: H - B + 4 }, "axis"));
      var mx = svgEl("text", { x: X(xd), y: H - B + 17, "text-anchor": "middle" }, "xlab");
      mx.textContent = mt.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + ((x1 - x0) > 300 || mt.getUTCMonth() === 0 ? " ’" + String(mt.getUTCFullYear()).slice(2) : ""); svg.appendChild(mx);
    }
    // future region
    svg.appendChild(svgEl("rect", { x: X(t0), y: T, width: W - R - X(t0), height: H - T - B }, "future"));
    svg.appendChild(svgEl("polygon", { points: pts(bHi.concat(bLo.slice().reverse())) }, "cone-base"));
    svg.appendChild(svgEl("polygon", { points: pts(aiHi.concat(aiLo.slice().reverse())) }, "cone-ai"));
    svg.appendChild(svgEl("polyline", { points: pts(aiHi) }, "edge-ai"));
    svg.appendChild(svgEl("polyline", { points: pts(aiLo) }, "edge-ai"));
    if (dr) { svg.appendChild(svgEl("polyline", { points: pts(dHi) }, "cone-drift")); svg.appendChild(svgEl("polyline", { points: pts(dLo) }, "cone-drift")); }
    var line = hist.concat(after);
    if (line.length > 1) svg.appendChild(svgEl("polyline", { points: pts(line) }, "hist"));
    // horizon markers
    cone.forEach(function (p) {
      var d = dayNum(p.resolves_on), xh = X(d);
      [p.ai.high, p.ai.low].forEach(function (v) { svg.appendChild(svgEl("circle", { cx: xh, cy: Y(v), r: 3 }, "hdot")); });
      if (xh - X(t0) > 90) {
        var ht = svgEl("text", { x: xh, y: H - 6, "text-anchor": "end" }, "hlab"); ht.textContent = HLABEL[p.horizon] || p.horizon; svg.appendChild(ht);
      }
    });
    var lastP = cone[cone.length - 1];
    [lastP.ai.high, lastP.ai.low].forEach(function (v) {
      var lt = svgEl("text", { x: W - R + 8, y: Y(v) + 4 }, "endlab"); lt.textContent = money0(v); svg.appendChild(lt);
    });
    svg.appendChild(svgEl("line", { x1: X(t0), x2: X(t0), y1: T, y2: H - B }, "todayl"));
    svg.appendChild(svgEl("circle", { cx: X(t0), cy: Y(s0), r: 4 }, "start"));
    var st0 = svgEl("text", { x: X(t0) - 8, y: T + 12, "text-anchor": "end" }, "startlab"); st0.textContent = "Predicted " + fmtDate(base.made_at) + " at " + money0(s0); svg.appendChild(st0);
    host.appendChild(svg);
  }

  function renderScorecard() {
    var s = state.summary || {}, nRes = s.n_resolved || 0, need = s.min_resolved_for_comparison || 10;
    var ready = !!s.comparison_ready;
    $("sc-updated").textContent = s.generated_at ? "Scores updated " + fmtDate(s.generated_at.slice(0, 10)) : "";
    var pg = $("sc-progress"); clear(pg);
    pg.appendChild(el("p", ready ? nRes + " predictions have resolved, enough for a first comparison. It is still a small sample, so differences are noise until the count is much larger."
      : nRes + " of " + need + " predictions resolved. The comparison below unlocks at " + need + "; until then it is a preview of zeros and blanks, not evidence."));
    var bar = el("div", undefined, "sc-bar"); var f = el("i"); f.style.width = Math.min(100, nRes / need * 100) + "%"; bar.appendChild(f); pg.appendChild(bar);
    pg.appendChild(el("p", state.preds.length + " predictions total, " + (s.n_open != null ? s.n_open : state.preds.length - nRes) + " still open.", "sc-note"));
    pg.appendChild(el("p", "Read the count with care: predictions made in the same week for different symbols move together, so they are not independent tests. The number of truly independent weeks, not the number of rows, is what sets how much to trust a result.", "sc-note"));

    var names = [["ai", "AI range"], ["baseline", "Implied-vol baseline"], ["baseline_drift", "Drift baseline (6%/yr)"], ["baseline_realized", "Realized-vol baseline (60d)"], ["baseline_analyst", "Analyst-target baseline (Street)"]];
    var cols = [["coverage", "Held (target 80%)", function (v) { return pct(v); }, null],
      ["mean_width_pct", "Avg width", function (v) { return v == null ? "\u2014" : v.toFixed(1) + "%"; }, null],
      ["mean_interval_score", "Interval score", function (v) { return v == null ? "\u2014" : v.toFixed(3); }, "min"],
      ["mean_brier_up", "Brier (up)", function (v) { return v == null ? "\u2014" : v.toFixed(3); }, "min"]];
    var host = $("sc-table"); clear(host);
    var o = s.overall || {};
    var t = el("table", undefined, "sc-tbl" + (ready ? "" : " preview"));
    var hr = el("tr"); hr.appendChild(el("th", "")); cols.forEach(function (c) { hr.appendChild(el("th", c[1])); }); t.appendChild(hr);
    var best = {};
    cols.forEach(function (c) {
      if (c[3] !== "min") return;
      var m = null; names.forEach(function (n) { var g = o[n[0]]; if (g && g[c[0]] != null && (m === null || g[c[0]] < m)) m = g[c[0]]; });
      best[c[0]] = m;
    });
    names.forEach(function (n) {
      var g = o[n[0]]; var tr = el("tr"); tr.appendChild(el("td", n[1]));
      cols.forEach(function (c) {
        var v = g ? g[c[0]] : null; var td = el("td", v == null ? "\u2014" : c[2](v));
        if (ready && v != null && best[c[0]] === v && c[3] === "min") td.className = "best";
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    host.appendChild(t);
    host.appendChild(el("p", "Interval score and width are divided by the start price so symbols compare; lower is better. Brier scores the chance-up number (0.25 is what 50/50 earns; lower is better). The baselines have no view: the implied-vol baseline centers on today's price, the drift baseline assumes a 6% yearly rise, and the realized-vol baseline uses the last 60 trading days instead of options. For Brier, the implied-vol and realized-vol baselines say 50/50; the drift baseline says whatever chance of finishing up its own 6% drift implies, so it is the directional benchmark the AI's chance-up has to beat. A coverage far above 80% means the range is too wide to be useful, far below means overconfident.", "sc-note"));

    var cov = $("sc-cov"); clear(cov);
    var wrap = el("div", undefined, "cal"), bh = s.by_horizon || {};
    HORDER.forEach(function (h) {
      var g = bh[h], total = state.preds.filter(function (p) { return p.horizon === h; }).length;
      if (!total) return;
      var box = el("div");
      box.appendChild(el("b", g && g.ai && g.ai.coverage != null ? pct(g.ai.coverage) : "\u2014"));
      box.appendChild(el("span", HLABEL[h]));
      var b = el("div", undefined, "covbar");
      if (g && g.ai && g.ai.coverage != null) { var ff = el("i"); ff.style.width = (g.ai.coverage * 100) + "%"; b.appendChild(ff); }
      var tg = el("u"); tg.style.left = "80%"; b.appendChild(tg);
      box.appendChild(b);
      box.appendChild(el("small", (g ? g.n : 0) + " of " + total + " resolved"));
      wrap.appendChild(box);
    });
    cov.appendChild(wrap);

    var rel = $("sc-rel"); clear(rel);
    var bins = (s.calibration || []), W = 300, H = 300, pad = 44;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Reliability diagram: stated chance up versus how often price finished up" });
    svg.style.maxWidth = "340px";
    function X(v) { return pad + v * (W - pad - 22); }
    function Y(v) { return H - pad - v * (H - pad - 10); }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      svg.appendChild(svgEl("line", { x1: X(0), x2: X(1), y1: Y(v), y2: Y(v), stroke: "var(--line-2)" }));
      var tx = svgEl("text", { x: pad - 6, y: Y(v) + 3, "text-anchor": "end", "font-size": 10, fill: "var(--muted)" }); tx.textContent = Math.round(v * 100) + "%"; svg.appendChild(tx);
      var tx2 = svgEl("text", { x: X(v), y: H - pad + 14, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }); tx2.textContent = Math.round(v * 100) + "%"; svg.appendChild(tx2);
    });
    svg.appendChild(svgEl("line", { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: "var(--muted)", "stroke-dasharray": "4 4" }));
    var pts = bins.filter(function (b) { return b.n; });
    if (pts.length > 1) svg.appendChild(svgEl("polyline", { points: pts.map(function (b) { return X(b.mean_prob) + "," + Y(b.freq_up); }).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2 }));
    pts.forEach(function (b) { svg.appendChild(svgEl("circle", { cx: X(b.mean_prob), cy: Y(b.freq_up), r: Math.min(12, 4 + b.n), fill: "var(--accent)", "fill-opacity": 0.7 })); });
    var ax = svgEl("text", { x: W / 2, y: H - 4, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)" }); ax.textContent = "AI's stated chance up"; svg.appendChild(ax);
    var ay = svgEl("text", { x: 8, y: H / 2, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", transform: "rotate(-90 8 " + (H / 2) + ")" }); ay.textContent = "How often it finished up"; svg.appendChild(ay);
    rel.appendChild(svg);
    rel.appendChild(el("p", pts.length ? "Dots on the dashed line mean the stated chances were honest; bigger dots hold more predictions. With few predictions per dot, treat gaps as noise."
      : "Nothing to plot yet. Each dot appears once predictions in that probability bin resolve; the dashed diagonal is perfect calibration.", "sc-note"));

    var bl = $("sc-blind"); clear(bl);
    var bb = s.by_blind || {}, nb = (bb.blind && bb.blind.n) || 0, nn = (bb.not_blind && bb.not_blind.n) || 0;
    bl.appendChild(el("p", (s.n_blind || 0) + " of " + state.preds.length + " predictions are blind (range committed publicly before the baseline was computed). Resolved so far: " + nb + " blind, " + nn + " not blind." +
      (nb ? " Blind coverage " + pct(bb.blind.ai && bb.blind.ai.coverage) + " vs " + (nn ? pct(bb.not_blind.ai && bb.not_blind.ai.coverage) : "n/a") + " not blind." : " Blind results will be the cleanest test once they exist; they start with the next weekly update."), "sc-note"));

    var due = $("sc-due"); clear(due);
    var by = {}; state.preds.filter(function (p) { return p.status !== "resolved"; }).forEach(function (p) { by[p.resolves_on] = (by[p.resolves_on] || 0) + 1; });
    var dd = el("div", undefined, "sc-due");
    Object.keys(by).sort().slice(0, 6).forEach(function (d) { var b = el("div"); b.appendChild(el("b", fmtDate(d))); b.appendChild(el("span", by[d] + (by[d] === 1 ? " prediction" : " predictions"))); dd.appendChild(b); });
    due.appendChild(dd);
  }

  function renderBrief() {
    var host = $("home-brief"); clear(host);
    var s = state.summary || {}, nTot = state.preds.length, nRes = s.n_resolved || 0;
    var dates = {}; state.preds.forEach(function (p) { dates[p.made_at] = true; });
    var ds = Object.keys(dates).sort(), last = ds[ds.length - 1];
    var ul = el("ul", undefined, "changes");
    function item(label, text, href, linkText) {
      var li = el("li"); li.appendChild(el("b", label));
      var sp = el("span", text + " ");
      if (href) { var a = el("a", linkText); a.href = href; sp.appendChild(a); }
      li.appendChild(sp); ul.appendChild(li);
    }
    if (last) {
      var batch = state.preds.filter(function (p) { return p.made_at === last; }), syms = {};
      batch.forEach(function (p) { syms[p.symbol] = true; });
      item("Latest", fmtDate(last) + ": " + batch.length + " predictions across " + Object.keys(syms).length + " symbols.", ds.length > 1 ? "#analysis" : null, "What changed →");
    }
    var open = state.preds.filter(function (p) { return p.status !== "resolved"; });
    var due = open.map(function (p) { return p.resolves_on; }).sort()[0];
    var cov = s.overall && s.overall.ai ? s.overall.ai.coverage : null;
    item("Scores", nRes
      ? nRes + " of " + nTot + " resolved; AI ranges held " + pct(cov) + " of the time (target 80%)."
      : "Nothing has resolved yet. The first come due " + (due ? fmtDate(due) : "soon") + "; the baseline comparison unlocks at " + (s.min_resolved_for_comparison || 10) + ".", "#scorecard", "Scorecard →");
    var nb = s.n_blind || 0;
    item("Blind", nb ? nb + " of " + nTot + " were locked publicly before the baseline was computed." : "None of the current predictions are blind, so beating the baseline counts for less.", "#methodology", "How it works →");
    var cutD = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    (state.events || []).filter(function (e) { return e.type === "shock" && e.date >= cutD; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3)
      .forEach(function (e) { item("Shock", dateLabel(e) + ": " + e.title); });
    host.appendChild(ul);
  }
  function renderHome() {
    var syms = symbols();
    var per = syms.map(function (s) { return { s: s, rows: latestByHorizon(forSymbol(s)) }; });
    var hs = HORDER.filter(function (h) { return per.some(function (d) { return d.rows.some(function (r) { return r.horizon === h; }); }); });
    if (hs.indexOf(state.homeH) < 0) state.homeH = hs.indexOf("1m") >= 0 ? "1m" : hs[0];
    var pick = $("home-pick"); clear(pick);
    hs.forEach(function (h) {
      var b = el("button", HLABEL[h]); b.type = "button";
      b.setAttribute("aria-pressed", h === state.homeH ? "true" : "false");
      b.addEventListener("click", function () { state.homeH = h; renderHome(); });
      pick.appendChild(b);
    });
    var data = per.map(function (d) { return { s: d.s, p: d.rows.filter(function (r) { return r.horizon === state.homeH; })[0] }; })
      .filter(function (d) { return d.p; });
    function seg(host, opts, key) {
      clear(host);
      opts.forEach(function (o) {
        var b = el("button", o[1]); b.type = "button";
        b.setAttribute("aria-pressed", state[key] === o[0] ? "true" : "false");
        b.addEventListener("click", function () { state[key] = o[0]; renderHome(); });
        host.appendChild(b);
      });
    }
    var watched = watchList().filter(function (x) { return syms.indexOf(x) >= 0; });
    if (state.homeGroup === "watch" && !watched.length) state.homeGroup = "all";
    if (!state.homeView) state.homeView = "map";
    if (!state.homeSize) state.homeSize = "width";
    seg($("home-view"), [["map", "Map"], ["cards", "Cards"]], "homeView");
    seg($("home-size"), [["width", "Size: AI range width"]].concat(state.meta && state.meta.market_cap ? [["cap", "Size: market value"]] : []).concat([["equal", "Size: equal"]]), "homeSize");
    seg2($("home-group"), [["all", "All"], ["index", "Broad indexes"], ["sector", "Sectors"], ["other", "Bonds & commodities"]].concat(per.some(function (d) { return groupOf(d.s) === "intl"; }) ? [["intl", "International"]] : []).concat(per.some(function (d) { return groupOf(d.s) === "stock"; }) ? [["stock", "Stocks"]] : []).concat(watched.length ? [["watch", "Watching (" + watched.length + ")"]] : []), "homeGroup", renderHome);
    seg2($("home-sort"), [["default", "Sort: default"], ["up", "Sort: chance up"], ["width", "Sort: widest range"]], "homeSort", renderHome);
    if (state.homeGroup === "watch") data = data.filter(function (d) { return watched.indexOf(d.s) >= 0; });
    else if (state.homeGroup !== "all") data = data.filter(function (d) { return groupOf(d.s) === state.homeGroup; });
    var hc = $("home-cmp");
    hc.hidden = !(state.homeGroup === "watch" && watched.length >= 2);
    if (!hc.hidden) hc.href = cmpLink(watched, state.homeH);
    var isMap = state.homeView === "map";
    $("home-sort").hidden = isMap;
    $("home-map").hidden = !isMap; $("home-scale").hidden = !isMap; $("home-size").hidden = !isMap;
    $("home-grid").hidden = isMap;
    if (isMap) renderMap(data);
    var vals = [0];
    data.forEach(function (d) { var st = d.p.price_at_prediction; vals.push(d.p.ai.low / st - 1, d.p.ai.high / st - 1, d.p.baseline.low / st - 1, d.p.baseline.high / st - 1); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.06;
    var sc = { lo: lo - pad, hi: hi + pad };
    var grid = $("home-grid"); clear(grid);
    function wd(d) { return (d.p.ai.high - d.p.ai.low) / d.p.price_at_prediction; }
    if (state.homeSort === "up") data.sort(function (x, y) { return (y.p.ai.prob_up || 0) - (x.p.ai.prob_up || 0); });
    else if (state.homeSort === "width") data.sort(function (x, y) { return wd(y) - wd(x); });
    else data.sort(function (x, y) { return (x.s === "SPY" ? 0 : 1) - (y.s === "SPY" ? 0 : 1); });
    var heroOn = state.homeSort === "default";
    data.forEach(function (d) { grid.appendChild(homeCard(d, sc, heroOn && d.s === "SPY")); });
    renderBrief();
    var today = todayIso();
    var ev = (state.events || []).filter(function (e) { return e.type === "scheduled" && (e.end_date || e.date) >= today; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).slice(0, 5);
    var ul = $("home-events"); clear(ul);
    ev.forEach(function (e) {
      var li = el("li"); li.appendChild(el("b", dateLabel(e)));
      var t = el("span", e.title); t.appendChild(el("small", "  " + (e.symbols ? e.symbols.join(", ") : "Whole market"), "muted"));
      li.appendChild(t); ul.appendChild(li);
    });
    if (!ev.length) ul.appendChild(el("li", "No scheduled events listed.", "muted"));
    var s = state.summary, r = $("home-record"); clear(r);
    r.appendChild(el("strong", "Track record:"));
    r.appendChild(document.createTextNode(s && s.n_total ? " " + s.n_resolved + " of " + s.n_total + " predictions have resolved." + (s.comparison_ready ? "" : " Too few to compare with the baseline yet.") : " no predictions yet."));
    $("home-updated").textContent = s && s.generated_at ? "Scores updated " + fmtDate(s.generated_at.slice(0, 10)) : "";
    var ea = state.earnings && state.earnings.as_of;
    if (ea && (Date.now() - Date.parse(ea + "T00:00:00Z")) / 864e5 > 8) $("home-updated").textContent += ". Earnings dates last checked " + fmtDate(ea) + ", so the earnings flag may be out of date.";
  }
  function signed(v) { return (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1) + "%"; }
  function latestClose(sym) {
    var m = state.prices[sym]; if (!m) return null;
    var ds = Object.keys(m).sort(); if (!ds.length) return null;
    return { date: ds[ds.length - 1], price: m[ds[ds.length - 1]] };
  }
  function lowHigh(r, base) { return "low " + signed((r.low / base - 1) * 100) + ", high " + signed((r.high / base - 1) * 100); }
  function moveText(r, start) { return signed((r.low / start - 1) * 100) + " to " + signed((r.high / start - 1) * 100); }

  function renderRows(rows) {
    var host = $("rows");
    clear(host);
    var anyClose = rows.some(function (p) { return p.result; });
    var legend = $("legend");
    clear(legend);
    [["sw-ai", "AI 80% range"], ["sw-base", "Baseline 80% range (volatility only, no view)"], ["sw-today", "Price at prediction"]]
      .concat(anyClose ? [["sw-close", "Close at horizon"]] : [])
      .forEach(function (x) {
        var s = el("span");
        s.appendChild(el("i", "", x[0]));
        s.firstChild.setAttribute("aria-hidden", "true");
        s.appendChild(document.createTextNode(x[1]));
        legend.appendChild(s);
      });

    rows.forEach(function (p) {
      var sc = makeScale([p], true);
      var row = el("div", undefined, "hrow");
      var label = el("div", undefined, "hlabel");
      label.appendChild(el("b", HLABEL[p.horizon] || p.horizon));
      label.appendChild(el("small", (p.result ? "Resolved " : "Resolves ") + fmtDate(p.resolves_on)));
      var eq = earningsIn(p);
      if (eq) { var en = el("small", "Earnings " + fmtDate(eq)); en.className = "earn"; en.title = "Earnings are reported inside this window, so the range may need to be wider than usual."; label.appendChild(en); }
      row.appendChild(label);

      var chart = el("div");
      var bars = el("div", undefined, "bars");
      bars.setAttribute("role", "img");
      bars.setAttribute("aria-label", (HLABEL[p.horizon] || p.horizon) + ": AI range " + range(p.ai) + ", baseline " + range(p.baseline) + ", price at prediction " + money(p.price_at_prediction));
      var b = el("div", undefined, "bar-base"); b.style.left = pos(sc, p.baseline.low); b.style.width = wid(sc, p.baseline.low, p.baseline.high);
      var a = el("div", undefined, "bar-ai"); a.style.left = pos(sc, p.ai.low); a.style.width = wid(sc, p.ai.low, p.ai.high);
      var t = el("div", undefined, "mark-today"); t.style.left = pos(sc, p.price_at_prediction);
      bars.appendChild(b); bars.appendChild(a); bars.appendChild(t);
      if (p.result) { var c = el("div", undefined, "mark-close"); c.style.left = pos(sc, p.result.close); c.title = "Close " + money(p.result.close); bars.appendChild(c); }
      chart.appendChild(bars);
      var ticks = el("div", undefined, "ticks");
      ticks.setAttribute("aria-hidden", "true");
      sc.ticks.forEach(function (v) { var s = el("span", "$" + v); s.style.left = pos(sc, v); ticks.appendChild(s); });
      chart.appendChild(ticks);
      row.appendChild(chart);

      var nums = el("div", undefined, "nums");
      var l1 = el("span"); l1.appendChild(el("span", "AI", "ai-k")); l1.appendChild(document.createTextNode(" " + range(p.ai)));
      nums.appendChild(l1);
      var lc = !p.result && latestClose(p.symbol);
      var useLc = lc && Math.abs(lc.price / p.price_at_prediction - 1) >= 0.0005;
      nums.appendChild(el("span", lowHigh(p.ai, useLc ? lc.price : p.price_at_prediction) + " vs " + (useLc ? "latest close" : "start"), "sub"));
      var more = el("details", undefined, "hmore");
      more.appendChild(el("summary", "Details"));
      more.appendChild(el("span", "vs start " + money(p.price_at_prediction) + ": " + lowHigh(p.ai, p.price_at_prediction), "sub"));
      if (useLc) more.appendChild(el("span", "vs latest close " + money(lc.price) + " (" + fmtDate(lc.date) + "): " + lowHigh(p.ai, lc.price), "sub"));
      more.appendChild(el("span", "Baseline " + range(p.baseline), "alt"));
      if (p.baseline_drift) more.appendChild(el("span", "Drift baseline " + range(p.baseline_drift), "alt"));
      if (p.baseline_analyst) more.appendChild(el("span", "Analyst-target baseline " + range(p.baseline_analyst) + " (mean target " + money(p.baseline_analyst.target_mean) + ", " + fmtDate(p.baseline_analyst.target_date) + ")", "alt"));
      more.appendChild(el("span", "Baseline chance above start 50%", "alt"));
      nums.appendChild(more);
      row.appendChild(nums);

      var up = el("div", undefined, "nums");
      var upl = el("span", "Chance above start", "sub"); upl.title = "50% is a coin flip, which is what the baseline assumes."; up.appendChild(upl);
      var l2 = el("span");
      l2.appendChild(el("span", "AI " + pct(p.ai.prob_up), "ai-k"));
      up.appendChild(l2);
      row.appendChild(up);
      host.appendChild(row);
    });
  }

  function renderRecord() {
    var s = state.summary, t = $("record-text");
    clear(t);
    var strong = el("strong", "Track record:");
    strong.style.fontWeight = "600";
    t.appendChild(strong);
    if (!s || !s.n_total) { t.appendChild(document.createTextNode(" no predictions yet.")); return; }
    var msg = " " + s.n_resolved + " of " + s.n_total + " predictions have resolved. ";
    if (s.comparison_ready) {
      msg += "AI range held " + pct(s.overall.ai.coverage) + " of the time, baseline " + pct(s.overall.baseline.coverage) + (s.overall.baseline_drift ? ", drift baseline " + pct(s.overall.baseline_drift.coverage) : "") + ". Still a small sample.";
    } else {
      msg += "Too few to judge; the comparison with the baseline shows from " + s.min_resolved_for_comparison + ".";
    }
    t.appendChild(document.createTextNode(msg));
  }

  function renderAnalysis(rows) {
    var pickHost = $("horizon-pick");
    clear(pickHost);
    if (!rows.length) return;
    if (!rows.some(function (p) { return p.horizon === state.horizon; })) state.horizon = rows[0].horizon;
    if (rows.length > 1) {
      rows.forEach(function (p) {
        var btn = el("button", HLABEL[p.horizon] || p.horizon);
        btn.type = "button";
        btn.setAttribute("aria-pressed", p.horizon === state.horizon ? "true" : "false");
        btn.addEventListener("click", function () { state.horizon = p.horizon; renderAnalysis(rows); });
        pickHost.appendChild(btn);
      });
      pickHost.hidden = false;
    } else { pickHost.hidden = true; }

    var cur = rows.filter(function (p) { return p.horizon === state.horizon; })[0] || rows[0];
    if (!cur) return;
    state.horizon = cur.horizon;

    var cat = cur.catalysts || {};
    var urls = [];
    ["bull", "base", "bear"].forEach(function (k) {
      (cat[k] || []).forEach(function (c) { var u = safeUrl(c.source); if (u && urls.indexOf(u) < 0) urls.push(u); });
    });

    var cases = $("cases");
    clear(cases);
    var claimCount = 0;
    [["bull", "Bull case"], ["base", "Base case"], ["bear", "Bear case"]].forEach(function (pair) {
      var box = el("div", undefined, "case case-" + pair[0]);
      box.appendChild(el("h4", pair[1]));
      var ul = el("ul");
      (cat[pair[0]] || []).forEach(function (c) {
        claimCount++;
        var u = safeUrl(c.source);
        var model = c.kind === "model_expectation";
        var li = el("li", undefined, "claim" + (!u && !model ? " unv" : ""));
        li.appendChild(el("span", c.text));
        var tags = el("span", undefined, "tags");
        if (u) {
          var a = el("a", "source " + (urls.indexOf(u) + 1), "tag");
          a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
          tags.appendChild(a);
        }
        if (model) tags.appendChild(el("span", "model's expectation", "tag model"));
        if (!u && !model) tags.appendChild(el("span", "unverified", "tag unv"));
        li.appendChild(tags);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      cases.appendChild(box);
    });

    var src = $("sources");
    clear(src);
    if (urls.length) {
      src.appendChild(el("h4", "Sources"));
      var ol = el("ol");
      urls.forEach(function (u) {
        var li = el("li");
        var a = el("a", domain(u));
        a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
        li.appendChild(a);
        ol.appendChild(li);
      });
      src.appendChild(ol);
    }

    var notes = $("notes"), wrap = $("notes-wrap");
    if (cur.notes) { notes.textContent = cur.notes; wrap.hidden = false; } else { wrap.hidden = true; }

    var meta = "Made " + fmtDate(cur.made_at) + " at " + money(cur.price_at_prediction) + " · " + claimCount + " claims · " + urls.length + " sources";
    var om = $("outlook-meta"); om.textContent = meta;
    om.appendChild(el("span", cur.blind ? "Blind: range locked before the baseline" : "Written after seeing the baseline", cur.blind ? "blind-tag" : "seen-tag"));
  }

  var TECH = ["SPY", "QQQ", "XLK", "XLC", "XLY", "SMH", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "ORCL", "MU"];
  var SCOPE = { market: { label: "Whole market" }, tech: { label: "Tech and mega-caps", syms: TECH },
    chips: { label: "Chips", syms: ["SMH", "NVDA", "AVGO", "AMD", "MU", "QQQ", "XLK"] }, gold: { label: "Gold and silver", syms: ["GLD", "SLV"] } };
  function appliesTo(e, sym) {
    if (e.type === "shock" && SCOPE[e.scope]) return !SCOPE[e.scope].syms || SCOPE[e.scope].syms.indexOf(sym) >= 0;
    if (e.type === "shock") return true;
    if (e.symbols && e.symbols.length) return e.symbols.indexOf(sym) >= 0;
    // Market-wide macro/Fed items: broad index funds see all of them, everything else only the high-importance ones.
    if (e.type === "scheduled" && (e.kind === "macro" || e.kind === "fed")) return BROAD.indexOf(sym) >= 0 || e.importance === "high";
    return true;
  }
  var BROAD = ["SPY", "QQQ", "IWM"];
  var CAUSE = { fed: "Fed", rates: "Rates", stocks: "Stocks", company: "Company", commodity: "Commodities", policy: "Policy" };
  var KIND = { fed: "Fed", macro: "Economic data", earnings: "Earnings", market: "Market hours", shock: "Market move", politics: "Politics" };
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function shortDate(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function dateLabel(e) {
    if (!e.end_date) return shortDate(e.date);
    var a = new Date(e.date + "T12:00:00Z"), b = new Date(e.end_date + "T12:00:00Z");
    return a.getUTCMonth() === b.getUTCMonth() ? shortDate(e.date) + "–" + b.getUTCDate() : shortDate(e.date) + " – " + shortDate(e.end_date);
  }

  var WSTATUS = { rumor: "Rumor, not confirmed", reported: "Reported, not confirmed", disputed: "Disputed" };
  function impactFor(e) {
    var r = e.impact && e.impact.ranges;
    if (!r) return null;
    var key = r[state.symbol] ? state.symbol : r.SPY ? "SPY" : null;
    return key ? { key: key, r: r[key] } : null;
  }
  function watchAxis(items) {
    var lo = -6, hi = 3, pm = 0.5;
    items.forEach(function (e) {
      var im = impactFor(e);
      if (im) { lo = Math.min(lo, Math.floor(im.r[0])); hi = Math.max(hi, Math.ceil(im.r[1])); }
      if (e.prob > pm) pm = 1;
    });
    return { A: lo, B: hi, pmax: Math.round(pm * 100) };
  }
  function marketText(e) {
    return e.market_prob == null ? "No market price" : "Market " + (e.market_prob_bound === "bounded" || e.market_prob_bound === "max" ? "up to " : "") + Math.round(e.market_prob * 100) + "%";
  }
  function watchBars(e, ax) {
    var wrap = el("div", undefined, "wrow");
    var pc = Math.round(e.prob * 100), mk = marketText(e);
    var a = el("div");
    var l1 = el("div", undefined, "wlab");
    l1.appendChild(el("span", "Chance it happens by " + shortDate(e.by)));
    var rt = el("span"); rt.appendChild(el("b", "Model " + pc + "%")); rt.appendChild(document.createTextNode(" \u00b7 " + mk));
    l1.appendChild(rt); a.appendChild(l1);
    var tr = el("div", undefined, "wtrack");
    tr.setAttribute("role", "img");
    tr.setAttribute("aria-label", "Model " + pc + "%. " + mk + ". Bar runs 0 to " + ax.pmax + "%.");
    var f = el("div", undefined, "wfill"); f.style.width = Math.min(pc / ax.pmax * 100, 100) + "%"; tr.appendChild(f);
    if (e.market_prob != null) { var t = el("div", undefined, "wtick"); t.style.left = Math.min(e.market_prob * 100 / ax.pmax * 100, 100) + "%"; tr.appendChild(t); }
    a.appendChild(tr); a.appendChild(el("small", "Bar runs 0 to " + ax.pmax + "%", "wnote"));
    wrap.appendChild(a);
    var im = impactFor(e);
    if (im) {
      var b = el("div");
      var l2 = el("div", undefined, "wlab");
      l2.appendChild(el("span", (im.key === "SPY" && state.symbol !== "SPY" ? "SPY (the market)" : im.key) + " if it happens, beyond what is priced in"));
      b.appendChild(l2);
      var span = ax.B - ax.A, pos = function (v) { return (v - ax.A) / span * 100; };
      var tr2 = el("div", undefined, "wtrack");
      tr2.setAttribute("role", "img");
      tr2.setAttribute("aria-label", im.key + " moves " + signed(im.r[0]) + " to " + signed(im.r[1]) + " if it happens, an 80% range.");
      var z = el("div", undefined, "wzero"); z.style.left = pos(0) + "%"; tr2.appendChild(z);
      var rg = el("div", undefined, "wrange " + (e.direction === "bull" ? "bull" : "bear"));
      rg.style.left = pos(im.r[0]) + "%"; rg.style.width = Math.max(pos(im.r[1]) - pos(im.r[0]), 0.6) + "%"; tr2.appendChild(rg);
      b.appendChild(tr2);
      var line = el("small", signed(im.r[0]) + " to " + signed(im.r[1]) + " \u00b7 80% range \u00b7 " + e.impact.confidence + " confidence \u00b7 judgment, not scored", "wnote");
      b.appendChild(line);
      wrap.appendChild(b);
    }
    return wrap;
  }
  function svgEl(tag, attrs, text) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function watchChart(items, ax, width) {
    var pts = items.filter(function (e) { return impactFor(e); });
    if (!pts.length) return null;
    var box = el("div", undefined, "wchart"); box.id = "watch-chart";
    var sym = impactFor(pts[0]).key;
    box.appendChild(el("p", "Across: chance it happens. Up and down: " + (sym === "SPY" && state.symbol !== "SPY" ? "SPY" : sym) + " move if it happens, with its range."));
    var W = Math.max(280, Math.round(width || 640)), H = 150, X0 = 38, X1 = W - 10, Y0 = 8, Y1 = H - 22;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img" });
    svg.appendChild(svgEl("title", {}, "Chance of each watched item against its likely market move"));
    var px = function (p) { return X0 + p / ax.pmax * (X1 - X0); };
    var py = function (v) { return Y0 + (ax.B - v) / (ax.B - ax.A) * (Y1 - Y0); };
    var line = function (x1, y1, x2, y2, col, w, dash) {
      var n = svgEl("line", { x1: x1, y1: y1, x2: x2, y2: y2, "stroke-linecap": "round" });
      n.style.stroke = col; n.style.strokeWidth = w; if (dash) n.setAttribute("stroke-dasharray", dash); return n;
    };
    var txt = function (x, y, t, anchor, col) {
      var n = svgEl("text", { x: x, y: y, "text-anchor": anchor, "font-size": 11 }, t); n.style.fill = col; return n;
    };
    for (var v = Math.ceil(ax.A / 2) * 2; v <= ax.B; v += 2) {
      svg.appendChild(line(X0, py(v), X1, py(v), v === 0 ? "var(--muted)" : "var(--line)", v === 0 ? 1 : 1, v === 0 ? null : "2 3"));
      svg.appendChild(txt(X0 - 6, py(v) + 4, (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v) + "%", "end", "var(--muted-2)"));
    }
    [0, ax.pmax / 2, ax.pmax].forEach(function (t, i) {
      svg.appendChild(txt(px(t), H - 6, t + "%", i === 0 ? "start" : i === 2 ? "end" : "middle", "var(--muted-2)"));
    });
    pts.forEach(function (e) {
      var im = impactFor(e), x = px(Math.min(e.prob * 100, ax.pmax)), col = e.direction === "bull" ? "var(--ok)" : "var(--bad)";
      var mid = (im.r[0] + im.r[1]) / 2;
      svg.appendChild(line(x, py(im.r[1]), x, py(im.r[0]), col, 2));
      var c = svgEl("circle", { cx: x, cy: py(mid), r: 4.5 }); c.style.fill = col; svg.appendChild(c);
      var right = e.prob * 100 / ax.pmax > 0.62, name = e.short || e.title.slice(0, 18);
      if (W < 460) {
        var edge = x < X0 + 50 ? "start" : x > X1 - 50 ? "end" : "middle";
        svg.appendChild(txt(edge === "start" ? x - 4 : edge === "end" ? x + 4 : x, py(im.r[1]) - 7, name, edge, "var(--ink)"));
      } else {
        svg.appendChild(txt(x + (right ? -9 : 9), py(mid) + 4, name, right ? "end" : "start", "var(--ink)"));
      }
    });
    box.appendChild(svg);
    return box;
  }
  function causeTag(e) {
    return e.cause && CAUSE[e.cause] ? el("span", CAUSE[e.cause], "tag cause c-" + e.cause) : el("span", KIND[e.kind] || e.kind, "tag");
  }
  function evRow(e, rows, wax) {
    var li = el("li", undefined, "evc");
    var det = document.createElement("details");
    var sum = document.createElement("summary");
    sum.appendChild(el("span", e.type === "watch" ? "By " + shortDate(e.by) : dateLabel(e), "evc-date"));
    sum.appendChild(el("span", e.title, "evc-title"));
    var meta = el("span", undefined, "evc-meta");
    if (e.type === "watch") {
      var pc = Math.round((e.prob || 0) * 100);
      var mb = el("span", undefined, "mbar"); var fi = el("i"); fi.style.width = Math.min(pc / wax.pmax * 100, 100) + "%"; mb.appendChild(fi);
      mb.setAttribute("role", "img"); mb.setAttribute("aria-label", "Model chance " + pc + "%");
      meta.appendChild(mb); meta.appendChild(el("span", pc + "% chance"));
      var im = impactFor(e);
      if (im) meta.appendChild(el("span", signed(im.r[0]) + " to " + signed(im.r[1]), "mimp " + (e.direction === "bull" ? "bull" : "bear")));
    } else {
      if (e.time) meta.appendChild(el("span", e.time));
      if (e.type === "scheduled") {
        var end0 = e.end_date || e.date;
        var hit0 = rows.filter(function (p) { return p.resolves_on >= end0; })[0];
        if (hit0) meta.appendChild(el("span", "Inside the " + (HLABEL[hit0.horizon] || hit0.horizon) + " window", "tag win"));
      } else {
        if (e.move) meta.appendChild(el("span", e.move.label, "mimp " + e.move.tone));
        meta.appendChild(causeTag(e));
      }
    }
    sum.appendChild(meta);
    det.appendChild(sum);
    var body = el("div", undefined, "evc-full");
    if (e.detail) body.appendChild(el("span", e.detail, "ev-detail"));
    if (e.type === "watch") {
      body.appendChild(watchBars(e, wax));
      if (e.resolves_if) body.appendChild(el("span", e.resolves_if, "ev-detail"));
      if (e.impact && e.impact.basis) body.appendChild(el("small", e.impact.basis, "wnote"));
    }
    var tags = el("span", undefined, "tags");
    tags.appendChild(e.type === "shock" ? causeTag(e) : el("span", KIND[e.kind] || e.kind, "tag"));
    if (e.type === "shock" && SCOPE[e.scope]) tags.appendChild(el("span", "Applies to: " + SCOPE[e.scope].label, "tag"));
    if (e.type === "watch") {
      tags.appendChild(el("span", WSTATUS[e.status] || e.status, "tag unv"));
      tags.appendChild(el("span", "Reported " + shortDate(e.date), "tag"));
      if (e.checked) tags.appendChild(el("span", "Checked " + shortDate(e.checked), "tag"));
      tags.appendChild(el("span", "Not yet scored", "tag model"));
      ((e.impact && e.impact.sources) || []).forEach(function (src) {
        var u = safeUrl(src.url); if (!u) return;
        var a = el("a", "Analogue: " + (src.label || domain(u)), "tag");
        a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; tags.appendChild(a);
      });
    }
    var any = false;
    (e.sources || []).forEach(function (src) {
      var u = safeUrl(src.url);
      if (!u) return;
      any = true;
      var a = el("a", src.label || domain(u), "tag");
      a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
      tags.appendChild(a);
    });
    if (e.note) { any = true; tags.appendChild(el("span", e.note, "tag model")); }
    if (!any) tags.appendChild(el("span", "unverified", "tag unv"));
    body.appendChild(tags);
    det.appendChild(body);
    li.appendChild(det);
    return li;
  }

  function evGroup(key, title, sub, items, limit, mk, emptyText, chart, rows) {
    var g = el("div", undefined, "evgroup");
    var h = el("div", undefined, "evg-h");
    h.appendChild(el("h4", title)); if (sub) h.appendChild(el("small", sub));
    g.appendChild(h);
    if (chart) g.appendChild(chart);
    var ol = el("ol", undefined, "timeline");
    if (!items.length) ol.appendChild(el("li", emptyText, "muted"));
    var open = state.evOpen[key];
    (open ? items : items.slice(0, limit)).forEach(function (e) { ol.appendChild(mk(e)); });
    g.appendChild(ol);
    if (items.length > limit) {
      var btn = el("button", open ? "Show fewer" : "Show all " + items.length, "more evg-more");
      btn.type = "button";
      btn.addEventListener("click", function () { state.evOpen[key] = !open; renderEvents(rows); });
      g.appendChild(btn);
    }
    return g;
  }

  function renderStreet(rows) {
    var cur = rows.filter(function (p) { return p.horizon === state.horizon; })[0] || rows[0];
    var host = $("street"), body = $("street-body");
    var r = state.ratings && state.ratings.symbols && state.ratings.symbols[state.symbol];
    clear(body);
    if (!r) { host.hidden = true; return; }
    host.hidden = false;
    var c = r.counts;
    if (c) {
      var tot = c.strongBuy + c.buy + c.hold + c.sell + c.strongSell;
      var bar = el("div", undefined, "street-bar");
      [["strongBuy", "Strong buy"], ["buy", "Buy"], ["hold", "Hold"], ["sell", "Sell"], ["strongSell", "Strong sell"]].forEach(function (k) {
        if (!c[k[0]]) return;
        var seg = el("span", String(c[k[0]]), "seg seg-" + k[0]);
        seg.style.flexGrow = c[k[0]];
        seg.title = k[1] + ": " + c[k[0]];
        bar.appendChild(seg);
      });
      body.appendChild(bar);
      var buys = c.strongBuy + c.buy, sells = c.sell + c.strongSell;
      body.appendChild(el("p", tot + " analysts: " + buys + " buy (" + Math.round(buys / tot * 100) + "%), " + c.hold + " hold, " + sells + " sell.", "street-line"));
    }
    var t = r.target;
    var px = state.prices[state.symbol], last = null;
    if (px) { var ds = Object.keys(px).sort(); last = px[ds[ds.length - 1]]; }
    if (t && t.mean) {
      var up = last ? (t.mean / last - 1) * 100 : null;
      var line = "Mean price target " + money(t.mean) + (t.low && t.high ? " (range " + money(t.low) + " to " + money(t.high) + ")" : "");
      if (last) line += ", " + (up >= 0 ? "+" : "") + up.toFixed(1) + "% from the last close of " + money(last);
      body.appendChild(el("p", line + ".", "street-line"));
      if (cur && cur.price_at_prediction) {
        var aiMove = (Math.sqrt(cur.ai.low * cur.ai.high) / cur.price_at_prediction - 1) * 100;
        body.appendChild(el("p", "For comparison, the AI's " + cur.horizon + " range midpoint implies " + (aiMove >= 0 ? "+" : "") + aiMove.toFixed(1) + "%. Analyst targets are usually 12-month views, so the 1y forecast is the closest match.", "street-line muted"));
      }
    }
    $("street-note").textContent = (state.ratings.source || "Analyst consensus") + ", as of " + fmtDate(r.as_of) + ". Shown for context only: it is not an input to the forecasts and is not scored. Ratings and targets are the brokers' own and can be stale.";
  }

  function renderEvents(rows) {
    var host = $("events"), groups = $("event-groups");
    var all = (state.events || []).filter(function (e) {
      return appliesTo(e, state.symbol);
    });
    if (!all.length) { host.hidden = true; return; }
    host.hidden = false;
    state.evOpen = state.evOpen || {};
    var today = todayIso();
    var sched = all.filter(function (e) { return e.type === "scheduled" && (e.end_date || e.date) >= today; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    // Market holidays and early closes say when you can trade, not what moves price: keep them out of the ranked list.
    var upcoming = sched.filter(function (e) { return e.kind !== "market"; });
    var hours = sched.filter(function (e) { return e.kind === "market"; }).slice(0, 3);
    var recent = all.filter(function (e) { return e.type === "shock"; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var watching = all.filter(function (e) { return e.type === "watch" && (e.by || "") >= today; })
      .sort(function (a, b) { return (b.prob || 0) - (a.prob || 0); });
    var wax = watchAxis(watching);
    state.evWatch = { items: watching, ax: wax };
    if (!window._evResize) {
      window._evResize = true;
      var tmr = null;
      window.addEventListener("resize", function () {
        clearTimeout(tmr);
        tmr = setTimeout(function () {
          var old = $("watch-chart"), g = $("event-groups");
          if (!old || !state.evWatch || !g.clientWidth || Math.abs(g.clientWidth - old.firstChild.nextSibling.getAttribute("width")) < 24) return;
          var nu = watchChart(state.evWatch.items, state.evWatch.ax, g.clientWidth);
          if (nu) old.replaceWith(nu);
        }, 150);
      });
    }
    clear(groups);
    groups.appendChild(evGroup("scheduled", "Coming up", upcoming.length > 3 ? "Next 3 of " + upcoming.length + ", soonest first" : "Soonest first",
      upcoming, 3, function (e) { return evRow(e, rows, wax); }, "No scheduled events listed.", null, rows));
    if (hours.length) {
      groups.lastChild.appendChild(el("small", "Market hours: " + hours.map(function (e) {
        return shortDate(e.date) + " " + (e.time ? e.title.toLowerCase() + ", " + e.time.toLowerCase() : e.title.toLowerCase());
      }).join(" · "), "wnote"));
    }
    if (watching.length) {
      groups.appendChild(evGroup("watch", "Being watched", "Unconfirmed items, sorted by chance it happens, highest first",
        watching, 99, function (e) { return evRow(e, rows, wax); }, "", watchChart(watching, wax, groups.clientWidth), rows));
    }
    groups.appendChild(evGroup("shock", "Recent shocks", "Already happened and priced in, newest first",
      recent, 3, function (e) { return evRow(e, rows, wax); }, "No recent shocks listed.", null, rows));
  }

  function resultCell(r) {
    if (!r) return ["Open", "r-open"];
    if (r === "held") return ["Held", "r-held"];
    return [r === "missed_above" ? "Missed (above)" : "Missed (below)", "r-miss"];
  }

  function renderPast(list) {
    $("past-title").textContent = "Past outlooks for " + state.symbol;
    var body = $("past");
    clear(body);
    list.slice().sort(function (a, b) {
      if (a.made_at !== b.made_at) return a.made_at < b.made_at ? 1 : -1;
      return HORDER.indexOf(a.horizon) - HORDER.indexOf(b.horizon);
    }).forEach(function (p) {
      var res = p.result || null;
      var ai = resultCell(res && res.ai.result), bl = resultCell(res && res.baseline.result);
      var tr = el("tr");
      [fmtDate(p.made_at), HLABEL[p.horizon] || p.horizon, range(p.ai), range(p.baseline),
       res ? money(res.close) + " (" + fmtDate(res.close_date) + ")" : "Due " + fmtDate(p.resolves_on) + (earningsIn(p) ? " (earnings " + fmtDate(earningsIn(p)) + ")" : "")
      ].forEach(function (t) { tr.appendChild(el("td", t)); });
      tr.appendChild(el("td", ai[0], ai[1]));
      tr.appendChild(el("td", bl[0], bl[1]));
      body.appendChild(tr);
    });
  }


  var PD_PAGE = 200;
  function pdStatus(p) {
    if (p.status !== "resolved" || !p.result || !p.result.ai) return "open";
    return p.result.ai.result === "held" ? "held" : "missed";
  }
  function pdRows() {
    return state.preds.filter(function (p) {
      if (state.pdSym !== "all" && p.symbol !== state.pdSym) return false;
      if (state.pdH !== "all" && p.horizon !== state.pdH) return false;
      if (state.pdMade !== "all" && p.made_at !== state.pdMade) return false;
      if (state.pdStatus !== "all" && pdStatus(p) !== state.pdStatus) return false;
      if (state.pdBlind === "blind" && !p.blind) return false;
      if (state.pdBlind === "not" && p.blind) return false;
      return true;
    }).sort(function (a, b) {
      if (a.made_at !== b.made_at) return a.made_at < b.made_at ? 1 : -1;
      if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
      return HORDER.indexOf(a.horizon) - HORDER.indexOf(b.horizon);
    });
  }
  function pdHash() {
    var h = "#predictions" + (state.pdSym && state.pdSym !== "all" ? "/" + state.pdSym : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  function pdCsv(rows) {
    function q(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var head = ["id", "made_at", "symbol", "horizon", "resolves_on", "price_at_prediction", "ai_low", "ai_high", "ai_level", "ai_prob_up",
      "baseline_low", "baseline_high", "blind", "status", "close", "close_date", "ai_result", "baseline_result"];
    var lines = [head.join(",")];
    rows.forEach(function (p) {
      var r = p.result || {};
      lines.push([p.id, p.made_at, p.symbol, p.horizon, p.resolves_on, p.price_at_prediction, p.ai.low, p.ai.high, p.ai.level, p.ai.prob_up,
        p.baseline.low, p.baseline.high, p.blind ? "yes" : "no", pdStatus(p), r.close, r.close_date,
        r.ai && r.ai.result, r.baseline && r.baseline.result].map(q).join(","));
    });
    return lines.join("\n") + "\n";
  }
  function renderPredictions() {
    ["pdSym", "pdH", "pdStatus", "pdBlind", "pdMade"].forEach(function (k) { if (!state[k]) state[k] = "all"; });
    if (!state.pdLimit) state.pdLimit = PD_PAGE;
    var redo = function () { state.pdLimit = PD_PAGE; pdHash(); renderPredictions(); };
    var syms = symbols(), sel = $("pd-sym"); clear(sel);
    var o0 = el("option", "All symbols"); o0.value = "all"; sel.appendChild(o0);
    syms.forEach(function (s) { var o = el("option", s + (NAMES[s] ? " – " + NAMES[s] : "")); o.value = s; sel.appendChild(o); });
    if (state.pdSym !== "all" && syms.indexOf(state.pdSym) < 0) state.pdSym = "all";
    sel.value = state.pdSym;
    sel.onchange = function () { state.pdSym = sel.value; redo(); };
    var dates = {}; state.preds.forEach(function (p) { dates[p.made_at] = true; });
    var ms = $("pd-made"); clear(ms);
    var d0 = el("option", "All dates"); d0.value = "all"; ms.appendChild(d0);
    Object.keys(dates).sort().reverse().forEach(function (d) { var o = el("option", "Made " + fmtDate(d)); o.value = d; ms.appendChild(o); });
    if (!dates[state.pdMade]) state.pdMade = "all";
    ms.value = state.pdMade;
    ms.onchange = function () { state.pdMade = ms.value; redo(); };
    var hs = HORDER.filter(function (h) { return state.preds.some(function (p) { return p.horizon === h; }); });
    seg2($("pd-h"), [["all", "All horizons"]].concat(hs.map(function (h) { return [h, HLABEL[h]]; })), "pdH", redo);
    seg2($("pd-status"), [["all", "Any status"], ["open", "Open"], ["held", "Held"], ["missed", "Missed"]], "pdStatus", redo);
    seg2($("pd-blind"), [["all", "Blind or not"], ["blind", "Blind"], ["not", "Not blind"]], "pdBlind", redo);

    var rows = pdRows(), body = $("pd-body"); clear(body);
    rows.slice(0, state.pdLimit).forEach(function (p) {
      var res = p.result || null;
      var ai = resultCell(res && res.ai && res.ai.result), bl = resultCell(res && res.baseline && res.baseline.result);
      var tr = el("tr");
      tr.appendChild(el("td", fmtDate(p.made_at)));
      var td = el("td"), a = el("a", p.symbol); a.href = "#" + p.symbol; td.appendChild(a); tr.appendChild(td);
      [HLABEL[p.horizon] || p.horizon, money(p.price_at_prediction), range(p.ai), p.ai.prob_up == null ? "n/a" : pct(p.ai.prob_up), range(p.baseline),
       res ? money(res.close) + " (" + fmtDate(res.close_date) + ")" : "Due " + fmtDate(p.resolves_on)
      ].forEach(function (t) { tr.appendChild(el("td", t)); });
      tr.appendChild(el("td", ai[0], ai[1]));
      tr.appendChild(el("td", bl[0], bl[1]));
      tr.appendChild(el("td", p.blind ? "Yes" : "No", p.blind ? "" : "muted"));
      body.appendChild(tr);
    });
    if (!rows.length) { var r0 = el("tr"), c0 = el("td", "No predictions match these filters.", "muted"); c0.colSpan = 11; r0.appendChild(c0); body.appendChild(r0); }
    var nRes = rows.filter(function (p) { return pdStatus(p) !== "open"; }).length;
    var nHeld = rows.filter(function (p) { return pdStatus(p) === "held"; }).length;
    $("pd-count").textContent = "Showing " + Math.min(rows.length, state.pdLimit) + " of " + rows.length + " matching (" + state.preds.length + " in total). "
      + (nRes ? nRes + " resolved, " + nHeld + " held (" + pct(nHeld / nRes) + ")." : "None of these has resolved yet.");
    var more = $("pd-more");
    more.hidden = rows.length <= state.pdLimit;
    more.textContent = "Show " + Math.min(PD_PAGE, rows.length - state.pdLimit) + " more";
    more.onclick = function () { state.pdLimit += PD_PAGE; renderPredictions(); };
    $("pd-csv").disabled = !rows.length;
    $("pd-csv").onclick = function () {
      var blob = new Blob([pdCsv(rows)], { type: "text/csv" }), url = URL.createObjectURL(blob), dl = document.createElement("a");
      dl.href = url; dl.download = "outlook-lab-predictions" + (state.pdSym !== "all" ? "-" + state.pdSym : "") + ".csv";
      document.body.appendChild(dl); dl.click(); document.body.removeChild(dl);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };
    var s = state.summary;
    $("pd-updated").textContent = s && s.generated_at ? "Scores updated " + fmtDate(s.generated_at.slice(0, 10)) : "";
  }

  var CMP_COLORS = ["oklch(0.62 0.17 264)", "oklch(0.64 0.17 35)", "oklch(0.62 0.14 155)", "oklch(0.7 0.14 85)", "oklch(0.6 0.18 325)", "oklch(0.64 0.11 205)"];
  var CMP_MAX = CMP_COLORS.length;
  function cmpLink(syms, h) {
    var u = [];
    syms.forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); });
    return "#compare/" + u.slice(0, CMP_MAX).join(",") + (h ? "/" + h : "");
  }
  function cmpHash() {
    var h = "#compare/" + state.cmpSyms.join(",") + (state.cmpH ? "/" + state.cmpH : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  function cmpRedo() { cmpHash(); renderCompare(location.hash.replace("#", "")); }
  function dayMs(iso) { return Date.parse(iso + "T00:00:00Z"); }
  function renderCompare(wanted) {
    var parts = wanted.split("/");
    var avail = symbols();
    if (!state.cmpInit || parts[1]) {
      var want = (parts[1] || "SPY,QQQ,SMH,NVDA").split(",").filter(function (x) { return avail.indexOf(x) >= 0; });
      state.cmpSyms = want.slice(0, CMP_MAX);
      if (parts[2] && HLABEL[parts[2]]) state.cmpH = parts[2];
      state.cmpInit = true;
    }
    var allH = HORDER.filter(function (h) { return avail.some(function (s) { return latestByHorizon(forSymbol(s)).some(function (r) { return r.horizon === h; }); }); });
    if (allH.indexOf(state.cmpH) < 0) state.cmpH = allH.indexOf("1m") >= 0 ? "1m" : allH[0];
    seg2($("cmp-h"), allH.map(function (h) { return [h, HLABEL[h]]; }), "cmpH", cmpRedo);

    var chips = $("cmp-chips"); clear(chips);
    state.cmpSyms.forEach(function (s, i) {
      var c = el("span", undefined, "cmp-chip");
      var dot = el("i"); dot.style.background = CMP_COLORS[i]; c.appendChild(dot);
      c.appendChild(document.createTextNode(s));
      var x = el("button", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + s);
      x.addEventListener("click", function () { state.cmpSyms.splice(i, 1); cmpRedo(); });
      c.appendChild(x); chips.appendChild(c);
    });
    var add = $("cmp-add"); clear(add);
    var full = state.cmpSyms.length >= CMP_MAX;
    add.disabled = full;
    var o0 = el("option", full ? "Up to " + CMP_MAX + " symbols" : "Add a symbol…"); o0.value = ""; add.appendChild(o0);
    avail.filter(function (s) { return state.cmpSyms.indexOf(s) < 0; }).forEach(function (s) {
      var o = el("option", s + (NAMES[s] ? " – " + NAMES[s] : "")); o.value = s; add.appendChild(o);
    });
    add.onchange = function () {
      if (add.value && state.cmpSyms.length < CMP_MAX) { state.cmpSyms.push(add.value); cmpRedo(); }
    };

    var data = [];
    state.cmpSyms.forEach(function (s, i) {
      var p = latestByHorizon(forSymbol(s)).filter(function (r) { return r.horizon === state.cmpH; })[0];
      if (p) data.push({ s: s, p: p, color: CMP_COLORS[i] });
    });

    var host = $("cmp-chart"); clear(host);
    var body = $("cmp-body"); clear(body);
    if (!data.length) { host.appendChild(el("p", "Pick at least one symbol with a forecast for this horizon.", "muted")); return; }

    var t0 = Math.max.apply(null, data.map(function (d) { return dayMs(d.p.made_at); }));
    var t1 = Math.max.apply(null, data.map(function (d) { return dayMs(d.p.resolves_on); }));
    var span = t1 - t0, tmin = t0 - span * 1.2;
    var W = Math.max(host.clientWidth || 760, 320), H = W < 560 ? 320 : 400;
    var m = { l: 46, r: W < 560 ? 52 : 70, t: 14, b: 26 };
    var lines = data.map(function (d) {
      var st = d.p.price_at_prediction, ser = state.prices[d.s] || {}, pts = [];
      Object.keys(ser).sort().forEach(function (dt) {
        var ms = dayMs(dt);
        if (ms >= tmin && dt < d.p.made_at) pts.push([ms, ser[dt] / st - 1]);
      });
      pts.push([dayMs(d.p.made_at), 0]);
      return pts;
    });
    var vals = [0];
    lines.forEach(function (l) { l.forEach(function (q) { vals.push(q[1]); }); });
    data.forEach(function (d) { var st = d.p.price_at_prediction; vals.push(d.p.ai.low / st - 1, d.p.ai.high / st - 1); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.06 || 0.01;
    lo -= pad; hi += pad;
    function X(ms) { return m.l + (ms - tmin) / (t1 - tmin) * (W - m.l - m.r); }
    function Y(v) { return m.t + (hi - v) / (hi - lo) * (H - m.t - m.b); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Rebased price history and AI forecast ranges for " + data.map(function (d) { return d.s; }).join(", ") });
    var stepP = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.5], sp = 1;
    for (var i = 0; i < stepP.length; i++) { if ((hi - lo) / stepP[i] <= 7) { sp = stepP[i]; break; } }
    for (var v = Math.ceil(lo / sp) * sp; v <= hi + 1e-9; v += sp) {
      var yv = Y(v), isZ = Math.abs(v) < 1e-9;
      var ga = { x1: m.l, x2: W - m.r, y1: yv, y2: yv, stroke: isZ ? "var(--muted)" : "var(--line-2)", "stroke-width": isZ ? 1.2 : 1 };
      if (isZ) ga["stroke-dasharray"] = "4 3";
      svg.appendChild(svgEl("line", ga));
      var tl = svgEl("text", { x: m.l - 6, y: yv + 4, "text-anchor": "end" });
      tl.textContent = (v > 0.0000001 ? "+" : v < -0.0000001 ? "−" : "") + Math.abs(v * 100).toFixed(sp < 0.01 ? 1 : 0) + "%";
      svg.appendChild(tl);
    }
    [[tmin, "start"], [t0, "mid"], [t1, "end"]].forEach(function (a) {
      var tx = svgEl("text", { x: X(a[0]), y: H - 8, "text-anchor": a[1] === "start" ? "start" : a[1] === "end" ? "end" : "middle" });
      tx.textContent = a[1] === "mid" ? "Forecast made" : new Date(a[0]).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      svg.appendChild(tx);
    });
    svg.appendChild(svgEl("line", { x1: X(t0), x2: X(t0), y1: m.t, y2: H - m.b, stroke: "var(--line)", "stroke-width": 1 }));
    var ends = [];
    data.forEach(function (d, i) {
      var st = d.p.price_at_prediction, a = dayMs(d.p.made_at), b = dayMs(d.p.resolves_on);
      var l = d.p.ai.low / st - 1, h = d.p.ai.high / st - 1, up = [], dn = [];
      for (var k = 0; k <= 16; k++) {
        var f = k / 16, r = Math.sqrt(f), x = X(a + f * (b - a));
        up.push(x.toFixed(1) + "," + Y(h * r).toFixed(1)); dn.unshift(x.toFixed(1) + "," + Y(l * r).toFixed(1));
      }
      svg.appendChild(svgEl("polygon", { points: up.concat(dn).join(" "), fill: d.color, "fill-opacity": 0.16, stroke: d.color, "stroke-opacity": 0.7, "stroke-width": 1.2 }));
      var pts = lines[i];
      if (pts.length > 1) svg.appendChild(svgEl("polyline", { points: pts.map(function (q) { return X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1); }).join(" "), fill: "none", stroke: d.color, "stroke-width": 1.8, "stroke-linejoin": "round" }));
      ends.push({ y: Y((l + h) / 2), d: d, x: X(b) });
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var j = 1; j < ends.length; j++) if (ends[j].y - ends[j - 1].y < 14) ends[j].y = ends[j - 1].y + 14;
    ends.forEach(function (e) {
      var tx = svgEl("text", { x: e.x + 6, y: e.y + 4 }, "lbl"); tx.style.fill = e.d.color; tx.textContent = e.d.s; svg.appendChild(tx);
    });
    host.appendChild(svg);

    data.forEach(function (d) {
      var p = d.p, st = p.price_at_prediction, tr = el("tr");
      var c0 = el("td"), sw = el("i", undefined, "sw"); sw.style.background = d.color;
      var a = el("a", d.s); a.href = "#" + d.s; c0.appendChild(sw); c0.appendChild(a); tr.appendChild(c0);
      tr.appendChild(el("td", money(st)));
      tr.appendChild(el("td", range(p.ai)));
      tr.appendChild(el("td", moveText(p.ai, st)));
      tr.appendChild(el("td", moveText(p.baseline, st)));
      var bw = p.baseline.high - p.baseline.low;
      tr.appendChild(el("td", bw > 0 ? Math.round((p.ai.high - p.ai.low) / bw * 100) + "%" : "n/a"));
      tr.appendChild(el("td", p.ai.prob_up != null ? pct(p.ai.prob_up) : "n/a"));
      tr.appendChild(el("td", fmtDate(p.resolves_on)));
      body.appendChild(tr);
    });
  }

  function median(a) {
    var b = a.filter(function (v) { return v != null && isFinite(v); }).sort(function (x, y) { return x - y; });
    if (!b.length) return null;
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function pc1(v) {
    if (v == null) return "n/a";
    var r = Math.round(v * 1000) / 10;
    return r === 0 ? "0.0%" : (r > 0 ? "+" : "−") + Math.abs(r).toFixed(1) + "%";
  }
  function anMetrics(p) {
    var st = p.price_at_prediction, mid = Math.sqrt(p.ai.low * p.ai.high);
    var bw = p.baseline.high - p.baseline.low;
    return { z: Math.log(mid / st) / (Math.log(p.ai.high / p.ai.low) / 2), drift: mid / st - 1, up: p.ai.prob_up, ratio: bw > 0 ? (p.ai.high - p.ai.low) / bw : null, width: (p.ai.high - p.ai.low) / st, baseMid: Math.sqrt(p.baseline.low * p.baseline.high) / st - 1 };
  }
  var RETIRED = ["MSTR", "SCCO", "WELL", "SO", "CVX", "COST"];
  var GROUP_LABEL = { index: "Broad indexes", sector: "Sectors", intl: "International", other: "Bonds & commodities", stock: "Stocks" };
  function renderAnalysisPage() {
    var syms = symbols().filter(function (s) { return RETIRED.indexOf(s) < 0; });
    var latest = {};
    syms.forEach(function (s) { latest[s] = latestByHorizon(forSymbol(s)); });
    var hs = HORDER.filter(function (h) { return syms.some(function (s) { return latest[s].some(function (r) { return r.horizon === h; }); }); });
    if (hs.indexOf(state.anH) < 0) state.anH = hs.indexOf("1m") >= 0 ? "1m" : hs[0];
    seg2($("an-h"), hs.map(function (h) { return [h, HLABEL[h]]; }), "anH", renderAnalysisPage);
    var groups = ["index", "sector", "intl", "other", "stock"].filter(function (g) { return syms.some(function (s) { return groupOf(s) === g; }); });
    if (!state.anGroup) state.anGroup = "all";
    seg2($("an-group"), [["all", "All"]].concat(groups.map(function (g) { return [g, GROUP_LABEL[g]]; })), "anGroup", renderAnalysisPage);

    function rowsFor(h) {
      var out = [];
      syms.forEach(function (s) {
        var p = latest[s].filter(function (r) { return r.horizon === h; })[0];
        if (p) out.push({ s: s, p: p, m: anMetrics(p) });
      });
      return out;
    }
    var all = rowsFor(state.anH);
    var data = state.anGroup === "all" ? all : all.filter(function (d) { return groupOf(d.s) === state.anGroup; });
    function bullish(list) { return list.filter(function (d) { return d.m.up != null && d.m.up > 0.5; }).length; }
    function withUp(list) { return list.filter(function (d) { return d.m.up != null; }).length; }
    function share(list) { var n = withUp(list); return n ? Math.round(bullish(list) / n * 100) + "%" : "n/a"; }
    function med(list, k) { return median(list.map(function (d) { return d.m[k]; })); }

    var stats = $("an-stats"); clear(stats);
    var ratioMed = med(data, "ratio");
    [[data.length + "", "symbols with a " + HLABEL[state.anH] + " forecast"],
     [share(data), "bullish (chance up above 50%)"],
     [pct(med(data, "up")), "median chance up"],
     [pc1(med(data, "drift")), "median implied drift"],
     [ratioMed == null ? "n/a" : Math.round(ratioMed * 100) + "%", "median AI width vs baseline"]].forEach(function (c) {
      var d = el("div", undefined, "an-stat"); d.appendChild(el("b", c[0])); d.appendChild(el("span", c[1])); stats.appendChild(d);
    });

    function fillGroups() {
      var tb = $("an-groups"); clear(tb);
      groups.forEach(function (g) {
        var list = all.filter(function (d) { return groupOf(d.s) === g; });
        if (!list.length) return;
        var tr = el("tr"), r = med(list, "ratio");
        tr.appendChild(el("td", GROUP_LABEL[g])); tr.appendChild(el("td", String(list.length)));
        tr.appendChild(el("td", share(list))); tr.appendChild(el("td", pc1(med(list, "drift"))));
        tr.appendChild(el("td", r == null ? "n/a" : Math.round(r * 100) + "%"));
        tb.appendChild(tr);
      });
      var th = $("an-horizons"); clear(th);
      hs.forEach(function (h) {
        var list = rowsFor(h);
        if (state.anGroup !== "all") list = list.filter(function (d) { return groupOf(d.s) === state.anGroup; });
        if (!list.length) return;
        var tr = el("tr"); tr.appendChild(el("td", HLABEL[h])); tr.appendChild(el("td", String(list.length)));
        tr.appendChild(el("td", share(list))); tr.appendChild(el("td", pct(med(list, "up")))); tr.appendChild(el("td", pc1(med(list, "drift"))));
        th.appendChild(tr);
      });
    }
    fillGroups();


    // heatmap
    if (!state.anMetric) state.anMetric = "up";
    seg2($("an-metric"), [["up", "Chance up"], ["drift", "Implied drift"]], "anMetric", renderAnalysisPage);
    var wrapH = $("an-heat"); clear(wrapH);
    var hsyms = syms.filter(function (s) { return state.anGroup === "all" || groupOf(s) === state.anGroup; });
    var chunks = hsyms.length > 10 ? [hsyms.slice(0, Math.ceil(hsyms.length / 2)), hsyms.slice(Math.ceil(hsyms.length / 2))] : [hsyms];
    wrapH.className = "an-heat" + (chunks.length > 1 ? " two" : "");
    chunks.forEach(function (chunk) {
      var heat = el("div", undefined, "an-heat-g");
      heat.style.gridTemplateColumns = "minmax(46px, auto) repeat(" + hs.length + ", minmax(40px, 1fr))";
      heat.appendChild(el("div"));
      hs.forEach(function (h) { heat.appendChild(el("div", HLABEL[h].replace(" months", "m").replace(" month", "m").replace(" years", "y").replace(" year", "y").replace(" week", "w"), "hh")); });
      chunk.forEach(function (sym) {
        var lab = el("div", undefined, "hs"), la = el("a", sym); la.href = "#" + sym; lab.appendChild(la); heat.appendChild(lab);
        hs.forEach(function (h) {
          var p = latest[sym].filter(function (r) { return r.horizon === h; })[0];
          if (!p) { heat.appendChild(el("div", "–", "hc na")); return; }
          var m = anMetrics(p), c = el("a", undefined, "hc"); c.href = cmpLink([sym, sym === "SPY" ? "QQQ" : "SPY"], h);
          if (state.anMetric === "up") {
            c.textContent = m.up == null ? "n/a" : pct(m.up);
            c.style.background = tileColor(m.up);
          } else {
            c.textContent = pc1(m.drift);
            var half = Math.log(p.ai.high / p.ai.low) / 2;
            var z = half > 0 ? Math.max(-1, Math.min(1, Math.log(1 + m.drift) / half)) : 0, a2 = Math.abs(z);
            c.style.background = a2 < 0.06 ? "oklch(0.44 0.03 250)" : "oklch(" + (0.44 + a2 * 0.06).toFixed(3) + " " + (0.04 + a2 * 0.1).toFixed(3) + " " + (z > 0 ? 175 : 28) + ")";
          }
          c.title = sym + ", " + HLABEL[h] + ": " + range(p.ai) + ", chance up " + pct(m.up) + ". Click to compare with " + (sym === "SPY" ? "QQQ" : "SPY") + ".";
          heat.appendChild(c);
        });
      });
      wrapH.appendChild(heat);
    });
    $("an-heat-note").textContent = state.anMetric === "up" ? "Green leans up, red leans down, grey is near 50%. Same colour scale as the Overview map. Click a cell to compare that symbol with SPY." : "Colour shows where the AI median sits inside the AI range (green above the start price, red below), so short and long horizons are comparable. The number is the drift in %.";


    // disagreement with the market: one sortable table (also covers most bullish/bearish and narrow/wide vs baseline)
    function dcls(d) { return d.m.drift >= 0 ? "an-up" : "an-down"; }
    var DIS_COLS = [["drift", "AI drift", -1], ["base", "Baseline drift", -1], ["gap", "Gap", -1], ["ratio", "AI width vs baseline", 1], ["up", "Chance up", -1]];
    if (!state.disSort) { state.disSort = "gap"; state.disDir = -1; }
    function disVal(d, k) {
      if (k === "drift") return d.m.drift;
      if (k === "base") return d.m.baseMid;
      if (k === "gap") return Math.abs(d.m.drift - d.m.baseMid);
      if (k === "ratio") return d.m.ratio;
      return d.m.up;
    }
    var disHead = $("an-dis-head"); clear(disHead);
    var dhr = el("tr"); dhr.appendChild(el("th", "Symbol")); dhr.appendChild(el("th", ""));
    DIS_COLS.forEach(function (c) {
      var th = el("th"), b = el("button", c[1] + (state.disSort === c[0] ? (state.disDir < 0 ? " \u25BE" : " \u25B4") : ""), "an-sortbtn");
      b.type = "button";
      th.setAttribute("aria-sort", state.disSort === c[0] ? (state.disDir < 0 ? "descending" : "ascending") : "none");
      b.addEventListener("click", function () {
        if (state.disSort === c[0]) state.disDir = -state.disDir; else { state.disSort = c[0]; state.disDir = c[2]; }
        renderAnalysisPage();
      });
      th.appendChild(b); dhr.appendChild(th);
    });
    disHead.appendChild(dhr);
    var disRows = data.filter(function (d) { return disVal(d, state.disSort) != null; }).sort(function (a, b) { return (disVal(a, state.disSort) - disVal(b, state.disSort)) * state.disDir; });
    var shown = state.disAll ? disRows : disRows.slice(0, 10);
    var dis = $("an-dis"); clear(dis);
    shown.forEach(function (d) {
      var gap = d.m.drift - d.m.baseMid, tr = el("tr"), td = el("td"), a = el("a", d.s); a.href = "#" + d.s; td.appendChild(a); tr.appendChild(td);
      tr.appendChild(el("td", NAMES[d.s] || "", "muted nm"));
      tr.appendChild(el("td", pc1(d.m.drift), dcls(d))); tr.appendChild(el("td", pc1(d.m.baseMid)));
      tr.appendChild(el("td", (gap >= 0 ? "+" : "\u2212") + Math.abs(gap * 100).toFixed(1) + " pts", gap >= 0 ? "an-up" : "an-down"));
      tr.appendChild(el("td", d.m.ratio == null ? "n/a" : Math.round(d.m.ratio * 100) + "%"));
      tr.appendChild(el("td", d.m.up == null ? "n/a" : pct(d.m.up)));
      dis.appendChild(tr);
    });
    if (!shown.length) { var dr0 = el("tr"); dr0.appendChild(el("td", "No data", "muted")); dis.appendChild(dr0); }
    var dm = $("an-dis-more");
    dm.hidden = disRows.length <= 10;
    dm.textContent = state.disAll ? "Show top 10" : "Show all " + disRows.length;
    dm.onclick = function () { state.disAll = !state.disAll; renderAnalysisPage(); };
    var dcard = dis.parentNode.parentNode.parentNode, oldGo = dcard.querySelector(".cmp-go");
    if (oldGo) oldGo.parentNode.removeChild(oldGo);
    if (disRows.length > 1) {
      var go = el("a", "Compare the top " + Math.min(5, disRows.length) + " \u2192", "cmp-go");
      go.href = cmpLink(disRows.slice(0, 5).map(function (d) { return d.s; }), state.anH);
      dcard.querySelector(".an-foot").appendChild(go);
    }
    $("an-dis-note").textContent = "Click a column to sort; click again to reverse. Gap is the AI median minus the options-implied baseline median, in percentage points, ranked by size: a large gap is a real directional view, a small one means the AI is mostly echoing the market. Sort by AI drift for the most bullish or bearish forecasts, and by width for where the AI is more confident (narrower) or sees more risk (wider) than the market.";

    // AI vs Wall Street: stocks only, always the 1-year forecast (analyst targets are 12-month views)
    var stCard = $("an-street-card"), stBody = $("an-street"); clear(stBody);
    var rts = state.ratings && state.ratings.symbols;
    var stRows = [];
    if (rts && (state.anGroup === "all" || state.anGroup === "stock")) {
      syms.forEach(function (s) {
        var r = rts[s], p = latest[s].filter(function (x) { return x.horizon === "1y"; })[0], lc = latestClose(s);
        if (!r || !r.target || !r.target.mean || !p || !lc) return;
        var aiMid = Math.sqrt(p.ai.low * p.ai.high), st = r.target.mean / lc.price - 1, ai = aiMid / lc.price - 1;
        stRows.push({ s: s, r: r, aiMid: aiMid, st: st, ai: ai, gap: ai - st });
      });
    }
    stCard.hidden = !stRows.length;
    stRows.sort(function (a, b) { return a.gap - b.gap; }).forEach(function (d) {
      var c = d.r.counts, tot = c ? c.strongBuy + c.buy + c.hold + c.sell + c.strongSell : 0;
      var tr = el("tr"), td = el("td"), a = el("a", d.s); a.href = "#" + d.s; td.appendChild(a); tr.appendChild(td);
      tr.appendChild(el("td", NAMES[d.s] || "", "muted nm"));
      tr.appendChild(el("td", tot ? tot + " (" + Math.round((c.strongBuy + c.buy) / tot * 100) + "% buy)" : "n/a"));
      tr.appendChild(el("td", money(d.r.target.mean)));
      tr.appendChild(el("td", pc1(d.st), d.st >= 0 ? "an-up" : "an-down"));
      tr.appendChild(el("td", money(d.aiMid)));
      tr.appendChild(el("td", pc1(d.ai), d.ai >= 0 ? "an-up" : "an-down"));
      tr.appendChild(el("td", (d.gap >= 0 ? "+" : "\u2212") + Math.abs(d.gap * 100).toFixed(1) + " pts", d.gap >= 0 ? "an-up" : "an-down"));
      stBody.appendChild(tr);
    });
    if (stRows.length) {
      var asOf = stRows.map(function (d) { return d.r.as_of; }).sort()[0];
      $("an-street-note").textContent = "AI below the Street first. Both columns are measured from the latest close, so they compare directly: the AI's 1-year range median vs the Wall Street mean price target (a 12-month view). This ignores the horizon picker above. " + (state.ratings.source || "Analyst consensus") + ", oldest entry " + fmtDate(asOf) + ". The analyst numbers are context, not an input to the forecasts; the analyst-target baseline on the Scorecard is where they are scored. Not financial advice.";
    }

    // change since the previous forecast for the same symbol and horizon
    var chg = [];
    data.forEach(function (d) {
      var hist = forSymbol(d.s).filter(function (p) { return p.horizon === state.anH; }).sort(function (a, b) { return a.made_at < b.made_at ? -1 : a.made_at > b.made_at ? 1 : 0; });
      if (hist.length < 2) return;
      var cur = hist[hist.length - 1], prev = hist[hist.length - 2], a = anMetrics(cur), b = anMetrics(prev);
      chg.push({ s: d.s, cur: cur, prev: prev, du: a.up != null && b.up != null ? a.up - b.up : null, dd: a.drift - b.drift, dw: a.width / b.width - 1 });
    });
    var ch = $("an-chg"), chh = $("an-chg-head"); clear(ch); clear(chh);
    if (!chg.length) {
      $("an-chg-note").textContent = "Every symbol has only one forecast at this horizon so far, so there is nothing to compare. This fills in after the next weekly run.";
    } else {
      var hr = el("tr");
      ["Symbol", "", "Chance up", "Drift", "Range width", "Previous run"].forEach(function (t) { hr.appendChild(el("th", t)); });
      chh.appendChild(hr);
      chg.sort(function (x, y) { return (Math.abs(y.du || 0) * 3 + Math.abs(y.dd)) - (Math.abs(x.du || 0) * 3 + Math.abs(x.dd)); }).slice(0, 10).forEach(function (c) {
        var tr = el("tr"), td = el("td"), a = el("a", c.s); a.href = "#" + c.s; td.appendChild(a); tr.appendChild(td);
        tr.appendChild(el("td", NAMES[c.s] || "", "muted nm"));
        tr.appendChild(el("td", c.du == null ? "n/a" : (c.du >= 0 ? "+" : "−") + Math.abs(Math.round(c.du * 100)) + " pts", c.du > 0 ? "an-up" : c.du < 0 ? "an-down" : ""));
        tr.appendChild(el("td", (c.dd >= 0 ? "+" : "−") + Math.abs(c.dd * 100).toFixed(1) + " pts", c.dd > 0 ? "an-up" : c.dd < 0 ? "an-down" : ""));
        tr.appendChild(el("td", (c.dw >= 0 ? "+" : "−") + Math.abs(Math.round(c.dw * 100)) + "%"));
        tr.appendChild(el("td", fmtDate(c.prev.made_at), "muted"));
        ch.appendChild(tr);
      });
      $("an-chg-note").textContent = "Latest forecast vs the one before it, " + HLABEL[state.anH] + " horizon. Chance up and drift are in percentage points; width is the relative change in range size. Biggest movers first.";
    }

    var ck = $("an-checks"); clear(ck);
    function addCheck(ok, text, items) {
      var li = el("li"); li.appendChild(el("b", ok ? "OK" : "Look", ok ? "an-up" : "an-down"));
      var sp = el("span", text); if (items && items.length) sp.appendChild(el("small", "  " + items.join(", "), "muted"));
      li.appendChild(sp); ck.appendChild(li);
    }
    var mism = data.filter(function (d) { return d.m.up != null && ((d.m.up > 0.5 && d.m.z < -0.15) || (d.m.up < 0.5 && d.m.z > 0.15)); });
    addCheck(!mism.length, mism.length ? mism.length + " forecast(s) where chance up and the AI median clearly disagree on direction (median well on the other side of the start price)." : "Chance up agrees with the AI median for every symbol.", mism.map(function (d) { return d.s; }));
    var allAt = {};
    var nest = [];
    syms.forEach(function (s) {
      var rs = latest[s].map(function (p) { return { h: p.horizon, w: p.ai.high - p.ai.low, st: p.price_at_prediction }; });
      for (var i = 1; i < rs.length; i++) if (rs[i].w / rs[i].st < rs[i - 1].w / rs[i - 1].st) { nest.push(s); break; }
    });
    addCheck(!nest.length, nest.length ? nest.length + " symbol(s) whose range is narrower at a longer horizon than a shorter one." : "Ranges widen with horizon for every symbol.", nest);
    var tight = data.filter(function (d) { return d.m.ratio != null && d.m.ratio < 0.6; }).map(function (d) { return d.s; });
    addCheck(!tight.length, tight.length ? tight.length + " range(s) under 60% of the baseline width: a strong claim to beat the market." : "No range is far tighter than the baseline.", tight);
    var earn = data.filter(function (d) { return earningsIn(d.p); });
    var noEarn = data.filter(function (d) { return !earningsIn(d.p); });
    var me = med(earn, "width"), mn = med(noEarn, "width");
    addCheck(true, earn.length + " of " + data.length + " forecasts include an earnings date." + (me != null && mn != null ? " Median range width " + (me * 100).toFixed(1) + "% with earnings vs " + (mn * 100).toFixed(1) + "% without." : ""), []);
    var tot = 0, unsrc = 0;
    data.forEach(function (d) {
      var c = d.p.catalysts || {};
      ["bull", "base", "bear"].forEach(function (k) { (c[k] || []).forEach(function (it) { tot++; if (!it.source) unsrc++; }); });
    });
    addCheck(true, tot ? Math.round((tot - unsrc) / tot * 100) + "% of catalysts cite a source; " + unsrc + " are the model's own expectation." : "No catalysts listed.", []);
  }

  function render() {
    $("sym-compare").hidden = true;
    var syms = symbols();
    var status = $("status"), outlook = $("outlook");
    if (!syms.length) {
      status.textContent = "No predictions yet.";
      status.hidden = false; outlook.hidden = true;
      return;
    }
    var wanted = decodeURIComponent((location.hash || "").replace("#", ""));
    state.view = wanted === "scorecard" ? "scorecard" : wanted.indexOf("compare") === 0 ? "compare" : wanted === "analysis" ? "analysis" : (wanted === "predictions" || wanted.indexOf("predictions/") === 0) ? "predictions" : wanted === "methodology" ? "methodology" : null;
    if (wanted === "watchlist") { state.homeGroup = "watch"; state.homeView = "cards"; history.replaceState(null, "", "#home"); }
    $("scorecard").hidden = state.view !== "scorecard";
    $("analysis").hidden = state.view !== "analysis";
    $("predictions").hidden = state.view !== "predictions";
    $("method").hidden = state.view !== "methodology";
    $("sym-star").hidden = true;
    $("compare").hidden = state.view !== "compare";
    if (state.view === "predictions") {
      state.symbol = null;
      status.hidden = true; outlook.hidden = true; $("home").hidden = true;
      var pp = wanted.split("/");
      state.pdSym = pp[1] && syms.indexOf(pp[1]) >= 0 ? pp[1] : "all";
      state.pdLimit = PD_PAGE;
      renderTabs();
      $("sym-title").textContent = "Predictions";
      $("sym-name").textContent = "Every forecast, open and resolved, including misses";
      $("sym-price").hidden = true;
      renderPredictions();
      return;
    }
    if (state.view === "methodology") {
      state.symbol = null;
      status.hidden = true; outlook.hidden = true; $("home").hidden = true;
      renderTabs();
      $("sym-title").textContent = "Methodology";
      $("sym-name").textContent = "How forecasts are made and scored, and the limits";
      $("sym-price").hidden = true;
      renderMethod();
      return;
    }
    if (state.view === "analysis") {
      state.symbol = null;
      status.hidden = true; outlook.hidden = true; $("home").hidden = true;
      renderTabs();
      $("sym-title").textContent = "Analysis";
      $("sym-name").textContent = "What the AI forecasts say across every symbol";
      $("sym-price").hidden = true;
      renderAnalysisPage();
      return;
    }
    $("compare").hidden = state.view !== "compare";
    if (state.view === "compare") {
      state.symbol = null;
      status.hidden = true; outlook.hidden = true; $("home").hidden = true;
      renderTabs();
      $("sym-title").textContent = "Compare";
      $("sym-name").textContent = "Forecast ranges side by side, as % moves from each start price";
      $("sym-price").hidden = true;
      renderCompare(wanted);
      return;
    }
    if (state.view === "scorecard") {
      state.symbol = null;
      status.hidden = true; outlook.hidden = true; $("home").hidden = true;
      renderTabs();
      $("sym-title").textContent = "Scorecard";
      $("sym-name").textContent = "Scored forecasts, and whether the AI beats a no-view baseline";
      $("sym-price").hidden = true;
      renderScorecard();
      return;
    }
    if (syms.indexOf(wanted) < 0) {
      state.symbol = null;
      status.hidden = true; outlook.hidden = true; $("home").hidden = false;
      renderTabs();
      $("sym-title").textContent = "Outlook Lab";
      $("sym-name").textContent = "AI forecast ranges scored against a no-view volatility baseline";
      $("sym-price").hidden = true;
      renderHome();
      return;
    }
    $("home").hidden = true;
    state.symbol = wanted;
    var cl = $("sym-compare");
    cl.href = cmpLink([wanted, "SPY", "QQQ"], state.horizon && HLABEL[state.horizon] ? state.horizon : null);
    cl.title = "Compare " + wanted + " with SPY and QQQ";
    cl.hidden = false;
    syncStar();
    var list = forSymbol(state.symbol);
    var rows = latestByHorizon(list);
    status.hidden = true; outlook.hidden = false;
    renderTabs();
    renderHeader(rows);
    renderRows(rows);
    renderChart(rows);
    renderRecord();
    renderAnalysis(rows);
    renderEvents(rows);
    renderStreet(rows);
    renderPast(list);
    $("past-all").href = "#predictions/" + encodeURIComponent(state.symbol);
    var up = $("updated");
    up.textContent = state.summary && state.summary.generated_at ? "Scores updated " + fmtDate(state.summary.generated_at.slice(0, 10)) : "";
  }

  $("sym-star").addEventListener("click", function () { if (state.symbol) { toggleWatch(state.symbol); syncStar(); renderTabs(); } });
  $("all-link").addEventListener("click", function (e) {
    e.preventDefault();
    $("all").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  window.addEventListener("resize", function () { if (!$("home").hidden && state.homeView === "map") renderHome(); if (!$("compare").hidden) renderCompare(location.hash.replace("#", "")); });
  window.addEventListener("hashchange", function () { state.horizon = state.fromHome || null; state.fromHome = null; render(); window.scrollTo(0, 0); });

  Promise.all([
    load("data/predictions.json"),
    load("data/summary.json").catch(function () { return null; }),
    load("data/prices.json").catch(function () { return {}; }),
    load("data/events.json").catch(function () { return { events: [] }; }),
    load("data/meta.json").catch(function () { return null; }),
    load("data/earnings.json").catch(function () { return null; }),
    load("data/ratings.json").catch(function () { return null; })
  ]).then(function (r) {
    state.ratings = r[6];
    state.meta = r[4];
    state.earnings = r[5];
    state.preds = Array.isArray(r[0]) ? r[0] : [];
    state.summary = r[1];
    state.prices = r[2] || {};
    Object.keys(state.prices).forEach(function (k) { var m = state.prices[k]; Object.keys(m).forEach(function (d) { if (typeof m[d] !== "number" || !isFinite(m[d])) delete m[d]; }); });
    state.events = (r[3] && Array.isArray(r[3].events)) ? r[3].events : [];
    render();
  }).catch(function () {
    $("status").textContent = "Could not load predictions.";
  });
})();
