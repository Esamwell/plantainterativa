/* =========================================================================
   Planta Interativa — vista 3D
   Monta um modelo 3D a partir da mesma planta 2D (paredes, portas, janelas
   e móveis) e desenha num <canvas>, sem biblioteca externa: projeção em
   perspectiva + ordenação por profundidade (algoritmo do pintor).
   Escala: as mesmas unidades do desenho (≈ 1 unidade = 10 cm reais).
   ========================================================================= */
window.Planta3D = (function () {
'use strict';

var H_PORTA = 21, JAN_BASE = 11, JAN_TOPO = 21;   // alturas de vãos
var LUZ = normalizar([0.45, 0.82, 0.36]);

var COR = {
  piso:      [206, 196, 180],
  parede:    [237, 234, 228],
  porta:     [156, 110, 68],
  vidro:     [150, 198, 224],
  movel:     [178, 152, 122],
  estofado:  [108, 122, 140],
  louca:     [242, 242, 246],
  metal:     [172, 176, 182],
  verde:     [92, 138, 84],
  teto:      [248, 247, 244]
};

/* material/altura de cada bloco. Ausente => caixa simples de 8 de altura. */
var MAT = {
  retangulo:   { a: 8,   c: 'movel' },
  mesa_ret:    { a: 7.5, c: 'movel' },
  mesa_redonda:{ a: 7.5, c: 'movel', f: 'cilindro' },
  mesa_reuniao:{ a: 7.5, c: 'movel' },
  cadeira:     { a: 9,   c: 'estofado', f: 'cadeira' },
  sofa2:       { a: 8,   c: 'estofado', f: 'sofa' },
  sofa3:       { a: 8,   c: 'estofado', f: 'sofa' },
  poltrona:    { a: 8,   c: 'estofado', f: 'sofa' },
  cama_solteiro:{ a: 5,  c: 'estofado', f: 'cama' },
  cama_casal:  { a: 5,   c: 'estofado', f: 'cama' },
  criado:      { a: 5,   c: 'movel' },
  armario:     { a: 20,  c: 'movel' },
  estante:     { a: 18,  c: 'movel' },
  rack:        { a: 5,   c: 'movel' },
  pia_cozinha: { a: 9,   c: 'movel' },
  fogao:       { a: 9,   c: 'metal' },
  geladeira:   { a: 18,  c: 'metal' },
  micro:       { a: 3,   c: 'metal' },
  maq_lavar:   { a: 9,   c: 'louca' },
  tanque:      { a: 9,   c: 'louca' },
  vaso:        { a: 4.2, c: 'louca' },
  lavatorio:   { a: 8.5, c: 'louca' },
  cuba_bancada:{ a: 9,   c: 'movel' },
  box:         { a: 20,  c: 'vidro', f: 'box' },
  banheira:    { a: 5,   c: 'louca' },
  escada:      { a: 2,   c: 'movel', f: 'escada' },
  planta:      { a: 8,   c: 'verde', f: 'cilindro' }
};
/* símbolos que só fazem sentido no 2D (elétrica, anotações) */
var PULAR = { norte:1, hachura:1, coifa:1, ponto_luz:1, luminaria:1, spot:1,
              quadro:1, ar_split:1, ponto_rede:1, ponto_tv:1, campainha:1 };

/* ------------------------------------------------------------- vetores -- */
function normalizar(v) {
  var n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}
function normalDe(p) {
  var ax = p[1][0]-p[0][0], ay = p[1][1]-p[0][1], az = p[1][2]-p[0][2];
  var bx = p[2][0]-p[0][0], by = p[2][1]-p[0][1], bz = p[2][2]-p[0][2];
  return normalizar([ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx]);
}

/* -------------------------------------------------- geometria da planta -- */
function pLen(w) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1); }
function pAng(w) { return Math.atan2(w.y2 - w.y1, w.x2 - w.x1); }
function pGlobal(w, t, s) {
  var a = pAng(w), c = Math.cos(a), si = Math.sin(a);
  return [w.x1 + t * c - s * si, w.y1 + t * si + s * c];
}
function pLocal(w, x, y) {
  var a = pAng(w), c = Math.cos(a), s = Math.sin(a), dx = x - w.x1, dy = y - w.y1;
  return [dx * c + dy * s, -dx * s + dy * c];
}
function paredeDe(doc, id) {
  for (var i = 0; i < doc.paredes.length; i++) if (doc.paredes[i].id === id) return doc.paredes[i];
  return null;
}
function encosta(o, x, y) {
  var l = pLocal(o, x, y), L = pLen(o);
  return l[0] >= -0.7 && l[0] <= L + 0.7 && Math.abs(l[1]) <= o.t / 2 + 0.7;
}
function pontas(doc, w) {
  var e1 = 0, e2 = 0;
  doc.paredes.forEach(function (o) {
    if (o.id === w.id) return;
    if (encosta(o, w.x1, w.y1)) e1 = Math.max(e1, o.t / 2);
    if (encosta(o, w.x2, w.y2)) e2 = Math.max(e2, o.t / 2);
  });
  return [e1, e2];
}
function vaosDe(doc, w) {
  return doc.vaos.filter(function (v) { return v.parede === w.id; })
                 .sort(function (a, b) { return a.pos - b.pos; });
}
function pedacos(doc, w) {
  var L = pLen(w), lista = [], cur = 0;
  vaosDe(doc, w).forEach(function (v) {
    var a = Math.max(0, Math.min(v.pos, L)), b = Math.max(0, Math.min(v.pos + v.w, L));
    if (a > cur) lista.push([cur, a]);
    cur = Math.max(cur, b);
  });
  if (cur < L) lista.push([cur, L]);
  return lista.filter(function (s) { return s[1] - s[0] > 0.01; });
}
function ehJanela(t) { return t === 'janela' || t === 'janela_correr' || t === 'basculante' || t === 'porta_balcao'; }

/* ------------------------------------------------------------- faces ---- */
function addFace(faces, pts, rgb, alfa) {
  var n = normalDe(pts);
  var lum = 0.58 + 0.42 * Math.max(0, n[0]*LUZ[0] + n[1]*LUZ[1] + n[2]*LUZ[2]);
  faces.push({
    v: pts, alfa: alfa === undefined ? 1 : alfa,
    cor: 'rgb(' + Math.round(rgb[0]*lum) + ',' + Math.round(rgb[1]*lum) + ',' + Math.round(rgb[2]*lum) + ')'
  });
}
/* base = polígono no plano [[x,y2d],...]; y0/y1 = alturas */
function prisma(faces, base, y0, y1, rgb, alfa) {
  if (y1 - y0 < 0.01 || base.length < 3) return;
  var area = 0, i;
  for (i = 0; i < base.length; i++) {
    var p = base[i], q = base[(i + 1) % base.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area < 0) base = base.slice().reverse();       // sentido consistente
  var cx = 0, cy = 0;
  base.forEach(function (p) { cx += p[0]; cy += p[1]; });
  cx /= base.length; cy /= base.length;

  var topo = base.map(function (p) { return [p[0], y1, p[1]]; });
  addFace(faces, topo, rgb, alfa);
  var fundo = base.slice().reverse().map(function (p) { return [p[0], y0, p[1]]; });
  addFace(faces, fundo, rgb, alfa);
  for (i = 0; i < base.length; i++) {
    var a = base[i], b = base[(i + 1) % base.length];
    var quad = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
    var n = normalDe(quad);
    var mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cy;
    if (n[0] * mx + n[2] * mz < 0) quad = [[b[0],y0,b[1]],[a[0],y0,a[1]],[a[0],y1,a[1]],[b[0],y1,b[1]]];
    addFace(faces, quad, rgb, alfa);
  }
}
/* trecho de parede entre as posições locais a..b */
function trechoParede(faces, w, a, b, y0, y1, rgb, alfa) {
  if (b - a < 0.01) return;
  prisma(faces, [pGlobal(w, a, -w.t/2), pGlobal(w, b, -w.t/2),
                 pGlobal(w, b,  w.t/2), pGlobal(w, a,  w.t/2)], y0, y1, rgb, alfa);
}
/* painel fino entre dois pontos locais da parede */
function painelLocal(faces, w, p0, p1, esp, y0, y1, rgb, alfa) {
  var dx = p1[0]-p0[0], dy = p1[1]-p0[1], L = Math.hypot(dx, dy) || 1;
  var nx = -dy/L*esp/2, ny = dx/L*esp/2;
  prisma(faces, [pGlobal(w, p0[0]+nx, p0[1]+ny), pGlobal(w, p1[0]+nx, p1[1]+ny),
                 pGlobal(w, p1[0]-nx, p1[1]-ny), pGlobal(w, p0[0]-nx, p0[1]-ny)],
         y0, y1, rgb, alfa);
}
function cantosBloco(it) {
  var cx = it.x + it.w/2, cy = it.y + it.h/2, r = (it.rot || 0) * Math.PI/180;
  var c = Math.cos(r), s = Math.sin(r);
  return [[-it.w/2,-it.h/2],[it.w/2,-it.h/2],[it.w/2,it.h/2],[-it.w/2,it.h/2]]
    .map(function (p) { return [cx + p[0]*c - p[1]*s, cy + p[0]*s + p[1]*c]; });
}
/* recorte proporcional dentro do retângulo local do bloco (0..1) */
function subRet(it, u0, v0, u1, v1) {
  var cx = it.x + it.w/2, cy = it.y + it.h/2, r = (it.rot || 0) * Math.PI/180;
  var c = Math.cos(r), s = Math.sin(r);
  return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(function (p) {
    var lx = (p[0] - 0.5) * it.w, ly = (p[1] - 0.5) * it.h;
    return [cx + lx*c - ly*s, cy + lx*s + ly*c];
  });
}

/* ------------------------------------------------------- montar a cena -- */
function montar(doc, opc) {
  var faces = [], H = opc.altura;
  var hPorta = Math.min(H_PORTA, H - 0.5), jb = Math.min(JAN_BASE, H - 2), jt = Math.min(JAN_TOPO, H - 0.5);

  /* piso */
  var xs = [], ys = [];
  doc.paredes.forEach(function (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
  if (xs.length) {
    var x0 = Math.min.apply(null, xs) - 1, x1 = Math.max.apply(null, xs) + 1;
    var y0 = Math.min.apply(null, ys) - 1, y1 = Math.max.apply(null, ys) + 1;
    prisma(faces, [[x0,y0],[x1,y0],[x1,y1],[x0,y1]], -1.2, 0, COR.piso);
    if (opc.teto) prisma(faces, [[x0,y0],[x1,y0],[x1,y1],[x0,y1]], H, H + 1, COR.teto, 0.55);
  }

  /* paredes, vergas, peitoris e folhas */
  doc.paredes.forEach(function (w) {
    var L = pLen(w), ext = pontas(doc, w);
    pedacos(doc, w).forEach(function (s) {
      var a = s[0], b = s[1];
      if (a <= 0.01) a -= ext[0];
      if (b >= L - 0.01) b += ext[1];
      trechoParede(faces, w, a, b, 0, H, COR.parede);
    });
    vaosDe(doc, w).forEach(function (v) {
      var a = v.pos, b = v.pos + v.w;
      if (ehJanela(v.tipo)) {
        trechoParede(faces, w, a, b, 0, jb, COR.parede);
        trechoParede(faces, w, a, b, jt, H, COR.parede);
        if (opc.vidros) painelLocal(faces, w, [a, 0], [b, 0], 0.5, jb, jt, COR.vidro, 0.45);
      } else {
        trechoParede(faces, w, a, b, hPorta, H, COR.parede);
        if (v.tipo !== 'vao' && opc.folhas) folha(faces, w, v, hPorta);
      }
    });
  });

  if (opc.moveis) doc.itens.forEach(function (it) { movel(faces, it); });
  return faces;
}

function folha(faces, w, v, h) {
  var esp = 0.7, giro = (v.tipo === 'porta' || v.tipo === 'porta_dupla' || v.tipo === 'porta_pivo');
  if (giro) {
    var ang = (v.ang === undefined ? 90 : v.ang) * Math.PI/180, lado = v.lado || 1;
    if (v.tipo === 'porta_dupla') {
      meiaFolha(faces, w, v.pos, 1, v.w/2, lado, ang, esp, h);
      meiaFolha(faces, w, v.pos + v.w, -1, v.w/2, lado, ang, esp, h);
    } else if (v.tipo === 'porta_pivo') {
      var cx = v.pos + v.w/2, r = v.w/2;
      painelLocal(faces, w, [cx - r*Math.cos(ang), -lado*r*Math.sin(ang)],
                            [cx + r*Math.cos(ang),  lado*r*Math.sin(ang)], esp, 0, h, COR.porta);
    } else {
      var hx = v.dobra === 'inicio' ? v.pos : v.pos + v.w;
      meiaFolha(faces, w, hx, v.dobra === 'inicio' ? 1 : -1, v.w, lado, ang, esp, h);
    }
  } else {
    // correr / embutida / sanfonada: painel no plano do vão
    var off = (v.lado || 1) * (w.t/2 + 0.4);
    painelLocal(faces, w, [v.pos, off], [v.pos + v.w, off], esp, 0, h, COR.porta);
  }
}
function meiaFolha(faces, w, hx, dir, larg, lado, ang, esp, h) {
  painelLocal(faces, w, [hx, 0],
    [hx + dir*larg*Math.cos(ang), lado*larg*Math.sin(ang)], esp, 0, h, COR.porta);
}

function movel(faces, it) {
  if (it.tipo !== 'bloco' || PULAR[it.bloco]) return;
  var m = MAT[it.bloco] || { a: 8, c: 'movel' };
  var rgb = COR[m.c] || COR.movel, alfa = m.c === 'vidro' ? 0.4 : 1;

  if (m.f === 'cilindro') {
    var cx = it.x + it.w/2, cy = it.y + it.h/2, n = 20, base = [];
    for (var i = 0; i < n; i++) {
      var t = i/n * Math.PI * 2;
      base.push([cx + Math.cos(t)*it.w/2, cy + Math.sin(t)*it.h/2]);
    }
    prisma(faces, base, 0, m.a, rgb, alfa);
    return;
  }
  if (m.f === 'cadeira') {
    prisma(faces, subRet(it, 0.05, 0.05, 0.95, 0.95), 0, m.a * 0.5, rgb);
    prisma(faces, subRet(it, 0.05, 0, 0.95, 0.2), m.a * 0.5, m.a, rgb);
    return;
  }
  if (m.f === 'sofa') {
    prisma(faces, cantosBloco(it), 0, m.a * 0.55, rgb);
    prisma(faces, subRet(it, 0, 0, 1, 0.28), 0, m.a, rgb);
    prisma(faces, subRet(it, 0, 0.28, 0.12, 1), 0, m.a * 0.8, rgb);
    prisma(faces, subRet(it, 0.88, 0.28, 1, 1), 0, m.a * 0.8, rgb);
    return;
  }
  if (m.f === 'cama') {
    prisma(faces, cantosBloco(it), 0, m.a, rgb);
    prisma(faces, subRet(it, 0.05, 0.03, 0.95, 0.22), m.a, m.a + 1.6, COR.louca);
    return;
  }
  if (m.f === 'box') {
    prisma(faces, cantosBloco(it), 0, 0.6, COR.louca);
    prisma(faces, subRet(it, 0, 0, 1, 0.06), 0.6, m.a, rgb, alfa);
    prisma(faces, subRet(it, 0, 0, 0.06, 1), 0.6, m.a, rgb, alfa);
    return;
  }
  if (m.f === 'escada') {
    var deg = Math.max(3, Math.round(it.h / 2.4));
    for (var d = 0; d < deg; d++)
      prisma(faces, subRet(it, 0, d/deg, 1, (d+1)/deg), 0, 2 + d * 2.2, rgb);
    return;
  }
  prisma(faces, cantosBloco(it), 0, m.a, rgb, alfa);
}

/* -------------------------------------------------------------- câmera -- */
var cv, ctx, faces = [], cam, docAtual, opcoes, arrastando = null, aberto = false;

function centro(doc) {
  var xs = [], ys = [];
  doc.paredes.forEach(function (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
  if (!xs.length) return { x: 0, y: 0, r: 60 };
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  return { x: (x0+x1)/2, y: (y0+y1)/2, r: Math.max(x1-x0, y1-y0) };
}
function projetar(p) {
  var dx = p[0] - cam.alvo[0], dy = p[1] - cam.alvo[1], dz = p[2] - cam.alvo[2];
  var ct = Math.cos(cam.theta), st = Math.sin(cam.theta);
  var x1 = dx*ct - dz*st, z1 = dx*st + dz*ct;
  var cp = Math.cos(cam.phi), sp = Math.sin(cam.phi);
  var y2 = dy*cp - z1*sp, z2 = dy*sp + z1*cp;
  var z = z2 + cam.dist;
  return [cv.larg/2 + x1*cam.f/z, cv.alt/2 - y2*cam.f/z, z];
}
function desenhar() {
  var W = cv.larg, H = cv.alt;
  if (!(W > 0) || !(H > 0)) return;      // ainda sem layout
  ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#dfe6ef'); g.addColorStop(1, '#f4f6f8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  var lista = [];
  for (var i = 0; i < faces.length; i++) {
    var f = faces[i], pv = [], soma = 0, ok = true;
    for (var j = 0; j < f.v.length; j++) {
      var p = projetar(f.v[j]);
      if (p[2] < 1) { ok = false; break; }
      pv.push(p); soma += p[2];
    }
    if (ok) lista.push({ pv: pv, d: soma / pv.length, cor: f.cor, alfa: f.alfa });
  }
  lista.sort(function (a, b) { return b.d - a.d; });
  for (i = 0; i < lista.length; i++) {
    var L = lista[i];
    ctx.globalAlpha = L.alfa;
    ctx.fillStyle = L.cor;
    ctx.beginPath();
    ctx.moveTo(L.pv[0][0], L.pv[0][1]);
    for (j = 1; j < L.pv.length; j++) ctx.lineTo(L.pv[j][0], L.pv[j][1]);
    ctx.closePath(); ctx.fill();
    if (L.alfa >= 1) { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.6; ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}
function redimensionar() {
  var r = cv.el.parentNode.getBoundingClientRect();
  cv.dpr = window.devicePixelRatio || 1;
  cv.larg = r.width; cv.alt = r.height;
  cv.el.width = Math.round(r.width * cv.dpr);
  cv.el.height = Math.round(r.height * cv.dpr);
  cv.el.style.width = r.width + 'px'; cv.el.style.height = r.height + 'px';
  cam.f = Math.min(cv.larg, cv.alt) * 0.9;
  desenhar();
}
function reconstruir() {
  faces = montar(docAtual, opcoes);
  desenhar();
}

/* ---------------------------------------------------------- interação --- */
function ligarEventos() {
  var el = cv.el;
  el.addEventListener('mousedown', function (ev) {
    arrastando = { x: ev.clientX, y: ev.clientY, pan: ev.shiftKey || ev.button === 2,
                   theta: cam.theta, phi: cam.phi, alvo: cam.alvo.slice() };
    ev.preventDefault();
  });
  window.addEventListener('mousemove', function (ev) {
    if (!arrastando || !aberto) return;
    mover(ev.clientX - arrastando.x, ev.clientY - arrastando.y, arrastando.pan);
  });
  window.addEventListener('mouseup', function () { arrastando = null; });
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  el.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    cam.dist = Math.max(12, Math.min(600, cam.dist * (ev.deltaY < 0 ? 0.9 : 1.1)));
    desenhar();
  }, { passive: false });

  var toque = null;
  el.addEventListener('touchstart', function (ev) {
    if (ev.touches.length === 1)
      toque = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, theta: cam.theta, phi: cam.phi, alvo: cam.alvo.slice(), dois: false };
    else if (ev.touches.length === 2)
      toque = { d: dist2(ev.touches), dist: cam.dist, dois: true };
    ev.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', function (ev) {
    if (!toque) return;
    if (toque.dois && ev.touches.length === 2) {
      cam.dist = Math.max(12, Math.min(600, toque.dist * toque.d / dist2(ev.touches)));
      desenhar();
    } else if (!toque.dois && ev.touches.length === 1) {
      arrastando = toque;
      mover(ev.touches[0].clientX - toque.x, ev.touches[0].clientY - toque.y, false);
    }
    ev.preventDefault();
  }, { passive: false });
  el.addEventListener('touchend', function () { toque = null; arrastando = null; });

  window.addEventListener('resize', function () { if (aberto) redimensionar(); });
  window.addEventListener('keydown', function (ev) {
    if (aberto && ev.key === 'Escape') fechar();
  });
}
function dist2(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
function mover(dx, dy, pan) {
  if (pan) {
    var ct = Math.cos(cam.theta), st = Math.sin(cam.theta), k = cam.dist / cam.f;
    cam.alvo[0] = arrastando.alvo[0] - (dx*ct + dy*st*Math.sin(cam.phi)) * k;
    cam.alvo[2] = arrastando.alvo[2] + (dx*st - dy*ct*Math.sin(cam.phi)) * k;
    cam.alvo[1] = arrastando.alvo[1] + dy * Math.cos(cam.phi) * k;
  } else {
    cam.theta = arrastando.theta + dx * 0.008;
    cam.phi = Math.max(-0.2, Math.min(1.45, arrastando.phi + dy * 0.006));
  }
  desenhar();
}

/* ------------------------------------------------------------- abrir ---- */
function abrir(doc) {
  docAtual = doc;
  var visor = document.getElementById('visor3d');
  visor.hidden = false; aberto = true;

  if (!cv) {
    cv = { el: document.getElementById('cv3d'), larg: 0, alt: 0, dpr: 1 };
    ctx = cv.el.getContext('2d');
    var c = centro(doc);
    opcoes = { altura: +document.getElementById('alt3d').value, moveis: true, teto: false, vidros: true, folhas: true };
    cam = { theta: -0.7, phi: 0.62, dist: c.r * 1.7, f: 800, alvo: [c.x, opcoes.altura / 2, c.y] };
    ligarEventos();
    document.getElementById('alt3d').addEventListener('input', function () {
      opcoes.altura = +this.value;
      document.getElementById('altTxt').textContent = (opcoes.altura / 10).toFixed(2) + ' m';
      reconstruir();
    });
    document.getElementById('mov3d').addEventListener('change', function () { opcoes.moveis = this.checked; reconstruir(); });
    document.getElementById('teto3d').addEventListener('change', function () { opcoes.teto = this.checked; reconstruir(); });
    document.getElementById('fechar3d').addEventListener('click', fechar);
    document.getElementById('png3d').addEventListener('click', function () {
      cv.el.toBlob(function (b) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'planta-3d.png';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
    });
  } else {
    var c2 = centro(doc);
    cam.alvo = [c2.x, opcoes.altura / 2, c2.y];
    if (!isFinite(cam.dist) || cam.dist <= 0) cam.dist = c2.r * 1.7;
  }
  redimensionar();   // define as dimensões antes de qualquer desenho
  reconstruir();
}
function fechar() {
  aberto = false; arrastando = null;
  document.getElementById('visor3d').hidden = true;
}

return { abrir: abrir, fechar: fechar };
})();
