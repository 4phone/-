/* 사거리인터넷 · 다크 모드 색 지킴이 (2026-11-26)
   삼성 인터넷은 휴대폰이 다크 모드면 홈페이지 설정과 상관없이 밝은 바탕·금색 그라데이션·어두운 글자를 강제로 바꿈.
   단, 그림(PNG)으로 그린 색은 그대로 둠 → 삼성 인터넷 + 다크 모드일 때만 밝은 바탕·그라데이션·어두운 글자·로고를
   같은 색의 그림으로 바꿔 그려서 원래 화면 그대로 보이게 함. 다른 브라우저·밝은 모드는 아무것도 안 함.
   보이는 색은 똑같음 · 손님 정보는 다루지 않음 · 점검: 주소 끝에 ?sgdark=1 */
(function () {
    'use strict';
    var ua = navigator.userAgent || '';
    var force = /[?&]sgdark=1/.test(location.search);
    if (!force && !/SamsungBrowser/i.test(ua)) return;
    var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    function on() { return force || !!(mq && mq.matches); }

    var SKIP = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, NOSCRIPT: 1, TEMPLATE: 1, IFRAME: 1, VIDEO: 1, CANVAS: 1, IMG: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, BR: 1, PICTURE: 1, SOURCE: 1, OBJECT: 1, EMBED: 1 };
    var PROPS = ['z-index', 'caret-color', 'box-shadow', 'fill', 'stroke', 'filter', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', '-webkit-mask-image', '-webkit-mask-size', '-webkit-mask-repeat', '-webkit-mask-position', '-webkit-mask-origin', 'mask-image', 'mask-size', 'mask-repeat', 'mask-position', 'mask-origin', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-color', 'background-origin', 'background-clip', '-webkit-background-clip', '-webkit-text-fill-color'];
    var SVGNS = 'http://www.w3.org/2000/svg';
    var MIN = 32, MAXC = 1024;
    var rec = new WeakMap(), seen = new WeakSet();          // 요소 → {st: 원래 인라인 값, p: 가상요소 번호, sv: svg 처리, t: 글자 처리}
    var marked = new Set();
    var active = false, busy = false, timer = 0, lt = 0, pid = 0;
    var pRules = {}, pStyle = null, baseStyle = null;

    /* ---------- 색 ---------- */
    function rgba(s) {
        var m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null;
        var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function bright(c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
    function css(c) { return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + c.a + ')'; }

    /* ---------- 그림(PNG) 만들기 ---------- */
    var cache = {}, nCache = 0;
    function canvas(tw, th, mx) {
        mx = mx || MAXC;
        var cw = Math.min(mx, Math.max(MIN, Math.ceil(tw))), ch = Math.min(mx, Math.max(MIN, Math.ceil(th)));
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        var x = cv.getContext('2d'); x.scale(cw / tw, ch / th);
        return { cv: cv, x: x };
    }
    function png(cv) { return 'url("' + cv.toDataURL('image/png') + '")'; }
    function remember(k, v) { if (nCache > 400) { cache = {}; nCache = 0; } cache[k] = v; nCache++; return v; }
    function solid(c) {
        var k = 's' + css(c); if (cache[k]) return cache[k];
        var o = canvas(MIN, MIN); o.x.fillStyle = css(c); o.x.fillRect(0, 0, MIN, MIN);
        return remember(k, png(o.cv));
    }
    function splitTop(s) {
        var out = [], d = 0, cur = '';
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (ch === '(') d++; else if (ch === ')') d--;
            if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    }
    function lenPx(v, ref) {
        v = (v || '').trim();
        if (/%$/.test(v)) return parseFloat(v) / 100 * ref;
        if (/px$/.test(v)) return parseFloat(v);
        if (v === '0') return 0;
        return NaN;
    }
    function stops(parts, L) {
        var st = [];
        parts.forEach(function (p) {
            var c = rgba(p); if (!c) return;
            var rest = p.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).filter(Boolean);
            if (!rest.length) st.push({ c: c, o: null });
            rest.forEach(function (r) { st.push({ c: c, o: lenPx(r, L) / L }); });
        });
        if (!st.length) return null;
        if (st.length === 1) st.push({ c: st[0].c, o: 1 });
        if (st[0].o == null || isNaN(st[0].o)) st[0].o = 0;
        var e = st[st.length - 1]; if (e.o == null || isNaN(e.o)) e.o = Math.max(1, st[0].o);
        for (var i = 1; i < st.length; i++) {
            if (st[i].o == null || isNaN(st[i].o)) {
                var j = i; while (st[j].o == null || isNaN(st[j].o)) j++;
                var a = st[i - 1].o, b = st[j].o;
                for (var k = i; k < j; k++) st[k].o = a + (b - a) * (k - i + 1) / (j - i + 1);
            }
            if (st[i].o < st[i - 1].o) st[i].o = st[i - 1].o;
        }
        for (var q = 0; q < st.length; q++) {      // 투명 쪽은 옆 색으로 (CSS처럼 어두운 띠가 안 생기게)
            if (st[q].c.a === 0) {
                var nb = null;
                for (var d = 1; d < st.length && !nb; d++) { if (st[q - d] && st[q - d].c.a > 0) nb = st[q - d].c; else if (st[q + d] && st[q + d].c.a > 0) nb = st[q + d].c; }
                if (nb) st[q].c = { r: nb.r, g: nb.g, b: nb.b, a: 0 };
            }
        }
        return st;
    }
    function addStops(g, st, lo, hi) {
        var span = hi - lo || 1;
        st.forEach(function (s) { g.addColorStop(Math.min(1, Math.max(0, (s.o - lo) / span)), css(s.c)); });
    }
    function posXY(tokens, W, H) {
        var kw = { left: 0, center: 50, right: 100, top: 0, bottom: 100 };
        if (!tokens.length) return [W / 2, H / 2];
        var t = tokens.slice(0, 2);
        if (t.length === 1) t.push('center');
        if (/^(top|bottom)$/.test(t[0]) || /^(left|right)$/.test(t[1])) t = [t[1], t[0]];
        function one(v, ref) { if (v in kw) return kw[v] / 100 * ref; return lenPx(v, ref); }
        var x = one(t[0], W), y = one(t[1], H);
        return (isNaN(x) || isNaN(y)) ? null : [x, y];
    }
    function hardStops(parts) {     // 색이 딱 끊기는 그라데이션(줄무늬 등)인지
        var prev = null;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i], c = rgba(p); if (!c) continue;
            var pos = p.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).filter(Boolean);
            if (pos.length > 1) return true;
            if (prev && pos[0] && prev.pos === pos[0] && prev.c !== css(c)) return true;
            prev = { pos: pos[pos.length - 1], c: css(c) };
        }
        return false;
    }
    function opaqueOf(cv) {      // 투명 그림 → 색은 불투명 그림 + 모양은 마스크
        var mask = png(cv), cx = cv.getContext('2d'), id = cx.getImageData(0, 0, cv.width, cv.height), px = id.data, sr = 0, sg = 0, sb = 0, sn = 0, i;
        for (i = 0; i < px.length; i += 4) if (px[i + 3] > 0) { sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; sn++; }
        if (!sn) return null;
        sr /= sn; sg /= sn; sb /= sn;
        for (i = 0; i < px.length; i += 4) { if (px[i + 3] === 0) { px[i] = sr; px[i + 1] = sg; px[i + 2] = sb; } px[i + 3] = 255; }
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.putImageData(id, 0, 0);
        return { color: png(cv), mask: mask };
    }
    function grad(layer, W, H, under, split) {
        var k = 'g' + W + 'x' + H + layer + (under ? css(under) : '') + (split ? 'S' : ''); if (cache[k]) return cache[k];
        var m = /^(linear|radial)-gradient\((.*)\)$/.exec(layer); if (!m) return null;
        var parts = splitTop(m[2]), head = parts[0], o = canvas(W, H, hardStops(parts) ? 1024 : 256), x = o.x, g, st;    // 부드러운 그라데이션은 작게 그려 늘림 (속도)
        if (under) { x.fillStyle = css(under); x.fillRect(0, 0, W, H); }
        if (m[1] === 'linear') {
            var ang = 180;
            if (!rgba(head)) {
                parts.shift();
                var a = /(-?[\d.]+)(deg|turn|rad|grad)/.exec(head);
                if (a) { ang = parseFloat(a[1]); if (a[2] === 'turn') ang *= 360; else if (a[2] === 'rad') ang = ang * 180 / Math.PI; else if (a[2] === 'grad') ang *= 0.9; }
                else if (/^to /.test(head)) {
                    var sx = /right/.test(head) ? 1 : /left/.test(head) ? -1 : 0, sy = /bottom/.test(head) ? 1 : /top/.test(head) ? -1 : 0;
                    if (sx && sy) ang = Math.atan2(sx * H, -sy * W) * 180 / Math.PI;
                    else ang = sx ? (sx > 0 ? 90 : 270) : (sy > 0 ? 180 : 0);
                } else return null;
            }
            var r = ang * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r);
            var L = Math.abs(W * dx) + Math.abs(H * dy); if (!(L > 0)) return null;
            st = stops(parts, L); if (!st) return null;
            var lo = Math.min(0, st[0].o), hi = Math.max(1, st[st.length - 1].o);
            var sx0 = W / 2 - dx * L / 2, sy0 = H / 2 - dy * L / 2;
            g = x.createLinearGradient(sx0 + dx * L * lo, sy0 + dy * L * lo, sx0 + dx * L * hi, sy0 + dy * L * hi);
            addStops(g, st, lo, hi);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
        } else {
            var shape = 'ellipse', size = 'farthest-corner', at = [], rx = null, ry = null;
            if (!rgba(head)) {
                parts.shift();
                var tk = head.split(/\s+/), i = tk.indexOf('at');
                var pre = i >= 0 ? tk.slice(0, i) : tk; at = i >= 0 ? tk.slice(i + 1) : [];
                var lens = [];
                pre.forEach(function (t) { if (t === 'circle' || t === 'ellipse') shape = t; else if (/^(closest|farthest)-(side|corner)$/.test(t)) size = t; else if (t) lens.push(t); });
                if (lens.length) { size = null; rx = lenPx(lens[0], W); ry = lens.length > 1 ? lenPx(lens[1], H) : rx; }
            }
            var c = posXY(at, W, H); if (!c) return null;
            var cx = c[0], cy = c[1];
            if (size) {
                var far = size.indexOf('farthest') === 0, fx = far ? Math.max : Math.min;
                var hx = fx(cx, W - cx), hy = fx(cy, H - cy);
                if (/side$/.test(size)) { if (shape === 'circle') { rx = ry = fx(hx, hy); } else { rx = hx; ry = hy; } }
                else if (shape === 'circle') { var c1 = Math.sqrt(cx * cx + cy * cy), c2 = Math.sqrt((W - cx) * (W - cx) + cy * cy), c3 = Math.sqrt(cx * cx + (H - cy) * (H - cy)), c4 = Math.sqrt((W - cx) * (W - cx) + (H - cy) * (H - cy)); rx = ry = fx(fx(c1, c2), fx(c3, c4)); }
                else { rx = hx * Math.SQRT2; ry = hy * Math.SQRT2; }
            }
            if (!(rx > 0) || !(ry > 0)) return null;
            st = stops(parts, rx); if (!st) return null;
            var hi2 = Math.max(1, st[st.length - 1].o);
            x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
            g = x.createRadialGradient(0, 0, 0, 0, 0, rx * hi2);
            addStops(g, st, 0, hi2);
            x.fillStyle = g; x.fillRect(-cx, -cy * rx / ry, W, H * rx / ry);
            x.restore();
        }
        return remember(k, split ? opaqueOf(o.cv) : png(o.cv));
    }

    /* ---------- 바탕 계산 (요소·가상요소 공통) ---------- */
    function boxOf(cs, el) {     // 테두리 상자 크기
        if (el) return [el.offsetWidth, el.offsetHeight];
        var w = parseFloat(cs.width), h = parseFloat(cs.height);
        if (isNaN(w) || isNaN(h)) return null;
        if (cs.boxSizing !== 'border-box') {
            w += (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
            h += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
        }
        return [w, h];
    }
    /* 뒤에 깔린 색 (반투명 색을 불투명으로 섞을 때) */
    var origBg = new WeakMap(), origImg = new WeakMap();
    function over(top, bot) {
        var a = top.a + bot.a * (1 - top.a); if (!(a > 0)) return { r: 0, g: 0, b: 0, a: 0 };
        return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a: a };
    }
    function summary(cs) {
        var c = rgba(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 }, bi = cs.backgroundImage;
        if (bi && bi !== 'none' && /gradient\(/.test(bi)) {
            var ly = splitTop(bi).filter(function (l) { return /gradient\(/.test(l); }).pop();
            if (ly) {
                var cols = (ly.match(/rgba?\([^)]*\)/g) || []).map(rgba);
                if (cols.length) {
                    var t = { r: 0, g: 0, b: 0, a: 0 };
                    cols.forEach(function (k) { t.r += k.r; t.g += k.g; t.b += k.b; t.a += k.a; });
                    var n = cols.length; c = over({ r: t.r / n, g: t.g / n, b: t.b / n, a: t.a / n }, c);
                }
            }
        }
        return c.a > 0.01 ? c : null;
    }
    function backdrop(e) {
        var stack = [], base = null;
        for (; e && e.nodeType === 1; e = e.parentElement) {
            var c = origBg.has(e) ? origBg.get(e) : summary(getComputedStyle(e));
            if (!c) continue;
            if (c.a >= 0.99) { base = c; break; }
            stack.push(c);
        }
        base = base || { r: 255, g: 255, b: 255, a: 1 };
        for (var i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
        base.a = 1; return base;
    }
    function flatBack(e) {      // 뒤 바탕이 그림 없이 단색일 때만
        for (; e && e.nodeType === 1; e = e.parentElement) {
            var cs = getComputedStyle(e);
            if (origImg.has(e) ? origImg.get(e) : (cs.backgroundImage && cs.backgroundImage !== 'none')) return null;
            var c = origBg.has(e) ? origBg.get(e) : summary(cs);
            if (c && c.a >= 0.99) return backdrop(e);
        }
        return backdrop(document.body);
    }
    function bgPlan(cs, el, host, maskOK) {     // 바꿀 값 {속성: 값} · 필요 없으면 null · 크기 모르면 'later'
        var mk = {};
        maskOK = maskOK && (cs.webkitMaskImage || cs.maskImage || 'none') === 'none';
        var bgc = rgba(cs.backgroundColor), bgi = cs.backgroundImage;
        var clip = cs.webkitBackgroundClip || cs.backgroundClip || '', txt = /text/.test(clip);
        var hasGrad = bgi && bgi !== 'none' && /gradient\(/.test(bgi);
        var lightBg = !txt && bgc && bgc.a >= 0.5 && bright(bgc) > 50;
        var sides = [];      // 밝은 테두리 (변마다)
        if (!txt) ['top', 'right', 'bottom', 'left'].forEach(function (sd) {
            var w = parseFloat(cs.getPropertyValue('border-' + sd + '-width')) || 0, st = cs.getPropertyValue('border-' + sd + '-style'), c = rgba(cs.getPropertyValue('border-' + sd + '-color'));
            if (w > 0 && st === 'solid' && c && c.a >= 0.3 && bright(c) > 50) sides.push({ s: sd, w: w, c: c });
        });
        var border = sides.length > 0;
        function strips(I, S, P, R, O, C, base, d) {
            sides.forEach(function (x) {
                I.push(solid(x.c.a >= 0.99 ? x.c : over(x.c, base)));
                S.push(x.s === 'top' || x.s === 'bottom' ? '100% ' + x.w + 'px' : x.w + 'px 100%');
                P.push(x.s === 'bottom' ? '0 100%' : x.s === 'right' ? '100% 0' : '0 0');
                R.push('no-repeat'); O.push('border-box'); C.push('border-box');
                d['border-' + x.s + '-color'] = 'transparent';
            });
            d['background-position'] = P.join(', ');
        }
        var back = null;
        if (!hasGrad && !lightBg) {
            if (!border || (bgc && bgc.a > 0.02) || (bgi && bgi !== 'none')) return null;
            var fb = flatBack(host); if (!fb) return null;        // 바탕 없는 밝은 테두리: 뒤가 단색일 때만
            var d0 = { 'background-color': 'transparent' }, I0 = [solid(fb)], S0 = ['100% 100%'], P0 = ['0 0'], R0 = ['no-repeat'], O0 = ['border-box'], C0 = ['padding-box'];
            strips(I0, S0, P0, R0, O0, C0, fb, d0);
            d0['background-image'] = I0.join(', '); d0['background-size'] = S0.join(', '); d0['background-repeat'] = R0.join(', ');
            d0['background-origin'] = O0.join(', '); d0['background-clip'] = d0['-webkit-background-clip'] = C0.join(', ');
            return d0;
        }
        function bk() { return back || (back = backdrop(host)); }
        var layers = bgi && bgi !== 'none' ? splitTop(bgi) : [];
        var n = layers.length;
        function rep(s) { var a = splitTop(s), out = []; for (var q = 0; q < n; q++) out.push(a[q % a.length]); return out; }
        var I = [], S = rep(cs.backgroundSize), P = rep(cs.backgroundPosition), R = rep(cs.backgroundRepeat), O = rep(cs.backgroundOrigin), C = rep(clip);
        var under = bgc && bgc.a > 0 ? (bgc.a >= 0.99 ? bgc : over(bgc, bk())) : null;    // 그라데이션 아래 색
        if (hasGrad) {
            var bx = boxOf(cs, el); if (!bx || !(bx[0] > 0) || !(bx[1] > 0)) return 'later';
            var bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
            var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
            var anyDone = false;
            for (var li = 0; li < n; li++) {
                var ly = layers[li];
                if (!/^(linear|radial)-gradient\(/.test(ly)) { I.push(ly); continue; }
                var al = (ly.match(/rgba?\([^)]*\)/g) || []).map(function (k) { return rgba(k).a; });
                var maxA = Math.max.apply(null, al.concat(0)), minA = Math.min.apply(null, al.concat(1));
                if (!txt && maxA < 0.5 && !(maskOK && n === 1)) { I.push(ly); continue; }        // 아주 옅은 빛 번짐은 그대로
                var W = bx[0], H = bx[1], o = O[li] || 'padding-box';
                if (o !== 'border-box') { W -= bl + br; H -= bt + bb; }
                if (o === 'content-box') { W -= pl + pr; H -= pt + pb; }
                var sz = (S[li] || 'auto').split(/\s+/), tw, th;
                if (sz[0] === 'cover' || sz[0] === 'contain') { tw = W; th = H; }
                else { tw = sz[0] === 'auto' ? W : lenPx(sz[0], W); th = (!sz[1] || sz[1] === 'auto') ? H : lenPx(sz[1], H); }
                tw = Math.round(tw * 10) / 10; th = Math.round(th * 10) / 10;
                if (!(tw > 0) || !(th > 0)) return null;
                var fillUnder = null, split = false;
                if (!txt && minA < 0.99) {        // 반투명 그라데이션
                    if (under && li === n - 1) fillUnder = under;                 // 자기 바탕색 위 → 섞어서 불투명
                    else if (maskOK && n === 1) split = true;                     // 빈 장식 → 색 + 마스크
                    else { I.push(ly); continue; }
                }
                var u = grad(ly, tw, th, fillUnder, split); if (!u) return null;
                if (split) {
                    I.push(u.color);
                    ['-webkit-mask', 'mask'].forEach(function (mp) { mk[mp + '-image'] = u.mask; mk[mp + '-size'] = tw + 'px ' + th + 'px'; mk[mp + '-repeat'] = R[li]; mk[mp + '-position'] = P[li]; mk[mp + '-origin'] = O[li]; });
                } else I.push(u);
                S[li] = tw + 'px ' + th + 'px'; anyDone = true;
            }
            if (!anyDone && !lightBg) return null;
        } else I = layers.slice();
        var d = {};
        if (lightBg) {
            I.push(solid(bgc.a >= 0.99 ? bgc : under)); S.push('100% 100%'); P.push('0 0'); R.push('no-repeat'); O.push('border-box');
            C.push(cs.backgroundClip && !/text/.test(cs.backgroundClip) ? splitTop(cs.backgroundClip).slice(-1)[0] : 'border-box');
            d['background-color'] = 'transparent';
        }
        if (border && (lightBg || (under && under.a >= 0.99))) {      // 밝은 테두리 → 바탕 그림 맨 아래에 테두리 띠, 위 그림은 안쪽만
            if (!lightBg) { I.push(solid(under)); S.push('100% 100%'); P.push('0 0'); R.push('no-repeat'); O.push('border-box'); C.push('padding-box'); d['background-color'] = 'transparent'; }
            C = C.map(function (c) { return c === 'border-box' ? 'padding-box' : c; });
            strips(I, S, P, R, O, C, under || bk(), d);
        }
        d['background-image'] = I.join(', '); d['background-size'] = S.join(', ');
        d['background-repeat'] = R.join(', '); d['background-origin'] = O.join(', ');
        if (!txt) { d['background-clip'] = C.join(', '); d['-webkit-background-clip'] = C.join(', '); }
        for (var mkk in mk) d[mkk] = mk[mkk];
        return d;
    }

    /* ---------- 요소에 적용 / 되돌리기 ---------- */
    function R_(el) { var r = rec.get(el); if (!r) { r = {}; rec.set(el, r); marked.add(el); el.setAttribute('data-sgdk', ''); } return r; }
    function setStyles(el, d) {
        var r = R_(el);
        if (!r.st) { r.st = {}; PROPS.forEach(function (p) { r.st[p] = [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]; }); }
        for (var p in d) el.style.setProperty(p, d[p], 'important');
    }
    function undo(el) {
        var r = rec.get(el); if (!r) return;
        if (r.invRoot && r.invRoot !== el && rec.has(r.invRoot)) { var root = r.invRoot; undo(root); seen.delete(root); if (active) queue(root); return; }     // 거꾸로 칠한 묶음은 통째로
        if (r.kids) { var ks = r.kids; r.kids = null; ks.forEach(function (k) { var kr = rec.get(k); if (kr) kr.invRoot = null; undo(k); }); }
        if (r.st) PROPS.forEach(function (p) { if (r.st[p][0]) el.style.setProperty(p, r.st[p][0], r.st[p][1]); else el.style.removeProperty(p); });
        if (r.p) { delete pRules[r.p]; el.removeAttribute('data-sgdk-p'); pDirty = true; }
        if (r.t) el.classList.remove('sgdk-t');
        if (r.w) r.w.forEach(function (s) { var p = s.parentNode; if (!p) return; while (s.firstChild) p.insertBefore(s.firstChild, s); p.removeChild(s); });
        if (r.sv === 1) { Array.prototype.forEach.call(el.children, function (c) { c.style.removeProperty('visibility'); }); }
        rec.delete(el); marked.delete(el); seen.delete(el); el.removeAttribute('data-sgdk');
    }
    var pDirty = false;
    function flushP() {
        if (!pDirty) return; pDirty = false;
        if (!pStyle) { pStyle = document.createElement('style'); document.head.appendChild(pStyle); }
        var t = ''; for (var k in pRules) t += pRules[k]; pStyle.textContent = t;
    }
    function hasText(el) {
        for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
        return false;
    }
    function textPaint(el, cs, ownBg) {      // 어두운 글자 → 같은 색 그림으로 칠함
        var c = rgba(cs.color);
        if (!c || c.a < 0.5 || bright(c) > 170) return;      // 아주 옅은 워터마크 글자는 그대로
        var fill = rgba(cs.webkitTextFillColor); if (fill && fill.a === 0) return;
        if (/text/.test(cs.webkitBackgroundClip || '')) return;
        clipPaint(el, cs, c.a >= 0.99 ? c : over(c, backdrop(el)), ownBg);
    }
    function clipPaint(el, cs, col, ownBg) {
        var url = solid(col), r = R_(el);
        var bgc = rgba(cs.backgroundColor), bgi = cs.backgroundImage;
        if (!ownBg && (!bgi || bgi === 'none') && !(bgc && bgc.a > 0)) {
            setStyles(el, { 'background-image': url, 'background-size': '100% 100%', 'background-repeat': 'repeat', 'background-origin': 'border-box', '-webkit-background-clip': 'text', 'background-clip': 'text', '-webkit-text-fill-color': 'transparent' });
            el.classList.add('sgdk-t'); r.t = 1;
        } else {
            r.w = r.w || [];
            for (var n = el.firstChild; n; n = n.nextSibling) {
                if (n.nodeType === 3 && /\S/.test(n.nodeValue)) {
                    var s = document.createElement('span'); s.className = 'sgdk-w';
                    s.style.cssText = 'background-image:' + url + '!important;background-size:100% 100%!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important';
                    el.insertBefore(s, n); s.appendChild(n); r.w.push(s); n = s;
                }
            }
        }
    }
    var SVGP = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stop-color', 'stop-opacity', 'stroke-linecap', 'stroke-linejoin', 'font-size', 'font-family', 'font-weight', 'display', 'visibility', 'fill-rule'];
    function svgNeeds(svg) {
        var all = svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,text,use');
        for (var i = 0; i < all.length; i++) {
            var cs = getComputedStyle(all[i]);
            if (cs.display === 'none') continue;
            var f = cs.fill, s = cs.stroke;
            if (/url\(/.test(f) || /url\(/.test(s)) return true;
            var fc = rgba(f), sc = rgba(s);
            if ((fc && fc.a > 0.05 && f !== 'none' && bright(fc) < 170) || (sc && sc.a > 0.05 && s !== 'none' && bright(sc) < 170)) return true;
        }
        return false;
    }
    function svgInvert(svg) {     // 어두운 단색 아이콘: 색을 거꾸로 칠하고 filter: invert(1)로 되돌림
        var all = svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,text,use,g'), list = [];
        for (var i = 0; i < all.length; i++) {
            var cs = getComputedStyle(all[i]), f = cs.fill, st = cs.stroke, d = {};
            if (/url\(/.test(f) || /url\(/.test(st)) return false;
            var fc = rgba(f), sc = rgba(st);
            if (fc && f !== 'none') { if (bright(fc) > 120 && fc.a > 0.05) return false; d.fill = inv(fc); }
            if (sc && st !== 'none') { if (bright(sc) > 120 && sc.a > 0.05) return false; d.stroke = inv(sc); }
            list.push([all[i], d]);
        }
        var f0 = getComputedStyle(svg).filter;
        setStyles(svg, { filter: 'invert(1)' + (f0 && f0 !== 'none' ? ' ' + f0 : '') }); R_(svg).sv = 2;
        list.forEach(function (x) { if (Object.keys(x[1]).length) { setStyles(x[0], x[1]); var rx = R_(x[0]); rx.inv = 1; rx.invRoot = svg; (R_(svg).kids = R_(svg).kids || []).push(x[0]); } seen.add(x[0]); });
        return true;
    }
    function svgPaint(svg) {      // 인라인 로고·아이콘 → 같은 모양의 PNG로
        var r = R_(svg); if (r.sv) return; r.sv = 1;
        var w = svg.getBoundingClientRect(), cw = svg.clientWidth || w.width, chh = svg.clientHeight || w.height;
        if (!(cw > 0) || !(chh > 0)) { r.sv = 0; return 'later'; }
        var cl = svg.cloneNode(true), src = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll('*'))), dst = [cl].concat(Array.prototype.slice.call(cl.querySelectorAll('*')));
        src.forEach(function (e, i) { var cs = getComputedStyle(e), t = dst[i]; SVGP.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) t.style.setProperty(p, v); }); });
        cl.setAttribute('xmlns', SVGNS); cl.setAttribute('width', cw); cl.setAttribute('height', chh); cl.style.removeProperty('display');
        var ids = {}; cl.querySelectorAll('[id]').forEach(function (e) { ids[e.id] = 1; });
        var refs = (cl.outerHTML.match(/url\(["']?#([^"')]+)/g) || []).map(function (u) { return u.replace(/url\(["']?#/, ''); });
        refs.forEach(function (id) { if (!ids[id]) { var d = document.getElementById(id); if (d) { var dd = cl.querySelector('defs') || cl.insertBefore(document.createElementNS(SVGNS, 'defs'), cl.firstChild); dd.appendChild(d.cloneNode(true)); ids[id] = 1; } } });
        var img = new Image(), sc = Math.min(4, Math.max(2, window.devicePixelRatio || 2));
        img.onload = function () {
            if (!active || !svg.isConnected || rec.get(svg) !== r) return;
            var cv = document.createElement('canvas'); cv.width = Math.max(MIN, Math.round(cw * sc)); cv.height = Math.max(MIN, Math.round(chh * sc));
            var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cv.width, cv.height);
            var mask = png(cv), id = cx.getImageData(0, 0, cv.width, cv.height), px = id.data, sr = 0, sg = 0, sb = 0, sn = 0, i;
            for (i = 0; i < px.length; i += 4) if (px[i + 3] > 0) { sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; sn++; }
            if (!sn) return;
            sr /= sn; sg /= sn; sb /= sn;
            for (i = 0; i < px.length; i += 4) { if (px[i + 3] === 0) { px[i] = sr; px[i + 1] = sg; px[i + 2] = sb; } px[i + 3] = 255; }
            cx.putImageData(id, 0, 0);     // 색은 불투명 그림, 모양은 마스크로 (다크 모드가 투명 그림을 뒤집지 않게)
            busy = true;
            setStyles(svg, { 'background-image': png(cv), 'background-size': '100% 100%', 'background-repeat': 'no-repeat', 'background-position': '0 0', 'background-origin': 'border-box', 'background-color': 'transparent',
                '-webkit-mask-image': mask, '-webkit-mask-size': '100% 100%', '-webkit-mask-repeat': 'no-repeat', 'mask-image': mask, 'mask-size': '100% 100%', 'mask-repeat': 'no-repeat' });
            Array.prototype.forEach.call(svg.children, function (c) { if (c.style) c.style.setProperty('visibility', 'hidden', 'important'); });
            obs && obs.takeRecords(); busy = false;
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(cl));
    }
    /* 작은 흰 바탕 + 어두운 글자 (월 표시 칩 등): 색을 거꾸로 칠하고 filter: invert(1)로 되돌림 → 다크 모드가 못 건드림 */
    function inv(c) { return 'rgba(' + (255 - Math.round(c.r)) + ',' + (255 - Math.round(c.g)) + ',' + (255 - Math.round(c.b)) + ',' + c.a + ')'; }
    function invertMode(el, cs) {
        var bgc = rgba(cs.backgroundColor);
        if (!bgc || bgc.a < 0.95 || bright(bgc) < 200 || cs.backgroundImage !== 'none' || cs.filter !== 'none' || cs.boxShadow !== 'none') return false;
        if (!hasText(el) && !el.querySelector('*')) return false;
        if (el.offsetWidth * el.offsetHeight > 40000) return false;
        if (['::before', '::after'].some(function (ps) { var p = getComputedStyle(el, ps); return p.content && p.content !== 'none' && p.display !== 'none'; })) return false;
        var kids = el.querySelectorAll('*'), list = [[el, cs]];
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i], kc = getComputedStyle(k), kb = rgba(kc.backgroundColor) || { a: 0 };
            if (SKIP[k.tagName] || k.namespaceURI === SVGNS || kc.backgroundImage !== 'none' || kc.boxShadow !== 'none' || kc.filter !== 'none') return false;
            if (kb.a > 0 && (kb.a < 0.95 || bright(kb) < 200)) return false;
            list.push([k, kc]);
        }
        for (var j = 0; j < list.length; j++) { var tc = rgba(list[j][1].color); if (!tc || tc.a < 0.99 || bright(tc) > 200) return false; }
        list.forEach(function (x, idx) {
            var e = x[0], c = x[1], d = {}, b = rgba(c.backgroundColor);
            if (b && b.a > 0) d['background-color'] = inv(b);
            ['top', 'right', 'bottom', 'left'].forEach(function (sd) {
                var bc = rgba(c.getPropertyValue('border-' + sd + '-color'));
                if ((parseFloat(c.getPropertyValue('border-' + sd + '-width')) || 0) > 0 && bc) d['border-' + sd + '-color'] = inv(bc);
            });
            if (!idx) d.filter = 'invert(1)';
            var tc = rgba(c.color), p = { r: 255 - tc.r, g: 255 - tc.g, b: 255 - tc.b, a: 1 };
            d.color = inv(tc);
            setStyles(e, d); var re = R_(e); re.inv = 1; seen.add(e);
            if (idx) { re.invRoot = el; (R_(el).kids = R_(el).kids || []).push(e); }
            if (bright(p) < 160 && hasText(e)) clipPaint(e, getComputedStyle(e), p, !!(b && b.a > 0));   // 거꾸로 색이 어두우면 글자는 그림으로
        });
        return true;
    }
    function fieldMode(el) {      // 입력 칸·고르기 칸: 흰 바탕·어두운 글자 그대로 (거꾸로 칠하고 invert)
        var cs = getComputedStyle(el), b = rgba(cs.backgroundColor), t = rgba(cs.color);
        if (/^(checkbox|radio|range|color|file|hidden|image|submit|button|reset)$/i.test(el.type || '')) return;
        if (!b || b.a < 0.95 || bright(b) < 200 || !t || bright(t) > 160 || cs.backgroundImage !== 'none' || cs.filter !== 'none') return;
        var d = { 'background-color': inv(b), color: inv(t), filter: 'invert(1)', 'caret-color': inv(rgba(cs.caretColor) || t) };
        ['top', 'right', 'bottom', 'left'].forEach(function (sd) {
            var bc = rgba(cs.getPropertyValue('border-' + sd + '-color'));
            if ((parseFloat(cs.getPropertyValue('border-' + sd + '-width')) || 0) > 0 && bc) d['border-' + sd + '-color'] = inv(bc);
        });
        var sh = cs.boxShadow; if (sh && sh !== 'none') d['box-shadow'] = sh.replace(/rgba?\([^)]*\)/g, function (m) { return inv(rgba(m)); });
        setStyles(el, d);
        if (el.parentElement) Array.prototype.forEach.call(el.parentElement.children, function (sb) {      // 칸 위에 얹힌 아이콘이 가려지지 않게
            if (sb === el) return;
            var sc = getComputedStyle(sb);
            if (/absolute|fixed/.test(sc.position) && sc.zIndex === 'auto') { setStyles(sb, { 'z-index': '1' }); }
        });
        var r = R_(el), ph = rgba(getComputedStyle(el, '::placeholder').color);
        if (ph) { if (!r.p) { r.p = 'p' + (++pid); el.setAttribute('data-sgdk-p', r.p); } pRules[r.p + 'ph'] = '[data-sgdk-p="' + r.p + '"]::placeholder{color:' + inv(ph) + '!important}'; pDirty = true; }
    }
    var pseudoSel = '', nRules = -1;
    function buildPseudo() {       // ::before/::after에 바탕·테두리가 있는 규칙만 골라 둠 (모든 요소를 확인하면 느림)
        var sels = [], n = 0;
        function walk(rules) {
            for (var i = 0; i < rules.length; i++) {
                var r = rules[i]; n++;
                if (r.cssRules && !r.selectorText) { try { walk(r.cssRules); } catch (e) { } continue; }
                if (!r.selectorText || !/:(before|after)/.test(r.selectorText) || !r.style) continue;
                var st = r.style;
                if (!(st.background || st.backgroundImage || st.backgroundColor || st.borderColor || st.borderTopColor || st.borderBottomColor || st.border || st.borderTop || st.borderBottom)) continue;
                r.selectorText.split(',').forEach(function (x) {
                    if (!/:(before|after)/.test(x)) return;
                    var b = x.replace(/::?(before|after)\b/g, '').replace(/:(hover|focus|active|focus-visible|focus-within)\b/g, '').trim() || '*';
                    try { document.querySelector(b); sels.push(b); } catch (e) { }
                });
            }
        }
        for (var i = 0; i < document.styleSheets.length; i++) { try { walk(document.styleSheets[i].cssRules); } catch (e) { } }
        if (n !== nRules) { nRules = n; pseudoSel = sels.filter(function (v, k, a) { return a.indexOf(v) === k; }).join(','); }
    }
    function doEl(el) {
        var later = false, cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.display === 'contents' && !hasText(el)) return false;
        if (el.namespaceURI === SVGNS) {
            if (el.tagName.toLowerCase() === 'svg' && !(el.ownerSVGElement) && svgNeeds(el)) { if (svgInvert(el)) return false; return svgPaint(el) === 'later'; }
            return false;
        }
        if (!origBg.has(el)) { origBg.set(el, summary(cs)); origImg.set(el, !!(cs.backgroundImage && cs.backgroundImage !== 'none')); }
        if (invertMode(el, cs)) return false;
        var d = bgPlan(cs, el, el.parentElement, !el.firstChild), ownBg = false;
        if (d === 'later') later = true;
        else if (d) { setStyles(el, d); ownBg = true; }
        if (pseudoSel && el.matches(pseudoSel)) ['::before', '::after'].forEach(function (ps) {
            var pc = getComputedStyle(el, ps);
            if (!pc.content || pc.content === 'none' || pc.display === 'none') return;
            var pd = bgPlan(pc, null, el, pc.content === '""');
            if (pd === 'later') { later = true; return; }
            if (!pd) return;
            var r = R_(el); if (!r.p) { r.p = 'p' + (++pid); el.setAttribute('data-sgdk-p', r.p); }
            var t = ''; for (var k in pd) t += k + ':' + pd[k] + '!important;';
            pRules[r.p + ps] = '[data-sgdk-p="' + r.p + '"]' + ps + '{' + t + '}'; pDirty = true;
        });
        if (hasText(el)) textPaint(el, getComputedStyle(el), ownBg);
        return later;
    }
    var work = [], wi = 0, working = false, retry = [], rt = 0;
    function scan(root, first) {      // 할 일에 넣기 → 조금씩 나눠 처리 (화면 멈춤 없게)
        if (!active || !root || !root.isConnected) return;
        var list = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
        if (first) {        // 처음에는 지금 보이는 곳부터
            var H = window.innerHeight * 1.5, near = [], far = [];
            list.forEach(function (e) { var r = e.getBoundingClientRect(); (r.bottom > -50 && r.top < H ? near : far).push(e); });
            list = near.concat(far);
        }
        for (var i = 0; i < list.length; i++) work.push(list[i]);
        if (!working) { working = true; setTimeout(step, 0); }
    }
    function one(el) {
        if (seen.has(el) || !el.isConnected || (el.classList && el.classList.contains('sgdk-w'))) return;
        seen.add(el);
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) { try { fieldMode(el); } catch (e) { } return; }
        if (SKIP[el.tagName]) return;
        if (el.namespaceURI === SVGNS && el.tagName.toLowerCase() !== 'svg') return;
        try { if (doEl(el)) { seen.delete(el); retry.push(el); } } catch (e) { /* 한 요소 실패는 건너뜀 */ }
    }
    function step() {
        if (!active) { working = false; work = []; wi = 0; return; }
        busy = true;
        var t = performance.now();
        while (wi < work.length && performance.now() - t < 12) one(work[wi++]);
        flushP(); if (obs) obs.takeRecords(); busy = false;
        if (wi < work.length) { setTimeout(step, 0); return; }
        work = []; wi = 0; working = false;
        if (retry.length) { clearTimeout(rt); rt = setTimeout(function () { var r = retry.splice(0); r.forEach(function (e) { if (e.isConnected) work.push(e); }); if (work.length && !working) { working = true; setTimeout(step, 0); } }, 900); }
    }
    function undoAll() { busy = true; Array.from(marked).forEach(undo); pRules = {}; pDirty = true; flushP(); if (obs) obs.takeRecords(); busy = false; }
    function undoTree(el) {
        undo(el);
        if (el.querySelectorAll) el.querySelectorAll('[data-sgdk]').forEach(undo);
    }
    var pend = [], full = false;
    function queue(el) { if (el) pend.push(el); else full = true; clearTimeout(timer); timer = setTimeout(run, 100); }
    function run() {
        if (!active) return;
        if (full) { full = false; pend = []; buildPseudo(); scan(document.body); }
        else pend.splice(0).forEach(function (el) { scan(el); });
    }
    var obs = window.MutationObserver ? new MutationObserver(function (recs) {
        if (busy || !active) return;
        busy = true;
        recs.forEach(function (r) {
            if (r.type === 'childList') {
                var txt = false;
                r.addedNodes.forEach(function (n) { if (n.nodeType === 1 && !(n.classList && n.classList.contains('sgdk-w'))) queue(n); else if (n.nodeType === 3 && /\S/.test(n.nodeValue)) txt = true; });
                if (txt && r.target.nodeType === 1) { var tg = r.target.classList && r.target.classList.contains('sgdk-w') ? r.target.parentElement : r.target; if (tg && rec.has(tg) && rec.get(tg).w) { undo(tg); } if (tg) { seen.delete(tg); queue(tg); } }      // 글자가 새로 바뀐 칸은 다시 칠함
            }
            else if (r.target.nodeType === 1 && r.target !== pStyle) { undoTree(r.target); seen.delete(r.target); r.target.querySelectorAll('*').forEach(function (k) { seen.delete(k); }); queue(r.target); }
        });
        flushP(); obs.takeRecords(); busy = false;
    }) : null;

    function start() {
        if (active) return;
        active = true;
        if (!baseStyle) { baseStyle = document.createElement('style'); baseStyle.textContent = ':where(.sgdk-t) > :where(*){-webkit-text-fill-color:currentColor}'; document.head.appendChild(baseStyle); }
        baseStyle.disabled = false;
        buildPseudo(); scan(document.body, true);
        if (obs) obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
        setTimeout(function () { queue(); }, 1500);
    }
    function stop() {
        if (!active) return;
        active = false; if (obs) obs.disconnect(); undoAll(); if (baseStyle) baseStyle.disabled = true;
    }
    var rz = 0, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
        if (!active || window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rz);
        rz = setTimeout(function () { undoAll(); queue(); }, 300);
    });
    function go() { if (on()) start(); else stop(); }
    if (mq && mq.addEventListener) mq.addEventListener('change', go); else if (mq && mq.addListener) mq.addListener(go);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    window.addEventListener('load', function () { if (active) queue(); });
    window.sgDarkFix = { rescan: function () { if (active) queue(); } };
})();
