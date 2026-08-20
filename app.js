/* =========================================================================
   Planta Interativa — editor de plantas baixas em SVG
   Unidade interna: centímetro de desenho (cm). A tela mostra metros (cm/100),
   igual às cotas da planta original (0.59 / 0.18 / 0.81 / 0.49 / 0.56).
   ========================================================================= */
(function () {
'use strict';

var NS = 'http://www.w3.org/2000/svg';
var LW = 0.45;     // espessura da linha do desenho
var CELL = 3.8;    // tamanho do símbolo de tomada
var SNAP = 1;      // passo do ímã
var CHAVE = 'planta-interativa-v1';

/* ---------------------------------------------------------------- helpers */
function uid(p) { return (p || 'e') + Math.random().toString(36).slice(2, 9); }
function el(tag, at) {
  var e = document.createElementNS(NS, tag);
  for (var k in at) if (at[k] !== null && at[k] !== undefined) e.setAttribute(k, at[k]);
  return e;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function m(v) { return (v / 100).toFixed(2); }          // cm -> texto em metros
function m3(v) { return (v / 100).toFixed(3); }
function paraCm(txt) { var v = parseFloat(String(txt).replace(',', '.')); return isNaN(v) ? 0 : v * 100; }
function $(s) { return document.querySelector(s); }

/* primitivas de desenho (traço preto padrão, preenchimento branco) */
function _l(a, b, c, d, f) { return el('line', { x1: a, y1: b, x2: c, y2: d, stroke: '#000', 'stroke-width': LW * (f || 1) }); }
function _tr(a, b, c, d, f) { var e = _l(a, b, c, d, f); e.setAttribute('stroke-dasharray', '1.2 1'); return e; }
function _r(x, y, w, h, rx) { return el('rect', { x: x, y: y, width: w, height: h, rx: rx || null, fill: '#fff', stroke: '#000', 'stroke-width': LW }); }
function _rv(x, y, w, h, rx) { var e = _r(x, y, w, h, rx); e.setAttribute('fill', 'none'); return e; }
function _rt(x, y, w, h) { var e = _rv(x, y, w, h); e.setAttribute('stroke-dasharray', '1.2 1'); return e; }
function _c(cx, cy, r) { return el('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: '#000', 'stroke-width': LW }); }
function _cf(cx, cy, r) { return el('circle', { cx: cx, cy: cy, r: r, fill: '#000' }); }
function _e(cx, cy, rx, ry) { return el('ellipse', { cx: cx, cy: cy, rx: rx, ry: ry, fill: '#fff', stroke: '#000', 'stroke-width': LW }); }
function _p(d, f) { return el('path', { d: d, fill: f || 'none', stroke: '#000', 'stroke-width': LW }); }
function _tx(x, y, s, tam) {
  var t = el('text', { x: x, y: y, 'font-size': tam, 'text-anchor': 'middle',
    'dominant-baseline': 'middle', fill: '#000', 'font-family': 'Arial, Helvetica, sans-serif' });
  t.textContent = s; return t;
}
function _seta(g, x1, y1, x2, y2, tam) {
  g.appendChild(_l(x1, y1, x2, y2, 0.8));
  var a = Math.atan2(y2 - y1, x2 - x1), s = tam || 1.3;
  g.appendChild(_l(x2, y2, x2 - s * Math.cos(a - 0.42), y2 - s * Math.sin(a - 0.42), 0.8));
  g.appendChild(_l(x2, y2, x2 - s * Math.cos(a + 0.42), y2 - s * Math.sin(a + 0.42), 0.8));
}

/* ============================ ABERTURAS =================================
   Cada tipo desenha em coordenadas locais da parede:
   x de v.pos a v.pos+v.w · y = 0 é o eixo · faces em ±w.t/2
   ======================================================================== */
function folhaGiro(g, hx, dir, larg, lado, ang) {
  var rad = ang * Math.PI / 180;
  var ex = hx + dir * larg * Math.cos(rad), ey = lado * larg * Math.sin(rad);
  var d = '', n = 24;
  for (var i = 0; i <= n; i++) {
    var f = rad * i / n;
    d += (i ? 'L' : 'M') + (hx + dir * larg * Math.cos(f)) + ' ' + (lado * larg * Math.sin(f)) + ' ';
  }
  g.appendChild(_p(d));
  var ux = (ex - hx) / larg, uy = ey / larg, e = 0.55;
  var px = -uy * e, py = ux * e;
  g.appendChild(el('polygon', {
    points: [(hx + px) + ',' + py, (ex + px) + ',' + (ey + py),
             (ex - px) + ',' + (ey - py), (hx - px) + ',' + (-py)].join(' '),
    fill: '#fff', stroke: '#000', 'stroke-width': LW
  }));
}
function corredica(g, v, w, folhas) {
  var lado = v.lado || 1, off = lado * (w.t / 2 + 1.0);
  var dir = v.dobra === 'inicio' ? -1 : 1;          // para que lado desliza
  var a = v.pos, b = v.pos + v.w;
  // trilho
  g.appendChild(_l(dir < 0 ? a - v.w : a, off, dir > 0 ? b + v.w : b, off, 0.6));
  // folhas
  for (var i = 0; i < folhas; i++) {
    var lw = v.w / folhas, x0 = a + lw * i;
    g.appendChild(el('rect', { x: x0, y: off - 0.4 + i * 0.9 * (folhas > 1 ? 1 : 0), width: lw, height: 0.8,
      fill: '#fff', stroke: '#000', 'stroke-width': LW }));
  }
  // seta do sentido
  var sx = dir < 0 ? a - v.w * 0.15 : b + v.w * 0.15;
  _seta(g, dir < 0 ? a + v.w * 0.2 : b - v.w * 0.2, off + 2.2, sx, off + 2.2, 1.1);
}
function batentes(g, v, w) {   // linhas das faces atravessando o vão (janelas)
  g.appendChild(_l(v.pos, -w.t / 2, v.pos + v.w, -w.t / 2));
  g.appendChild(_l(v.pos, w.t / 2, v.pos + v.w, w.t / 2));
}

var VAOS = {
  porta: { nome: 'Porta de abrir', wPad: 12.5, giro: true, d: function (g, v, w) {
    var hx = v.dobra === 'inicio' ? v.pos : v.pos + v.w;
    folhaGiro(g, hx, v.dobra === 'inicio' ? 1 : -1, v.w, v.lado || 1, v.ang);
  }},
  porta_dupla: { nome: 'Porta 2 folhas (abrir)', wPad: 20, giro: true, d: function (g, v, w) {
    folhaGiro(g, v.pos, 1, v.w / 2, v.lado || 1, v.ang);
    folhaGiro(g, v.pos + v.w, -1, v.w / 2, v.lado || 1, v.ang);
  }},
  porta_pivo: { nome: 'Porta pivotante', wPad: 14, giro: true, d: function (g, v, w) {
    var cx = v.pos + v.w / 2, r = v.w / 2, rad = v.ang * Math.PI / 180, lado = v.lado || 1;
    var dx = r * Math.cos(rad), dy = lado * r * Math.sin(rad);
    var d1 = '', d2 = '', n = 16;
    for (var i = 0; i <= n; i++) {
      var f = rad * i / n;
      d1 += (i ? 'L' : 'M') + (cx + r * Math.cos(f)) + ' ' + (lado * r * Math.sin(f)) + ' ';
      d2 += (i ? 'L' : 'M') + (cx - r * Math.cos(f)) + ' ' + (-lado * r * Math.sin(f)) + ' ';
    }
    g.appendChild(_p(d1)); g.appendChild(_p(d2));
    var ux = dx / r, uy = dy / r, e = 0.55;
    g.appendChild(el('polygon', { points: [
      (cx + dx - uy * e) + ',' + (dy + ux * e), (cx - dx - uy * e) + ',' + (-dy + ux * e),
      (cx - dx + uy * e) + ',' + (-dy - ux * e), (cx + dx + uy * e) + ',' + (dy - ux * e)].join(' '),
      fill: '#fff', stroke: '#000', 'stroke-width': LW }));
    g.appendChild(_cf(cx, 0, 0.5));
  }},
  porta_correr: { nome: 'Porta de correr', wPad: 14, d: function (g, v, w) { corredica(g, v, w, 1); }},
  porta_correr2: { nome: 'Porta de correr 2 folhas', wPad: 22, d: function (g, v, w) { corredica(g, v, w, 2); }},
  porta_embutida: { nome: 'Correr embutida na parede', wPad: 14, d: function (g, v, w) {
    var dir = v.dobra === 'inicio' ? -1 : 1, a = v.pos, b = v.pos + v.w;
    var x0 = dir < 0 ? a - v.w : b;
    g.appendChild(_rt(x0, -w.t / 2 + 0.3, v.w, w.t - 0.6));          // bolsa (tracejado)
    g.appendChild(el('rect', { x: a, y: -0.45, width: v.w, height: 0.9,
      fill: '#fff', stroke: '#000', 'stroke-width': LW }));           // folha fechada
    _seta(g, dir < 0 ? a + v.w * 0.35 : b - v.w * 0.35, w.t / 2 + 2,
             dir < 0 ? a - v.w * 0.1 : b + v.w * 0.1, w.t / 2 + 2, 1.1);
  }},
  porta_sanfona: { nome: 'Porta sanfonada', wPad: 12, d: function (g, v, w) {
    var lado = v.lado || 1, n = 8, amp = Math.min(v.w / n * 1.6, 3.2), d = '';
    for (var i = 0; i <= n; i++) {
      var x = v.pos + v.w * i / n, y = (i % 2 ? lado * amp : 0);
      d += (i ? 'L' : 'M') + x + ' ' + y + ' ';
    }
    g.appendChild(_p(d));
  }},
  vao: { nome: 'Vão livre (sem porta)', wPad: 12, d: function () {} },

  janela: { nome: 'Janela', wPad: 15, d: function (g, v, w) {
    batentes(g, v, w);
    g.appendChild(_r(v.pos, -w.t / 6, v.w, w.t / 3));
  }},
  janela_correr: { nome: 'Janela de correr', wPad: 18, d: function (g, v, w) {
    batentes(g, v, w);
    g.appendChild(_r(v.pos, -w.t / 2 + 0.3, v.w * 0.52, w.t / 3));
    g.appendChild(_r(v.pos + v.w * 0.48, w.t / 6 - 0.3, v.w * 0.52, w.t / 3));
  }},
  basculante: { nome: 'Janela basculante', wPad: 10, d: function (g, v, w) {
    batentes(g, v, w);
    g.appendChild(_r(v.pos, -w.t / 6, v.w, w.t / 3));
    g.appendChild(_l(v.pos, w.t / 6, v.pos + v.w, -w.t / 6, 0.7));
  }},
  porta_balcao: { nome: 'Porta-balcão (correr)', wPad: 22, d: function (g, v, w) {
    batentes(g, v, w);
    g.appendChild(_r(v.pos, -w.t / 2 + 0.3, v.w * 0.52, w.t / 3));
    g.appendChild(_r(v.pos + v.w * 0.48, w.t / 6 - 0.3, v.w * 0.52, w.t / 3));
    var lado = v.lado || 1;
    g.appendChild(_l(v.pos, lado * (w.t / 2 + 1.2), v.pos + v.w, lado * (w.t / 2 + 1.2), 0.7)); // soleira
  }}
};
function ehPorta(t) { return t.indexOf('porta') === 0 || t === 'vao'; }

/* ============================== BLOCOS ==================================
   Desenham em coordenadas locais 0,0 → w,h (o item guarda x,y,w,h,rot).
   ======================================================================== */
var BLOCOS = {
  /* ---------------- mobiliário ---------------- */
  retangulo: { cat: 'Mobiliário', nome: 'Retângulo / bancada', w: 15, h: 8, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); }},
  mesa_ret: { cat: 'Mobiliário', nome: 'Mesa', w: 12, h: 7, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h, Math.min(w, h) * 0.08)); }},
  mesa_redonda: { cat: 'Mobiliário', nome: 'Mesa redonda', w: 10, h: 10, d: function (g, w, h) {
    g.appendChild(_e(w / 2, h / 2, w / 2, h / 2)); }},
  mesa_reuniao: { cat: 'Mobiliário', nome: 'Mesa de reunião', w: 22, h: 10, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h, h / 2.6));
    for (var i = 0; i < 3; i++) {
      g.appendChild(_r(w * (0.18 + i * 0.28), -h * 0.28, w * 0.16, h * 0.24));
      g.appendChild(_r(w * (0.18 + i * 0.28), h * 1.04, w * 0.16, h * 0.24));
    } }},
  cadeira: { cat: 'Mobiliário', nome: 'Cadeira', w: 5, h: 5, d: function (g, w, h) {
    g.appendChild(_r(0, h * 0.2, w, h * 0.8, w * 0.15));
    g.appendChild(_r(w * 0.05, 0, w * 0.9, h * 0.2)); }},
  sofa2: { cat: 'Mobiliário', nome: 'Sofá 2 lugares', w: 15, h: 8, d: sofa },
  sofa3: { cat: 'Mobiliário', nome: 'Sofá 3 lugares', w: 21, h: 8, d: sofa },
  poltrona: { cat: 'Mobiliário', nome: 'Poltrona', w: 8, h: 8, d: sofa },
  cama_solteiro: { cat: 'Mobiliário', nome: 'Cama solteiro', w: 9, h: 19, d: cama },
  cama_casal: { cat: 'Mobiliário', nome: 'Cama casal', w: 14, h: 19, d: cama },
  criado: { cat: 'Mobiliário', nome: 'Criado-mudo', w: 4.5, h: 4, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_l(0, h * 0.75, w, h * 0.75)); }},
  armario: { cat: 'Mobiliário', nome: 'Armário', w: 12, h: 6, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    g.appendChild(_l(0, h * 0.82, w, h * 0.82));
    g.appendChild(_l(w / 2, h * 0.82, w / 2, h)); }},
  estante: { cat: 'Mobiliário', nome: 'Estante', w: 14, h: 3.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    for (var i = 1; i < 4; i++) g.appendChild(_l(w * i / 4, 0, w * i / 4, h)); }},
  rack: { cat: 'Mobiliário', nome: 'Rack / TV', w: 14, h: 4, d: function (g, w, h) {
    g.appendChild(_r(0, h * 0.35, w, h * 0.65));
    g.appendChild(_l(w * 0.2, 0, w * 0.8, 0, 1.4)); }},

  /* ---------------- cozinha e serviço ---------------- */
  pia_cozinha: { cat: 'Cozinha', nome: 'Pia de cozinha', w: 14, h: 6, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    g.appendChild(_r(w * 0.08, h * 0.15, w * 0.4, h * 0.7, 0.4));
    g.appendChild(_c(w * 0.28, h / 2, 0.5));
    g.appendChild(_c(w * 0.62, h * 0.2, 0.6)); }},
  fogao: { cat: 'Cozinha', nome: 'Fogão', w: 6.5, h: 6.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    g.appendChild(_c(w * 0.28, h * 0.28, Math.min(w, h) * 0.14));
    g.appendChild(_c(w * 0.72, h * 0.28, Math.min(w, h) * 0.14));
    g.appendChild(_c(w * 0.28, h * 0.68, Math.min(w, h) * 0.14));
    g.appendChild(_c(w * 0.72, h * 0.68, Math.min(w, h) * 0.14)); }},
  geladeira: { cat: 'Cozinha', nome: 'Geladeira', w: 7, h: 7, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    g.appendChild(_l(0, h * 0.85, w, h * 0.85));
    g.appendChild(_l(w * 0.15, h * 0.92, w * 0.45, h * 0.92, 1.3)); }},
  coifa: { cat: 'Cozinha', nome: 'Coifa (tracejado)', w: 7, h: 6, d: function (g, w, h) {
    g.appendChild(_rt(0, 0, w, h)); g.appendChild(_tr(0, 0, w, h)); g.appendChild(_tr(w, 0, 0, h)); }},
  micro: { cat: 'Cozinha', nome: 'Micro-ondas', w: 5.5, h: 4, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_r(w * 0.08, h * 0.15, w * 0.6, h * 0.7)); }},
  maq_lavar: { cat: 'Cozinha', nome: 'Máquina de lavar', w: 6.5, h: 6.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_c(w / 2, h * 0.55, Math.min(w, h) * 0.3));
    g.appendChild(_l(0, h * 0.2, w, h * 0.2)); }},
  tanque: { cat: 'Cozinha', nome: 'Tanque', w: 5.5, h: 6.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_r(w * 0.12, h * 0.28, w * 0.76, h * 0.6, 0.4));
    g.appendChild(_c(w / 2, h * 0.58, 0.5)); }},

  /* ---------------- banheiro ---------------- */
  vaso: { cat: 'Banheiro', nome: 'Vaso sanitário', w: 4.5, h: 7, d: function (g, w, h) {
    g.appendChild(_r(w * 0.06, 0, w * 0.88, h * 0.26));
    g.appendChild(_e(w / 2, h * 0.62, w * 0.42, h * 0.34)); }},
  lavatorio: { cat: 'Banheiro', nome: 'Lavatório', w: 6, h: 4.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h, 0.5));
    g.appendChild(_e(w / 2, h * 0.56, w * 0.34, h * 0.32));
    g.appendChild(_c(w / 2, h * 0.16, 0.5)); }},
  cuba_bancada: { cat: 'Banheiro', nome: 'Bancada com cuba', w: 12, h: 5.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    g.appendChild(_e(w * 0.35, h * 0.55, w * 0.2, h * 0.3));
    g.appendChild(_c(w * 0.35, h * 0.16, 0.5)); }},
  box: { cat: 'Banheiro', nome: 'Box / chuveiro', w: 9, h: 9, d: function (g, w, h) {
    g.appendChild(_rv(0, 0, w, h));
    g.appendChild(_l(0, 0, w, h, 0.6)); g.appendChild(_l(w, 0, 0, h, 0.6));
    g.appendChild(_c(w / 2, h / 2, Math.min(w, h) * 0.13)); }},
  banheira: { cat: 'Banheiro', nome: 'Banheira', w: 17, h: 8, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h, h * 0.18));
    g.appendChild(_rv(w * 0.06, h * 0.12, w * 0.88, h * 0.76, h * 0.16));
    g.appendChild(_c(w * 0.16, h / 2, 0.55)); }},

  /* ---------------- elétrica ---------------- */
  tomada: { cat: 'Elétrica', nome: 'Tomada', legado: 'tomada', naParede: true },
  interruptor: { cat: 'Elétrica', nome: 'Interruptor', legado: 'interruptor', naParede: true },
  ponto_luz: { cat: 'Elétrica', nome: 'Ponto de luz', w: 5, h: 5, d: function (g, w, h) {
    var r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2, k = r * 0.72;
    g.appendChild(_c(cx, cy, r));
    g.appendChild(_l(cx - k, cy - k, cx + k, cy + k)); g.appendChild(_l(cx + k, cy - k, cx - k, cy + k)); }},
  luminaria: { cat: 'Elétrica', nome: 'Luminária', w: 12, h: 3, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_l(0, h / 2, w, h / 2, 0.7)); }},
  spot: { cat: 'Elétrica', nome: 'Spot', w: 3, h: 3, d: function (g, w, h) {
    g.appendChild(_c(w / 2, h / 2, Math.min(w, h) / 2)); g.appendChild(_cf(w / 2, h / 2, Math.min(w, h) * 0.16)); }},
  quadro: { cat: 'Elétrica', nome: 'Quadro elétrico', w: 6.5, h: 2.5, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h));
    for (var i = 1; i < 4; i++) g.appendChild(_l(w * i / 4, 0, w * i / 4 - h * 0.5, h, 0.7)); }},
  ar_split: { cat: 'Elétrica', nome: 'Ar-condicionado', w: 12, h: 3, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h, h * 0.3));
    g.appendChild(_l(w * 0.06, h * 0.68, w * 0.94, h * 0.68, 0.7)); }},
  ponto_rede: { cat: 'Elétrica', nome: 'Ponto de rede', w: 4, h: 4, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_tx(w / 2, h / 2 + 0.15, 'R', h * 0.62)); }},
  ponto_tv: { cat: 'Elétrica', nome: 'Ponto de TV', w: 4, h: 4, d: function (g, w, h) {
    g.appendChild(_r(0, 0, w, h)); g.appendChild(_tx(w / 2, h / 2 + 0.15, 'TV', h * 0.5)); }},
  campainha: { cat: 'Elétrica', nome: 'Campainha', w: 4, h: 4, d: function (g, w, h) {
    g.appendChild(_p('M' + (w * 0.5) + ' ' + (h * 0.12) + ' A ' + (w * 0.38) + ' ' + (h * 0.38) +
      ' 0 0 1 ' + (w * 0.88) + ' ' + (h * 0.5) + ' L ' + (w * 0.12) + ' ' + (h * 0.5) +
      ' A ' + (w * 0.38) + ' ' + (h * 0.38) + ' 0 0 1 ' + (w * 0.5) + ' ' + (h * 0.12), '#fff'));
    g.appendChild(_cf(w / 2, h * 0.62, 0.4)); }},

  /* ---------------- outros ---------------- */
  escada: { cat: 'Outros', nome: 'Escada', w: 10, h: 22, d: function (g, w, h) {
    g.appendChild(_rv(0, 0, w, h));
    var n = Math.max(3, Math.round(h / 2.4));
    for (var i = 1; i < n; i++) g.appendChild(_l(0, h * i / n, w, h * i / n, 0.7));
    _seta(g, w / 2, h * 0.9, w / 2, h * 0.1, 1.4); }},
  planta: { cat: 'Outros', nome: 'Vaso de planta', w: 6, h: 6, d: function (g, w, h) {
    g.appendChild(_c(w / 2, h / 2, Math.min(w, h) / 2));
    g.appendChild(_c(w / 2, h / 2, Math.min(w, h) * 0.22)); }},
  norte: { cat: 'Outros', nome: 'Norte', w: 8, h: 10, d: function (g, w, h) {
    g.appendChild(el('polygon', { points: [(w / 2) + ',' + (h * 0.18), (w * 0.82) + ',' + h,
      (w / 2) + ',' + (h * 0.76), (w * 0.18) + ',' + h].join(' '), fill: '#fff', stroke: '#000', 'stroke-width': LW }));
    g.appendChild(_tx(w / 2, h * 0.06, 'N', h * 0.2)); }},
  hachura: { cat: 'Outros', nome: 'Área hachurada', w: 12, h: 8, d: function (g, w, h) {
    g.appendChild(_rv(0, 0, w, h));
    for (var x = -h; x < w; x += 1.6) g.appendChild(_l(Math.max(x, 0), x < 0 ? -x : 0,
      Math.min(x + h, w), x + h > w ? h - (x + h - w) : h, 0.5)); }}
};
function sofa(g, w, h) {
  g.appendChild(_r(0, 0, w, h, Math.min(w, h) * 0.12));
  g.appendChild(_r(w * 0.12, h * 0.3, w * 0.76, h * 0.62, h * 0.1));
  g.appendChild(_l(w * 0.12, h * 0.3, w * 0.12, h * 0.92));
  g.appendChild(_l(w * 0.88, h * 0.3, w * 0.88, h * 0.92));
}
function cama(g, w, h) {
  g.appendChild(_r(0, 0, w, h, Math.min(w, h) * 0.06));
  g.appendChild(_l(0, h * 0.28, w, h * 0.28));
  if (w > 11) {
    g.appendChild(_r(w * 0.06, h * 0.04, w * 0.4, h * 0.18, 0.6));
    g.appendChild(_r(w * 0.54, h * 0.04, w * 0.4, h * 0.18, 0.6));
  } else g.appendChild(_r(w * 0.15, h * 0.04, w * 0.7, h * 0.18, 0.6));
}

/* ------------------------------------------------------------ planta base */
/* Reprodução fiel da planta enviada: mesmas paredes, mesmas portas,
   mesmas tomadas, mesmos textos e mesmas cotas. Nada a mais, nada a menos. */
function plantaOriginal() {
  var T = 2;
  return {
    versao: 2,
    paredes: [
      { id: 'w_topo',  x1: 1,    y1: 1,  x2: 79,   y2: 1,  t: T },
      { id: 'w_dir',   x1: 79,   y1: 1,  x2: 79,   y2: 79, t: T },
      { id: 'w_baixo', x1: 1,    y1: 79, x2: 79,   y2: 79, t: T },
      { id: 'w_esq',   x1: 1,    y1: 1,  x2: 1,    y2: 79, t: T },
      { id: 'w_sala',  x1: 61.5, y1: 1,  x2: 61.5, y2: 33, t: T },
      { id: 'w_div',   x1: 38,   y1: 33, x2: 79,   y2: 33, t: T },
      { id: 'w_recep', x1: 38,   y1: 33, x2: 38,   y2: 79, t: T }
    ],
    vaos: [
      { id: 'p1', tipo: 'porta', parede: 'w_div', pos: 1.2, w: 12.5, lado: 1, dobra: 'inicio', ang: 90 },
      { id: 'p2', tipo: 'porta', parede: 'w_baixo', pos: 49.9, w: 15.4, lado: 1, dobra: 'fim', ang: 90 }
    ],
    itens: [
      { id: 'i1', tipo: 'bloco', bloco: 'retangulo', x: 2, y: 2, w: 10, h: 76, rot: 0 },
      { id: 'i2', tipo: 'tomada', x: 4.95, y: 75, n: 1, rot: 0 },
      { id: 'i3', tipo: 'tomada', x: 60.6, y: 12.9, n: 4, rot: 90 }
    ],
    textos: [
      { id: 't1', x: 21.6, y: 52.7, txt: 'estação de trabalho', tam: 2.9, rot: -90 },
      { id: 't2', x: 70.2, y: 16.1, txt: 'sala de reunião', tam: 2.9, rot: -90 },
      { id: 't3', x: 58.5, y: 58.7, txt: 'recepção', tam: 6.5, rot: 0 }
    ],
    cotas: [
      { id: 'c1', x1: 1.8, y1: 1, x2: 61.1, y2: 1, off: -12.5, texto: '0.59' },
      { id: 'c2', x1: 61.1, y1: 1, x2: 79, y2: 1, off: -12.5, texto: '0.18' },
      { id: 'c3', x1: 1, y1: 79.5, x2: 1, y2: 0.6, off: -15, texto: '0.81' },
      { id: 'c4', x1: 79, y1: 33, x2: 79, y2: 0.6, off: 14, texto: '0.49' },
      { id: 'c5', x1: 79, y1: 79.4, x2: 79, y2: 33, off: 14, texto: '0.56' }
    ]
  };
}
/* compatibilidade com arquivos salvos na versão 1 */
function migrar(d) {
  (d.itens || []).forEach(function (it) {
    if (it.tipo === 'movel') { it.tipo = 'bloco'; it.bloco = 'retangulo'; }
  });
  (d.vaos || []).forEach(function (v) { if (!VAOS[v.tipo]) v.tipo = 'porta'; });
  return d;
}

/* Ponto de partida publicado: o último layout mobiliado, salvo pelo botão
   "Salvar JSON" e embutido aqui. É o que abre em qualquer aparelho, mesmo
   sem nada salvo naquele navegador. O botão "Planta original" continua
   voltando pra planta nua, sem móveis, tal como foi enviada no início. */
function plantaPadrao() {
  return migrar({
  "versao": 1,
  "paredes": [
    { "id": "w_topo",  "x1": 1,  "y1": 1,  "x2": 79, "y2": 1,  "t": 2 },
    { "id": "w_dir",   "x1": 79, "y1": 1,  "x2": 79, "y2": 79, "t": 2 },
    { "id": "w_baixo", "x1": 1,  "y1": 79, "x2": 79, "y2": 79, "t": 2 },
    { "id": "w_esq",   "x1": 1,  "y1": 1,  "x2": 1,  "y2": 79, "t": 2 },
    { "id": "w_sala",  "x1": 59, "y1": 1,  "x2": 59, "y2": 33, "t": 2 },
    { "id": "w_div",   "x1": 38, "y1": 33, "x2": 79, "y2": 33, "t": 2 },
    { "id": "w_recep", "x1": 38, "y1": 33, "x2": 38, "y2": 79, "t": 2 }
  ],
  "vaos": [
    { "id": "p1", "tipo": "porta", "parede": "w_div", "pos": 1.2, "w": 12.5, "lado": 1, "dobra": "inicio", "ang": 90 },
    { "id": "p2", "tipo": "porta", "parede": "w_baixo", "pos": 49.9, "w": 15.4, "lado": 1, "dobra": "fim", "ang": 90 },
    { "id": "ve51u9x8", "tipo": "janela", "parede": "w_sala", "pos": 6.7, "w": 9, "lado": 1, "dobra": "inicio", "ang": 90 },
    { "id": "vel37u8z", "tipo": "janela", "parede": "w_dir", "pos": 43.27632025200541, "w": 15, "lado": 1, "dobra": "inicio", "ang": 90 },
    { "id": "vsc8zzdd", "tipo": "porta_correr", "parede": "w_sala", "pos": 18, "w": 12.5, "lado": 1, "dobra": "inicio", "ang": 90 }
  ],
  "itens": [
    { "id": "i1", "tipo": "bloco", "bloco": "retangulo", "x": 3, "y": 19, "w": 7.000000000000001, "h": 46, "rot": 0, "rotulo": "" },
    { "id": "iiuxs73u", "tipo": "bloco", "bloco": "cadeira", "x": 12, "y": 49, "w": 5, "h": 5, "rot": 90, "esp": 0, "rotulo": "" },
    { "id": "ij0v8p4a", "tipo": "bloco", "bloco": "mesa_ret", "x": 36, "y": 9, "w": 12, "h": 7, "rot": 0, "esp": 0, "rotulo": "" },
    { "id": "i50k7pvb", "tipo": "bloco", "bloco": "mesa_ret", "x": 7, "y": 9, "w": 12, "h": 7, "rot": 0, "esp": 0, "rotulo": "" },
    { "id": "dvbzlpxt", "tipo": "bloco", "bloco": "cadeira", "x": 12, "y": 26, "w": 5, "h": 5, "rot": 90, "esp": 0, "rotulo": "" },
    { "id": "d9jw29h7", "tipo": "bloco", "bloco": "cadeira", "x": 40, "y": 3, "w": 5, "h": 5, "rot": 0, "esp": 0, "rotulo": "" },
    { "id": "dxhjh6l5", "tipo": "bloco", "bloco": "cadeira", "x": 12, "y": 38, "w": 5, "h": 5, "rot": 90, "esp": 0, "rotulo": "" },
    { "id": "iqtpqofk", "tipo": "bloco", "bloco": "mesa_reuniao", "x": 62, "y": 13, "w": 15, "h": 5, "rot": 90, "esp": 0, "rotulo": "" },
    { "id": "icqpe10w", "tipo": "bloco", "bloco": "rack", "x": 62, "y": 2, "w": 14, "h": 4, "rot": 0, "esp": 0, "rotulo": "" },
    { "id": "i2vwi9rr", "tipo": "bloco", "bloco": "retangulo", "x": 58, "y": 49, "w": 17, "h": 5, "rot": 0, "esp": 0, "rotulo": "" },
    { "id": "dfh4ke8h", "tipo": "bloco", "bloco": "retangulo", "x": 50, "y": 45, "w": 13, "h": 5, "rot": 90, "esp": 0, "rotulo": "" },
    { "id": "idtdo2l3", "tipo": "bloco", "bloco": "cadeira", "x": 61, "y": 42, "w": 5, "h": 5, "rot": 20, "esp": 0, "rotulo": "" },
    { "id": "i3mdyvyn", "tipo": "bloco", "bloco": "sofa2", "x": 36, "y": 62, "w": 15, "h": 8, "rot": 90, "esp": 0, "rotulo": "" },
    { "id": "iwk9ob73", "tipo": "bloco", "bloco": "planta", "x": 71, "y": 71, "w": 6, "h": 6, "rot": 0, "esp": 0, "rotulo": "" },
    { "id": "da7kh9tt", "tipo": "bloco", "bloco": "cadeira", "x": 11, "y": 3, "w": 5, "h": 5, "rot": 0, "esp": 0, "rotulo": "" }
  ],
  "textos": [
    { "id": "t1", "x": -7, "y": 38, "txt": "ESTAÇÃO DE TRABALHO", "tam": 2.9, "rot": -90 },
    { "id": "t2", "x": 85, "y": 16, "txt": "SALA DE REUNIÃO", "tam": 2.9, "rot": 90 },
    { "id": "t3", "x": 86, "y": 55, "txt": "RECEPÇÃO", "tam": 3, "rot": 90 }
  ],
  "cotas": [
    { "id": "c1", "x1": 1.8, "y1": 1, "x2": 61.1, "y2": 1, "off": -12.5, "texto": "0.59" },
    { "id": "c2", "x1": 61.1, "y1": 1, "x2": 79, "y2": 1, "off": -12.5, "texto": "0.18" },
    { "id": "c3", "x1": 1, "y1": 79.5, "x2": 1, "y2": 0.6, "off": -15, "texto": "0.81" },
    { "id": "c4", "x1": 79, "y1": 33, "x2": 79, "y2": 0.6, "off": 14, "texto": "0.49" },
    { "id": "c5", "x1": 79, "y1": 79.4, "x2": 79, "y2": 33, "off": 14, "texto": "0.56" }
  ]
  });
}

/* -------------------------------------------------------------- estado ---- */
var doc = plantaPadrao();
var sel = null, tool = 'selecionar', blocoAtual = 'retangulo';
var view = { x: 60, y: 40, k: 5 };
var pilha = [], pilhaR = [];
var mostrarGrade = true, imã = true, mostrarCotas = true;
var arraste = null, desenho = null;

var svg = $('#svg'), world = $('#world');
var gGrade = $('#gGrade'), gPP = $('#gParedePreta'), gPB = $('#gParedeBranca'),
    gVaos = $('#gVaos'), gItens = $('#gItens'), gTextos = $('#gTextos'),
    gCotas = $('#gCotas'), gPrev = $('#gPreview'), gSel = $('#gSel');

/* --------------------------------------------------------- geometria ------ */
function parede(id) { for (var i = 0; i < doc.paredes.length; i++) if (doc.paredes[i].id === id) return doc.paredes[i]; return null; }
function pLen(w) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1); }
function pAng(w) { return Math.atan2(w.y2 - w.y1, w.x2 - w.x1); }
function pLocal(w, x, y) {
  var a = pAng(w), c = Math.cos(a), s = Math.sin(a), dx = x - w.x1, dy = y - w.y1;
  return [dx * c + dy * s, -dx * s + dy * c];
}
function pGlobal(w, t, s) {
  var a = pAng(w), c = Math.cos(a), si = Math.sin(a);
  return [w.x1 + t * c - s * si, w.y1 + t * si + s * c];
}
function encosta(o, x, y) {
  var l = pLocal(o, x, y), L = pLen(o);
  return l[0] >= -0.7 && l[0] <= L + 0.7 && Math.abs(l[1]) <= o.t / 2 + 0.7;
}
function pontas(w) {
  var e1 = 0, e2 = 0;
  for (var i = 0; i < doc.paredes.length; i++) {
    var o = doc.paredes[i]; if (o.id === w.id) continue;
    if (encosta(o, w.x1, w.y1)) e1 = Math.max(e1, o.t / 2);
    if (encosta(o, w.x2, w.y2)) e2 = Math.max(e2, o.t / 2);
  }
  return [e1, e2];
}
function pedacos(w) {
  var L = pLen(w), lista = [], cur = 0;
  var vs = doc.vaos.filter(function (v) { return v.parede === w.id; })
                   .sort(function (a, b) { return a.pos - b.pos; });
  for (var i = 0; i < vs.length; i++) {
    var a = clamp(vs[i].pos, 0, L), b = clamp(vs[i].pos + vs[i].w, 0, L);
    if (a > cur) lista.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < L) lista.push([cur, L]);
  return lista.filter(function (s) { return s[1] - s[0] > 0.01; });
}
function paredeMaisPerto(x, y) {
  var melhor = null, d0 = 1e9;
  for (var i = 0; i < doc.paredes.length; i++) {
    var w = doc.paredes[i], l = pLocal(w, x, y), L = pLen(w);
    var t = clamp(l[0], 0, L);
    var g = pGlobal(w, t, 0), d = Math.hypot(g[0] - x, g[1] - y);
    if (d < d0) { d0 = d; melhor = { parede: w, t: t, d: d }; }
  }
  return melhor;
}

/* --------------------------------------------------------- desenho -------- */
function render() {
  [gGrade, gPP, gPB, gVaos, gItens, gTextos, gCotas, gSel].forEach(function (g) { g.textContent = ''; });
  world.setAttribute('transform', 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')');
  desGrade(); desParedes(); desVaos(); desItens(); desTextos();
  if (mostrarCotas) desCotas();
  desSelecao();
  $('#btUndo').disabled = !pilha.length;
  $('#btRedo').disabled = !pilhaR.length;
}

function desGrade() {
  if (!mostrarGrade) return;
  var r = svg.getBoundingClientRect();
  var x0 = Math.floor((-view.x / view.k) / 10) * 10, x1 = (-view.x + r.width) / view.k;
  var y0 = Math.floor((-view.y / view.k) / 10) * 10, y1 = (-view.y + r.height) / view.k;
  var f = document.createDocumentFragment();
  for (var x = x0; x < x1; x += 10) f.appendChild(el('line', { x1: x, y1: y0, x2: x, y2: y1, stroke: '#e8ebf0', 'stroke-width': 0.15 }));
  for (var y = y0; y < y1; y += 10) f.appendChild(el('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: '#e8ebf0', 'stroke-width': 0.15 }));
  gGrade.appendChild(f);
}

function desParedes() {
  doc.paredes.forEach(function (w) {
    var L = pLen(w), ext = pontas(w);
    var tr = 'translate(' + w.x1 + ' ' + w.y1 + ') rotate(' + (pAng(w) * 180 / Math.PI) + ')';
    pedacos(w).forEach(function (s) {
      var a = s[0], b = s[1];
      if (a <= 0.01) a -= ext[0];
      if (b >= L - 0.01) b += ext[1];
      gPP.appendChild(el('rect', {
        x: a - LW / 2, y: -w.t / 2 - LW / 2, width: (b - a) + LW, height: w.t + LW,
        transform: tr, fill: '#000', 'data-id': w.id, 'data-tipo': 'parede'
      }));
      if (b - a > LW * 2) gPB.appendChild(el('rect', {
        x: a + LW / 2, y: -w.t / 2 + LW / 2, width: (b - a) - LW, height: w.t - LW,
        transform: tr, fill: '#fff', 'data-id': w.id, 'data-tipo': 'parede'
      }));
    });
  });
}

function desVaos() {
  doc.vaos.forEach(function (v) {
    var w = parede(v.parede); if (!w) return;
    var def = VAOS[v.tipo] || VAOS.porta;
    var tr = 'translate(' + w.x1 + ' ' + w.y1 + ') rotate(' + (pAng(w) * 180 / Math.PI) + ')';
    var g = el('g', { transform: tr, 'data-id': v.id, 'data-tipo': v.tipo });
    def.d(g, v, w);
    g.appendChild(el('rect', { x: v.pos, y: -w.t / 2 - 1.2, width: v.w, height: w.t + 2.4, fill: 'transparent' }));
    gVaos.appendChild(g);
  });
}

function desItens() {
  doc.itens.forEach(function (it) {
    var g = el('g', { 'data-id': it.id, 'data-tipo': it.tipo });
    if (it.tipo === 'bloco') {
      var def = BLOCOS[it.bloco] || BLOCOS.retangulo;
      var t = 'translate(' + it.x + ' ' + it.y + ')';
      if (it.rot) t += ' rotate(' + it.rot + ' ' + (it.w / 2) + ' ' + (it.h / 2) + ')';
      if (it.esp) t += ' translate(' + it.w + ' 0) scale(-1 1)';
      var gg = el('g', { transform: t });
      def.d(gg, it.w, it.h);
      if (it.rotulo) gg.appendChild(_tx(it.w / 2, it.h / 2, it.rotulo, Math.min(it.w, it.h) * 0.28));
      gg.appendChild(el('rect', { x: 0, y: 0, width: it.w, height: it.h, fill: 'transparent' }));
      g.appendChild(gg);
    } else if (it.tipo === 'tomada') {
      var n = it.n || 1, W = n * CELL, H = CELL;
      var gt = el('g', { transform: 'translate(' + it.x + ' ' + it.y + ') rotate(' + (it.rot || 0) + ')' });
      gt.appendChild(_r(-W / 2, -H / 2, W, H));
      for (var i = 0; i < n; i++) {
        var cx = -W / 2 + CELL * (i + 0.5);
        if (i) gt.appendChild(_l(-W / 2 + CELL * i, -H / 2, -W / 2 + CELL * i, H / 2));
        gt.appendChild(_c(cx, 0, CELL * 0.27));
        gt.appendChild(_cf(cx - CELL * 0.12, 0, CELL * 0.05));
        gt.appendChild(_cf(cx + CELL * 0.12, 0, CELL * 0.05));
      }
      gt.appendChild(el('rect', { x: -W / 2, y: -H / 2, width: W, height: H, fill: 'transparent' }));
      g.appendChild(gt);
    } else if (it.tipo === 'interruptor') {
      var r = CELL * 0.42;
      var gi = el('g', { transform: 'translate(' + it.x + ' ' + it.y + ') rotate(' + (it.rot || 0) + ')' });
      gi.appendChild(_r(-r, -r, r * 2, r * 2, r * 0.5));
      gi.appendChild(_l(0, 0, r * 1.9, -r * 1.9));
      gi.appendChild(_l(r * 1.35, -r * 1.9, r * 1.9, -r * 1.9));
      gi.appendChild(el('rect', { x: -r, y: -r * 2, width: r * 3, height: r * 3, fill: 'transparent' }));
      g.appendChild(gi);
    }
    gItens.appendChild(g);
  });
}

function desTextos() {
  doc.textos.forEach(function (t) {
    var g = el('g', { 'data-id': t.id, 'data-tipo': 'texto' });
    var tx = el('text', {
      transform: 'translate(' + t.x + ' ' + t.y + ') rotate(' + (t.rot || 0) + ')',
      'font-size': t.tam, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#000', 'font-family': 'Arial, Helvetica, sans-serif'
    });
    tx.textContent = t.txt;
    g.appendChild(tx);
    gTextos.appendChild(g);
  });
}

function desCotas() {
  doc.cotas.forEach(function (c) {
    var dx = c.x2 - c.x1, dy = c.y2 - c.y1, L = Math.hypot(dx, dy); if (L < 0.01) return;
    var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    var ox = nx * c.off, oy = ny * c.off, s = c.off < 0 ? -1 : 1;
    var Ax = c.x1 + ox, Ay = c.y1 + oy, Bx = c.x2 + ox, By = c.y2 + oy;
    var g = el('g', { 'data-id': c.id, 'data-tipo': 'cota' });
    var cor = '#2222cc', lw = LW * 0.75;
    g.appendChild(el('line', { x1: c.x1 + nx * s, y1: c.y1 + ny * s, x2: Ax + nx * s * 1.6, y2: Ay + ny * s * 1.6, stroke: cor, 'stroke-width': lw }));
    g.appendChild(el('line', { x1: c.x2 + nx * s, y1: c.y2 + ny * s, x2: Bx + nx * s * 1.6, y2: By + ny * s * 1.6, stroke: cor, 'stroke-width': lw }));
    g.appendChild(el('line', { x1: Ax - ux * 1.6, y1: Ay - uy * 1.6, x2: Bx + ux * 1.6, y2: By + uy * 1.6, stroke: cor, 'stroke-width': lw }));
    [[Ax, Ay], [Bx, By]].forEach(function (p) {
      var kx = (ux + nx) * 1.5, ky = (uy + ny) * 1.5;
      g.appendChild(el('line', { x1: p[0] - kx, y1: p[1] - ky, x2: p[0] + kx, y2: p[1] + ky, stroke: cor, 'stroke-width': lw }));
    });
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    var tam = 5.4, mx = (Ax + Bx) / 2 + nx * s * tam * 0.75, my = (Ay + By) / 2 + ny * s * tam * 0.75;
    var tx = el('text', {
      transform: 'translate(' + mx + ' ' + my + ') rotate(' + ang + ')',
      'font-size': tam, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#000', 'font-family': 'Arial, Helvetica, sans-serif'
    });
    tx.textContent = c.texto ? c.texto : m(L);
    g.appendChild(tx);
    gCotas.appendChild(g);
  });
}

/* ---------------------------------------------------- caixa / seleção ----- */
function caixa(o) {
  if (!o) return null;
  var t = o.tipo, d = o.dado;
  if (t === 'parede') { var e = d.t / 2 + 0.5;
    return { x: Math.min(d.x1, d.x2) - e, y: Math.min(d.y1, d.y2) - e,
             w: Math.abs(d.x2 - d.x1) + e * 2, h: Math.abs(d.y2 - d.y1) + e * 2 }; }
  if (t === 'vao') {
    var pw = parede(d.parede); if (!pw) return null;
    var a = pGlobal(pw, d.pos, 0), b = pGlobal(pw, d.pos + d.w, 0), e2 = pw.t / 2 + 1;
    return { x: Math.min(a[0], b[0]) - e2, y: Math.min(a[1], b[1]) - e2,
             w: Math.abs(b[0] - a[0]) + e2 * 2, h: Math.abs(b[1] - a[1]) + e2 * 2 };
  }
  if (t === 'bloco') return { x: d.x, y: d.y, w: d.w, h: d.h };
  if (t === 'tomada') { var W = (d.n || 1) * CELL, R = Math.max(W, CELL) / 2 + 0.7;
    return { x: d.x - R, y: d.y - R, w: R * 2, h: R * 2 }; }
  if (t === 'interruptor') return { x: d.x - 3, y: d.y - 3, w: 6, h: 6 };
  if (t === 'texto') { var lar = d.txt.length * d.tam * 0.52, alt = d.tam * 1.2;
    var vert = Math.abs(d.rot || 0) > 45;
    var a2 = vert ? alt : lar, b2 = vert ? lar : alt;
    return { x: d.x - a2 / 2, y: d.y - b2 / 2, w: a2, h: b2 }; }
  if (t === 'cota') return { x: Math.min(d.x1, d.x2) - 2, y: Math.min(d.y1, d.y2) - 2,
    w: Math.abs(d.x2 - d.x1) + 4, h: Math.abs(d.y2 - d.y1) + 4 };
  return null;
}
function achar(id) {
  var i, arr;
  for (i = 0; i < doc.paredes.length; i++) if (doc.paredes[i].id === id) return { tipo: 'parede', dado: doc.paredes[i], lista: 'paredes' };
  for (i = 0; i < doc.vaos.length; i++) if (doc.vaos[i].id === id) return { tipo: 'vao', dado: doc.vaos[i], lista: 'vaos' };
  for (i = 0; i < doc.itens.length; i++) if (doc.itens[i].id === id) return { tipo: doc.itens[i].tipo, dado: doc.itens[i], lista: 'itens' };
  for (i = 0; i < doc.textos.length; i++) if (doc.textos[i].id === id) return { tipo: 'texto', dado: doc.textos[i], lista: 'textos' };
  for (i = 0; i < doc.cotas.length; i++) if (doc.cotas[i].id === id) return { tipo: 'cota', dado: doc.cotas[i], lista: 'cotas' };
  return null;
}
function desSelecao() {
  if (!sel) return;
  var o = achar(sel), b = caixa(o); if (!b) return;
  gSel.appendChild(el('rect', {
    x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none', stroke: '#2f5bd6',
    'stroke-width': 0.4, 'stroke-dasharray': '1.6 1.2', 'pointer-events': 'none'
  }));
  if (o.tipo === 'bloco') {   // alças de redimensionar
    var s = 4 / view.k, d = o.dado;
    [['no', d.x, d.y], ['ne', d.x + d.w, d.y], ['so', d.x, d.y + d.h], ['se', d.x + d.w, d.y + d.h]]
    .forEach(function (h) {
      gSel.appendChild(el('rect', { x: h[1] - s / 2, y: h[2] - s / 2, width: s, height: s,
        fill: '#fff', stroke: '#2f5bd6', 'stroke-width': 0.35,
        'data-alca': h[0], 'data-id': d.id, style: 'cursor:nwse-resize' }));
    });
  }
}

/* ------------------------------------------------------- histórico -------- */
function marcar() { pilha.push(JSON.stringify(doc)); if (pilha.length > 80) pilha.shift(); pilhaR = []; }
function commit() { salvarLocal(); render(); painel(); }
function desfazer() { if (!pilha.length) return; pilhaR.push(JSON.stringify(doc)); doc = JSON.parse(pilha.pop()); sel = null; commit(); }
function refazer() { if (!pilhaR.length) return; pilha.push(JSON.stringify(doc)); doc = JSON.parse(pilhaR.pop()); sel = null; commit(); }
function salvarLocal() { try { localStorage.setItem(CHAVE, JSON.stringify(doc)); } catch (e) {} }
function carregarLocal() {
  try { var s = localStorage.getItem(CHAVE); if (s) { var d = JSON.parse(s); if (d && d.paredes) doc = migrar(d); } } catch (e) {}
}

/* ------------------------------------------------------- coordenadas ------ */
function mundo(ev) {
  var r = svg.getBoundingClientRect();
  return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
}
function ajusta(v) { return imã ? Math.round(v / SNAP) * SNAP : Math.round(v * 100) / 100; }

/* --------------------------------------------------------- inserções ------ */
function novaAbertura(tipo, p) {
  var alvo = paredeMaisPerto(p.x, p.y);
  if (!alvo || alvo.d > 6) return null;
  var L = pLen(alvo.parede), larg = Math.min(VAOS[tipo].wPad, L - 2);
  var v = { id: uid('v'), tipo: tipo, parede: alvo.parede.id,
    pos: clamp(alvo.t - larg / 2, 0.5, Math.max(0.5, L - larg - 0.5)),
    w: larg, lado: 1, dobra: 'inicio', ang: 90 };
  doc.vaos.push(v); return v;
}
function novoBloco(chave, p, cx, cy) {
  var def = BLOCOS[chave];
  if (def.legado === 'tomada' || def.legado === 'interruptor') {
    var pr = paredeMaisPerto(p.x, p.y), rot = 0, x = ajusta(p.x), y = ajusta(p.y);
    if (pr && pr.d < 5) {
      var g = pGlobal(pr.parede, pr.t, 0);
      x = Math.round(g[0] * 10) / 10; y = Math.round(g[1] * 10) / 10;
      rot = pAng(pr.parede) * 180 / Math.PI;
    }
    var it = def.legado === 'tomada'
      ? { id: uid('i'), tipo: 'tomada', x: x, y: y, n: 1, rot: rot }
      : { id: uid('i'), tipo: 'interruptor', x: x, y: y, rot: 0 };
    doc.itens.push(it); return it;
  }
  var w = cx || def.w, h = cy || def.h;
  var b = { id: uid('i'), tipo: 'bloco', bloco: chave,
    x: ajusta(p.x - (cx ? 0 : w / 2)), y: ajusta(p.y - (cy ? 0 : h / 2)),
    w: w, h: h, rot: 0, esp: 0, rotulo: '' };
  doc.itens.push(b); return b;
}

/* ------------------------------------------------------------ mouse ------- */
svg.addEventListener('mousedown', function (ev) {
  if (ev.button === 1 || ev.button === 2) return;
  var p = mundo(ev);
  var alvo = ev.target.closest ? ev.target.closest('[data-id]') : null;
  var id = alvo ? alvo.getAttribute('data-id') : null;
  var alca = alvo ? alvo.getAttribute('data-alca') : null;

  if (tool === 'apagar') { if (id) { marcar(); remover(id); sel = null; commit(); } return; }

  if (tool === 'selecionar') {
    if (alca) {                                   // redimensionar
      var oa = achar(id); marcar();
      arraste = { id: id, alca: alca, p0: p, orig: clone(oa.dado), tipo: oa.tipo, moveu: false };
      return;
    }
    if (id) {
      sel = id; painel(); render();
      var o = achar(id); marcar();
      arraste = { id: id, p0: p, orig: clone(o.dado), tipo: o.tipo, moveu: false };
    } else {
      sel = null; painel(); render();
      arraste = { pan: true, x0: ev.clientX, y0: ev.clientY, vx: view.x, vy: view.y };
      svg.classList.add('mao');
    }
    return;
  }

  if (tool === 'abertura') {
    marcar();
    var v = novaAbertura($('#tipoVao').value, p);
    if (v) { sel = v.id; setTool('selecionar'); commit(); } else pilha.pop();
    return;
  }

  if (tool === 'bloco') {
    var def = BLOCOS[blocoAtual];
    if (def.legado) { marcar(); var it = novoBloco(blocoAtual, p); sel = it.id; setTool('selecionar'); commit(); }
    else desenho = { tipo: 'bloco', x0: ajusta(p.x), y0: ajusta(p.y), x1: ajusta(p.x), y1: ajusta(p.y) };
    return;
  }

  if (tool === 'texto') {
    var txt = prompt('Texto:', 'novo texto');
    if (txt) { marcar(); var t = { id: uid('t'), x: ajusta(p.x), y: ajusta(p.y), txt: txt, tam: 3, rot: 0 };
      doc.textos.push(t); sel = t.id; setTool('selecionar'); commit(); }
    return;
  }

  if (tool === 'parede' || tool === 'cota') {
    desenho = { tipo: tool, x0: ajusta(p.x), y0: ajusta(p.y), x1: ajusta(p.x), y1: ajusta(p.y) };
  }
});

window.addEventListener('mousemove', function (ev) {
  var p = mundo(ev);
  $('#stCoord').textContent = 'x ' + m3(p.x) + ' m   ·   y ' + m3(p.y) + ' m';

  if (arraste && arraste.pan) {
    view.x = arraste.vx + (ev.clientX - arraste.x0);
    view.y = arraste.vy + (ev.clientY - arraste.y0);
    render(); return;
  }
  if (arraste) {
    var dx = p.x - arraste.p0.x, dy = p.y - arraste.p0.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.2) arraste.moveu = true;
    if (arraste.alca) redimensionar(arraste, p); else mover(arraste, dx, dy, p);
    render(); return;
  }
  if (desenho) {
    var x = ajusta(p.x), y = ajusta(p.y);
    if (ev.shiftKey && desenho.tipo !== 'bloco') {
      if (Math.abs(x - desenho.x0) > Math.abs(y - desenho.y0)) y = desenho.y0; else x = desenho.x0;
    }
    desenho.x1 = x; desenho.y1 = y;
    previa();
  }
});

window.addEventListener('mouseup', function () {
  svg.classList.remove('mao');
  if (arraste) {
    if (!arraste.pan) { if (arraste.moveu) commit(); else pilha.pop(); }
    arraste = null;
  }
  if (desenho) {
    var d = desenho; desenho = null; gPrev.textContent = '';
    var L = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    marcar();
    if (d.tipo === 'parede') {
      if (L < 1) { pilha.pop(); return; }
      var w = { id: uid('w'), x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, t: 2 };
      doc.paredes.push(w); sel = w.id;
    } else if (d.tipo === 'cota') {
      if (L < 1) { pilha.pop(); return; }
      var c = { id: uid('c'), x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, off: -10, texto: '' };
      doc.cotas.push(c); sel = c.id;
    } else {   // bloco: clique = tamanho padrão, arraste = tamanho desenhado
      var it;
      if (Math.abs(d.x1 - d.x0) < 1.5 || Math.abs(d.y1 - d.y0) < 1.5) it = novoBloco(blocoAtual, { x: d.x0, y: d.y0 });
      else it = novoBloco(blocoAtual, { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1) },
        Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      sel = it.id;
    }
    setTool('selecionar'); commit();
  }
});

svg.addEventListener('wheel', function (ev) {
  ev.preventDefault();
  var r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
  var f = ev.deltaY < 0 ? 1.12 : 1 / 1.12, k = clamp(view.k * f, 0.5, 60);
  view.x = mx - (mx - view.x) * (k / view.k);
  view.y = my - (my - view.y) * (k / view.k);
  view.k = k; render();
}, { passive: false });

svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });

function previa() {
  gPrev.textContent = '';
  var d = desenho; if (!d) return;
  if (d.tipo === 'bloco') {
    gPrev.appendChild(el('rect', { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
      width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0),
      fill: 'rgba(47,91,214,.08)', stroke: '#2f5bd6', 'stroke-width': 0.4 }));
  } else {
    gPrev.appendChild(el('line', { x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1,
      stroke: '#2f5bd6', 'stroke-width': d.tipo === 'parede' ? 2 : 0.4, opacity: 0.55 }));
  }
  var L = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
  gPrev.appendChild(el('text', { x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2 - 2, 'font-size': 3,
    'text-anchor': 'middle', fill: '#2f5bd6', 'font-family': 'Arial' })).textContent = m(L) + ' m';
}

function mover(a, dx, dy, p) {
  var o = achar(a.id); if (!o) return;
  var d = o.dado, or_ = a.orig;
  if (o.tipo === 'parede') {
    d.x1 = ajusta(or_.x1 + dx); d.y1 = ajusta(or_.y1 + dy);
    d.x2 = ajusta(or_.x2 + dx); d.y2 = ajusta(or_.y2 + dy);
  } else if (o.tipo === 'vao') {
    var alvo = paredeMaisPerto(p.x, p.y);
    if (alvo && alvo.d < 8) {
      var L = pLen(alvo.parede);
      d.parede = alvo.parede.id;
      d.pos = clamp(Math.round((alvo.t - d.w / 2) * 10) / 10, 0, Math.max(0, L - d.w));
    }
  } else {
    d.x = ajusta(or_.x + dx); d.y = ajusta(or_.y + dy);
    if (o.tipo === 'cota') { d.x1 = ajusta(or_.x1 + dx); d.y1 = ajusta(or_.y1 + dy);
                             d.x2 = ajusta(or_.x2 + dx); d.y2 = ajusta(or_.y2 + dy); }
  }
}
function redimensionar(a, p) {
  var o = achar(a.id); if (!o || o.tipo !== 'bloco') return;
  var d = o.dado, or_ = a.orig, x = ajusta(p.x), y = ajusta(p.y);
  if (a.alca.indexOf('o') >= 0) { d.x = Math.min(x, or_.x + or_.w - 1); d.w = or_.x + or_.w - d.x; }
  if (a.alca.indexOf('e') >= 0) { d.w = Math.max(1, x - or_.x); d.x = or_.x; }
  if (a.alca.indexOf('n') >= 0) { d.y = Math.min(y, or_.y + or_.h - 1); d.h = or_.y + or_.h - d.y; }
  if (a.alca.indexOf('s') >= 0) { d.h = Math.max(1, y - or_.y); d.y = or_.y; }
}

function remover(id) {
  var o = achar(id); if (!o) return;
  doc[o.lista] = doc[o.lista].filter(function (x) { return x.id !== id; });
  if (o.tipo === 'parede') doc.vaos = doc.vaos.filter(function (v) { return v.parede !== id; });
}
function duplicar(id) {
  var o = achar(id); if (!o) return;
  var c = clone(o.dado); c.id = uid('d');
  if (c.x !== undefined) { c.x += 4; c.y += 4; }
  if (c.x1 !== undefined) { c.x1 += 4; c.y1 += 4; c.x2 += 4; c.y2 += 4; }
  if (o.tipo === 'vao') c.pos += c.w + 2;
  doc[o.lista].push(c); sel = c.id;
}

/* ------------------------------------------------------- teclado ---------- */
window.addEventListener('keydown', function (ev) {
  var tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  var k = ev.key.toLowerCase();
  if (ev.ctrlKey && k === 'z') { ev.preventDefault(); desfazer(); return; }
  if (ev.ctrlKey && (k === 'y' || (ev.shiftKey && k === 'z'))) { ev.preventDefault(); refazer(); return; }
  if (ev.ctrlKey && k === 'd') { ev.preventDefault(); if (sel) { marcar(); duplicar(sel); commit(); } return; }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { if (sel) { marcar(); remover(sel); sel = null; commit(); } return; }
  if (ev.key === 'Escape') { desenho = null; gPrev.textContent = ''; sel = null; setTool('selecionar'); commit(); return; }
  if (k === 'f') { enquadrar(); return; }
  var atalhos = { v: 'selecionar', w: 'parede', x: 'texto', c: 'cota', d: 'apagar' };
  if (atalhos[k]) { setTool(atalhos[k]); return; }
  if (k === 'p') { $('#tipoVao').value = 'porta'; setTool('abertura'); }
  if (k === 'r') { $('#tipoVao').value = 'porta_correr'; setTool('abertura'); }
  if (k === 'j') { $('#tipoVao').value = 'janela'; setTool('abertura'); }
  if (k === 't') { selBloco('tomada'); }
  if (k === 'i') { selBloco('interruptor'); }
  if (k === 'm') { selBloco('retangulo'); }
});

/* ------------------------------------------------ painel de propriedades -- */
function campo(rot, valor, onch, tipo, passo) {
  var d = document.createElement('div'); d.className = 'grupo';
  var l = document.createElement('label'); l.textContent = rot; d.appendChild(l);
  var i = document.createElement('input');
  i.type = tipo || 'number'; i.value = valor;
  if (i.type === 'number') i.step = passo || 0.01;
  i.addEventListener('change', function () { marcar(); onch(i.value); commit(); });
  d.appendChild(i); return d;
}
function seletor(rot, opts, valor, onch) {
  var d = document.createElement('div'); d.className = 'grupo';
  var l = document.createElement('label'); l.textContent = rot; d.appendChild(l);
  var s = document.createElement('select');
  opts.forEach(function (o) {
    var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
    if (o[0] === valor) op.selected = true; s.appendChild(op);
  });
  s.addEventListener('change', function () { marcar(); onch(s.value); commit(); });
  d.appendChild(s); return d;
}
function dupla(a, b) { var d = document.createElement('div'); d.className = 'dupla';
  var x = document.createElement('div'), y = document.createElement('div');
  x.appendChild(a); y.appendChild(b); d.appendChild(x); d.appendChild(y); return d; }
function botao(txt, fn, cls) { var b = document.createElement('button'); b.textContent = txt;
  if (cls) b.className = cls; b.addEventListener('click', fn); return b; }
function linhaBotoes(box) { var d = document.createElement('div'); d.className = 'acoes';
  for (var i = 1; i < arguments.length; i++) d.appendChild(arguments[i]); box.appendChild(d); }

function painel() {
  var box = $('#formProps'); box.textContent = '';
  if (!sel) { box.innerHTML = '<p class="vazio">Nada selecionado.<br>Clique em uma parede, porta, bloco, texto ou cota.</p>'; return; }
  var o = achar(sel); if (!o) { sel = null; return painel(); }
  var d = o.dado;
  var nomes = { parede: 'Parede', tomada: 'Tomada', interruptor: 'Interruptor', texto: 'Texto', cota: 'Cota' };
  var h = document.createElement('div'); h.className = 'tipoSel';
  h.textContent = o.tipo === 'vao' ? (VAOS[d.tipo] ? VAOS[d.tipo].nome : 'Abertura')
                : o.tipo === 'bloco' ? (BLOCOS[d.bloco] ? BLOCOS[d.bloco].nome : 'Bloco')
                : (nomes[o.tipo] || o.tipo);
  box.appendChild(h);

  if (o.tipo === 'parede') {
    box.appendChild(dupla(campo('Início X (m)', m3(d.x1), function (v) { d.x1 = paraCm(v); }),
                          campo('Início Y (m)', m3(d.y1), function (v) { d.y1 = paraCm(v); })));
    box.appendChild(dupla(campo('Fim X (m)', m3(d.x2), function (v) { d.x2 = paraCm(v); }),
                          campo('Fim Y (m)', m3(d.y2), function (v) { d.y2 = paraCm(v); })));
    box.appendChild(campo('Espessura (m)', m3(d.t), function (v) { d.t = Math.max(0.4, paraCm(v)); }));
    var p = document.createElement('p'); p.className = 'nota';
    p.textContent = 'Comprimento: ' + m(pLen(d)) + ' m'; box.appendChild(p);
  }

  if (o.tipo === 'vao') {
    var w = parede(d.parede), L = w ? pLen(w) : 100;
    var opts = []; for (var kk in VAOS) opts.push([kk, VAOS[kk].nome]);
    box.appendChild(seletor('Tipo', opts, d.tipo, function (v) { d.tipo = v; }));
    box.appendChild(campo('Largura (m)', m3(d.w), function (v) { d.w = clamp(paraCm(v), 1, L); }));
    box.appendChild(campo('Distância do início da parede (m)', m3(d.pos), function (v) { d.pos = clamp(paraCm(v), 0, L - d.w); }));
    if (VAOS[d.tipo] && VAOS[d.tipo].giro)
      box.appendChild(campo('Ângulo de abertura (°)', d.ang, function (v) { d.ang = clamp(parseFloat(v) || 0, 0, 180); }, 'number', 5));
    if (d.tipo !== 'vao') {
      linhaBotoes(box, botao('↔ Inverter lado', function () { marcar(); d.dobra = d.dobra === 'inicio' ? 'fim' : 'inicio'; commit(); }));
      linhaBotoes(box, botao('↕ Inverter sentido', function () { marcar(); d.lado = -(d.lado || 1); commit(); }));
    }
    var n2 = document.createElement('p'); n2.className = 'nota';
    n2.textContent = 'Arraste para deslizar pela parede (ou para outra parede).'; box.appendChild(n2);
  }

  if (o.tipo === 'bloco') {
    var lista = []; for (var b in BLOCOS) if (!BLOCOS[b].legado) lista.push([b, BLOCOS[b].cat + ' · ' + BLOCOS[b].nome]);
    lista.sort(function (a, c) { return a[1] < c[1] ? -1 : 1; });
    box.appendChild(seletor('Bloco', lista, d.bloco, function (v) { d.bloco = v; }));
    box.appendChild(dupla(campo('X (m)', m3(d.x), function (v) { d.x = paraCm(v); }),
                          campo('Y (m)', m3(d.y), function (v) { d.y = paraCm(v); })));
    box.appendChild(dupla(campo('Largura (m)', m3(d.w), function (v) { d.w = Math.max(0.5, paraCm(v)); }),
                          campo('Altura (m)', m3(d.h), function (v) { d.h = Math.max(0.5, paraCm(v)); })));
    box.appendChild(campo('Rotação (°)', d.rot || 0, function (v) { d.rot = parseFloat(v) || 0; }, 'number', 5));
    box.appendChild(campo('Rótulo', d.rotulo || '', function (v) { d.rotulo = v; }, 'text'));
    linhaBotoes(box,
      botao('⟲ Girar 90°', function () { marcar(); d.rot = ((d.rot || 0) + 90) % 360; commit(); }),
      botao('⇋ Espelhar', function () { marcar(); d.esp = d.esp ? 0 : 1; commit(); }));
  }

  if (o.tipo === 'tomada') {
    box.appendChild(dupla(campo('X (m)', m3(d.x), function (v) { d.x = paraCm(v); }),
                          campo('Y (m)', m3(d.y), function (v) { d.y = paraCm(v); })));
    box.appendChild(campo('Quantidade de tomadas', d.n || 1, function (v) { d.n = clamp(parseInt(v, 10) || 1, 1, 12); }, 'number', 1));
    box.appendChild(campo('Rotação (°)', d.rot || 0, function (v) { d.rot = parseFloat(v) || 0; }, 'number', 15));
  }

  if (o.tipo === 'interruptor') {
    box.appendChild(dupla(campo('X (m)', m3(d.x), function (v) { d.x = paraCm(v); }),
                          campo('Y (m)', m3(d.y), function (v) { d.y = paraCm(v); })));
    box.appendChild(campo('Rotação (°)', d.rot || 0, function (v) { d.rot = parseFloat(v) || 0; }, 'number', 15));
  }

  if (o.tipo === 'texto') {
    var g = document.createElement('div'); g.className = 'grupo';
    var lb = document.createElement('label'); lb.textContent = 'Conteúdo'; g.appendChild(lb);
    var ta = document.createElement('textarea'); ta.value = d.txt;
    ta.addEventListener('change', function () { marcar(); d.txt = ta.value; commit(); });
    g.appendChild(ta); box.appendChild(g);
    box.appendChild(dupla(campo('X (m)', m3(d.x), function (v) { d.x = paraCm(v); }),
                          campo('Y (m)', m3(d.y), function (v) { d.y = paraCm(v); })));
    box.appendChild(dupla(campo('Tamanho (m)', m3(d.tam), function (v) { d.tam = Math.max(0.3, paraCm(v)); }),
                          campo('Rotação (°)', d.rot || 0, function (v) { d.rot = parseFloat(v) || 0; }, 'number', 15)));
  }

  if (o.tipo === 'cota') {
    var Lc = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    box.appendChild(campo('Texto da cota (vazio = medida real)', d.texto || '', function (v) { d.texto = v.trim(); }, 'text'));
    var nt = document.createElement('p'); nt.className = 'nota';
    nt.textContent = 'Medida real: ' + m(Lc) + ' m'; box.appendChild(nt);
    box.appendChild(campo('Afastamento (m)', m3(d.off), function (v) { d.off = paraCm(v); }));
    box.appendChild(dupla(campo('P1 X (m)', m3(d.x1), function (v) { d.x1 = paraCm(v); }),
                          campo('P1 Y (m)', m3(d.y1), function (v) { d.y1 = paraCm(v); })));
    box.appendChild(dupla(campo('P2 X (m)', m3(d.x2), function (v) { d.x2 = paraCm(v); }),
                          campo('P2 Y (m)', m3(d.y2), function (v) { d.y2 = paraCm(v); })));
  }

  linhaBotoes(box,
    botao('Duplicar', function () { marcar(); duplicar(sel); commit(); }),
    botao('Excluir', function () { marcar(); remover(sel); sel = null; commit(); }, 'perigo'));
}

/* ---------------------------------------------------------- ferramentas --- */
var NOMES_TOOL = { selecionar: 'Selecionar', parede: 'Parede', abertura: 'Abertura',
  bloco: 'Bloco', texto: 'Texto', cota: 'Cota', apagar: 'Apagar' };
function setTool(t) {
  tool = t;
  [].forEach.call(document.querySelectorAll('.ferr'), function (b) {
    b.classList.toggle('ativa', b.getAttribute('data-tool') === t);
  });
  [].forEach.call(document.querySelectorAll('.blk'), function (b) {
    b.classList.toggle('ativa', t === 'bloco' && b.getAttribute('data-blk') === blocoAtual);
  });
  svg.classList.toggle('desenhando', t !== 'selecionar');
  $('#stTool').textContent = t === 'bloco' ? BLOCOS[blocoAtual].nome
    : t === 'abertura' ? VAOS[$('#tipoVao').value].nome : (NOMES_TOOL[t] || t);
}
function selBloco(chave) { blocoAtual = chave; montarBlocos(); setTool('bloco'); }
[].forEach.call(document.querySelectorAll('.ferr'), function (b) {
  b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
});

/* lista de tipos de abertura */
(function montarVaos() {
  var s = $('#tipoVao'), grupos = { 'Portas': [], 'Janelas': [] };
  for (var k in VAOS) (ehPorta(k) ? grupos.Portas : grupos.Janelas).push([k, VAOS[k].nome]);
  for (var g in grupos) {
    var og = document.createElement('optgroup'); og.label = g;
    grupos[g].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; og.appendChild(op);
    });
    s.appendChild(og);
  }
  s.value = 'porta';
  s.addEventListener('change', function () { setTool('abertura'); });
})();

/* catálogo de blocos */
function categorias() {
  var c = [], vis = {};
  for (var k in BLOCOS) if (!vis[BLOCOS[k].cat]) { vis[BLOCOS[k].cat] = 1; c.push(BLOCOS[k].cat); }
  return c;
}
function montarBlocos() {
  var cat = $('#catBloco').value, grade = $('#gradeBlocos');
  grade.textContent = '';
  for (var k in BLOCOS) {
    if (BLOCOS[k].cat !== cat) continue;
    var b = document.createElement('button');
    b.className = 'blk' + (k === blocoAtual && tool === 'bloco' ? ' ativa' : '');
    b.textContent = BLOCOS[k].nome; b.setAttribute('data-blk', k);
    b.addEventListener('click', function () { selBloco(this.getAttribute('data-blk')); });
    grade.appendChild(b);
  }
}
(function () {
  var s = $('#catBloco');
  categorias().forEach(function (c) {
    var op = document.createElement('option'); op.value = c; op.textContent = c; s.appendChild(op);
  });
  s.value = 'Mobiliário';
  s.addEventListener('change', montarBlocos);
  montarBlocos();
})();

/* ================================================================
   ORGANIZAR OBJETOS — detecta os ambientes fechados pelas paredes
   (preenchimento de grade) e reposiciona os blocos de mobiliário
   dentro do cômodo onde cada um está, sem sobrepor nada.
   ================================================================ */
function construirGrade() {
  var xs = [], ys = [];
  doc.paredes.forEach(function (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
  if (!xs.length) return null;
  var minX = Math.min.apply(null, xs) - 4, maxX = Math.max.apply(null, xs) + 4;
  var minY = Math.min.apply(null, ys) - 4, maxY = Math.max.apply(null, ys) + 4;
  var area = Math.max(1, (maxX - minX) * (maxY - minY));
  var res = Math.max(1, Math.ceil(Math.sqrt(area / 40000)));
  var cols = Math.max(1, Math.ceil((maxX - minX) / res));
  var rows = Math.max(1, Math.ceil((maxY - minY) / res));
  var wall = new Uint8Array(rows * cols);
  doc.paredes.forEach(function (w) {
    var L = pLen(w);
    var wx0 = Math.min(w.x1, w.x2) - w.t, wx1 = Math.max(w.x1, w.x2) + w.t;
    var wy0 = Math.min(w.y1, w.y2) - w.t, wy1 = Math.max(w.y1, w.y2) + w.t;
    var c0 = Math.max(0, Math.floor((wx0 - minX) / res)), c1 = Math.min(cols - 1, Math.ceil((wx1 - minX) / res));
    var r0 = Math.max(0, Math.floor((wy0 - minY) / res)), r1 = Math.min(rows - 1, Math.ceil((wy1 - minY) / res));
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      var px = minX + (c + 0.5) * res, py = minY + (r + 0.5) * res;
      var l = pLocal(w, px, py);
      if (l[0] >= -0.3 && l[0] <= L + 0.3 && Math.abs(l[1]) <= w.t / 2 + 0.3) wall[r * cols + c] = 1;
    }
  });
  return { minX: minX, minY: minY, res: res, cols: cols, rows: rows, wall: wall };
}

/* separa os ambientes: preenche a partir das bordas (fora do prédio),
   depois cada bolsão de células livres restante é um cômodo. */
function detectarSalas() {
  var g = construirGrade(); if (!g) return null;
  var N = g.rows * g.cols;
  var rotulo = new Int32Array(N).fill(-1);
  function idx(r, c) { return r * g.cols + c; }
  var fila = [];
  for (var c = 0; c < g.cols; c++) [0, g.rows - 1].forEach(function (r) {
    var i = idx(r, c); if (!g.wall[i] && rotulo[i] === -1) { rotulo[i] = 0; fila.push(i); }
  });
  for (var r = 0; r < g.rows; r++) [0, g.cols - 1].forEach(function (c) {
    var i = idx(r, c); if (!g.wall[i] && rotulo[i] === -1) { rotulo[i] = 0; fila.push(i); }
  });
  function espalha(fila) {
    while (fila.length) {
      var i = fila.pop(), r = (i / g.cols) | 0, c = i % g.cols;
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (v) {
        var vr = v[0], vc = v[1]; if (vr < 0 || vc < 0 || vr >= g.rows || vc >= g.cols) return;
        var j = idx(vr, vc);
        if (!g.wall[j] && rotulo[j] === -1) { rotulo[j] = rotulo[i]; fila.push(j); }
      });
    }
  }
  espalha(fila);
  var proximoId = 1, salas = [];
  for (var i = 0; i < N; i++) {
    if (g.wall[i] || rotulo[i] !== -1) continue;
    var id = proximoId++; rotulo[i] = id;
    var celulas = [i], f2 = [i];
    while (f2.length) {
      var cur = f2.pop(), r = (cur / g.cols) | 0, c = cur % g.cols;
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (v) {
        var vr = v[0], vc = v[1]; if (vr < 0 || vc < 0 || vr >= g.rows || vc >= g.cols) return;
        var j = idx(vr, vc);
        if (!g.wall[j] && rotulo[j] === -1) { rotulo[j] = id; celulas.push(j); f2.push(j); }
      });
    }
    salas.push({ id: id, celulas: celulas });
  }
  return { grade: g, rotulo: rotulo, salas: salas };
}

/* área de circulação na frente de cada porta — fica reservada, sem móveis */
function bloqueioPortas(g) {
  var bloq = {};
  doc.vaos.forEach(function (v) {
    if (!ehPorta(v.tipo)) return;
    var w = parede(v.parede); if (!w) return;
    var giro = VAOS[v.tipo] && VAOS[v.tipo].giro;
    var prof = giro ? v.w : Math.max(6, v.w * 0.6);
    var L = pLen(w);
    var a0 = Math.max(0, v.pos - 1), a1 = Math.min(L, v.pos + v.w + 1);
    var s = w.t / 2 + prof;
    var cantos = [pGlobal(w, a0, -s), pGlobal(w, a1, -s), pGlobal(w, a0, s), pGlobal(w, a1, s)];
    var xs = cantos.map(function (p) { return p[0]; }), ys = cantos.map(function (p) { return p[1]; });
    var c0 = Math.max(0, Math.floor((Math.min.apply(null, xs) - g.minX) / g.res));
    var c1 = Math.min(g.cols - 1, Math.ceil((Math.max.apply(null, xs) - g.minX) / g.res));
    var r0 = Math.max(0, Math.floor((Math.min.apply(null, ys) - g.minY) / g.res));
    var r1 = Math.min(g.rows - 1, Math.ceil((Math.max.apply(null, ys) - g.minY) / g.res));
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      var px = g.minX + (c + 0.5) * g.res, py = g.minY + (r + 0.5) * g.res;
      var l = pLocal(w, px, py);
      if (l[0] >= a0 - 0.3 && l[0] <= a1 + 0.3 && Math.abs(l[1]) <= s + 0.3) bloq[r + '_' + c] = true;
    }
  });
  return bloq;
}

var PAREDE_ORDEM = ['cima', 'direita', 'baixo', 'esquerda'];
function organizarObjetos() {
  var det = detectarSalas();
  if (!det || !det.salas.length) return -1;
  var g = det.grade;
  var bloq = bloqueioPortas(g);
  function celPonto(x, y) {
    var c = Math.floor((x - g.minX) / g.res), r = Math.floor((y - g.minY) / g.res);
    return (r >= 0 && r < g.rows && c >= 0 && c < g.cols) ? (r * g.cols + c) : -1;
  }
  var porSala = {};
  doc.itens.filter(function (it) { return it.tipo === 'bloco'; }).forEach(function (it) {
    var i = celPonto(it.x + it.w / 2, it.y + it.h / 2);
    var id = i >= 0 ? det.rotulo[i] : -1;
    if (id > 0) (porSala[id] = porSala[id] || []).push(it);
  });

  var moveu = 0;
  det.salas.forEach(function (sala) {
    var itens = porSala[sala.id]; if (!itens || !itens.length) return;
    var pertence = {};                        // membro fixo da sala (define o que é "parede")
    sala.celulas.forEach(function (i) { pertence[((i / g.cols) | 0) + '_' + (i % g.cols)] = true; });
    var livre = {};                           // disponível agora (encolhe conforme móveis entram)
    sala.celulas.forEach(function (i) {
      var key = ((i / g.cols) | 0) + '_' + (i % g.cols);
      if (!bloq[key]) livre[key] = true;
    });
    var rMin = 1e9, rMax = -1e9, cMin = 1e9, cMax = -1e9;
    sala.celulas.forEach(function (i) {
      var r = (i / g.cols) | 0, c = i % g.cols;
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (c < cMin) cMin = c; if (c > cMax) cMax = c;
    });
    function cabe(r0, c0, rc, cc) {
      for (var r = r0; r < r0 + rc; r++) for (var c = c0; c < c0 + cc; c++) if (!livre[r + '_' + c]) return false;
      return true;
    }
    function ocupa(r0, c0, rc, cc) {
      for (var r = r0; r < r0 + rc; r++) for (var c = c0; c < c0 + cc; c++) delete livre[r + '_' + c];
    }

    /* encostas: pra cada célula da sala, em quais lados bate parede
       (isso é fixo — não muda conforme os móveis vão entrando) */
    var encostas = { cima: [], baixo: [], esquerda: [], direita: [] };
    sala.celulas.forEach(function (i) {
      var r = (i / g.cols) | 0, c = i % g.cols, key = r + '_' + c;
      if (!livre[key]) return;                // já bloqueada por porta — não serve de encosto
      if (!pertence[(r - 1) + '_' + c]) encostas.cima.push([r, c]);
      if (!pertence[(r + 1) + '_' + c]) encostas.baixo.push([r, c]);
      if (!pertence[r + '_' + (c - 1)]) encostas.esquerda.push([r, c]);
      if (!pertence[r + '_' + (c + 1)]) encostas.direita.push([r, c]);
    });
    encostas.cima.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    encostas.baixo.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    encostas.esquerda.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    encostas.direita.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cursor = { cima: 0, baixo: 0, esquerda: 0, direita: 0 };

    function caixaPara(dir, r, c, hc, wc) {
      if (dir === 'baixo') return [r - hc + 1, c];
      if (dir === 'direita') return [r, c - wc + 1];
      return [r, c];                          // cima e esquerda: a âncora já é o canto sup-esq
    }

    itens.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    itens.forEach(function (it, k) {
      var rad = (it.rot || 0) * Math.PI / 180;
      var Wf = Math.abs(it.w * Math.cos(rad)) + Math.abs(it.h * Math.sin(rad));
      var Hf = Math.abs(it.w * Math.sin(rad)) + Math.abs(it.h * Math.cos(rad));
      var folga = 1.6;
      var wc = Math.max(1, Math.ceil((Wf + folga) / g.res));
      var hc = Math.max(1, Math.ceil((Hf + folga) / g.res));
      var achou = null;

      for (var t = 0; t < 4 && !achou; t++) {
        var dir = PAREDE_ORDEM[(k + t) % 4], lista = encostas[dir];
        for (var idx = cursor[dir]; idx < lista.length; idx++) {
          var pos = caixaPara(dir, lista[idx][0], lista[idx][1], hc, wc);
          if (cabe(pos[0], pos[1], hc, wc)) { achou = pos; cursor[dir] = idx + 1; break; }
        }
      }
      if (!achou) {   // nenhuma parede teve vaga — tenta em qualquer lugar livre do cômodo
        for (var r = rMin; r <= rMax - hc + 1 && !achou; r++)
          for (var c = cMin; c <= cMax - wc + 1; c++) if (cabe(r, c, hc, wc)) { achou = [r, c]; break; }
      }
      if (!achou) {
        // grande demais pro cômodo — prende ao menos ao retângulo do
        // próprio cômodo, pra nunca acabar posicionado dentro do vizinho
        var roomXmin = g.minX + cMin * g.res, roomXmax = g.minX + (cMax + 1) * g.res;
        var roomYmin = g.minY + rMin * g.res, roomYmax = g.minY + (rMax + 1) * g.res;
        var cxAlvo = clamp(it.x + it.w / 2, roomXmin + it.w / 2, Math.max(roomXmin + it.w / 2, roomXmax - it.w / 2));
        var cyAlvo = clamp(it.y + it.h / 2, roomYmin + it.h / 2, Math.max(roomYmin + it.h / 2, roomYmax - it.h / 2));
        it.x = Math.round((cxAlvo - it.w / 2) * 10) / 10;
        it.y = Math.round((cyAlvo - it.h / 2) * 10) / 10;
        var r0 = Math.round((cyAlvo - Hf / 2 - g.minY) / g.res);
        var c0 = Math.round((cxAlvo - Wf / 2 - g.minX) / g.res);
        ocupa(r0, c0, hc, wc);
        moveu++;
        return;
      }
      ocupa(achou[0], achou[1], hc, wc);
      var cx = g.minX + achou[1] * g.res + (wc * g.res) / 2;
      var cy = g.minY + achou[0] * g.res + (hc * g.res) / 2;
      it.x = Math.round((cx - it.w / 2) * 10) / 10;
      it.y = Math.round((cy - it.h / 2) * 10) / 10;
      moveu++;
    });
  });
  return moveu;
}

$('#btOrganizar').addEventListener('click', function () {
  marcar();
  var n = organizarObjetos();
  if (n <= 0) {
    pilha.pop();
    alert(n === -1
      ? 'Não encontrei nenhum ambiente fechado por paredes.'
      : 'Nada mudou de lugar — ou não há blocos dentro de um cômodo fechado por paredes, ou eles já estão no melhor arranjo que dá pra fazer.');
    return;
  }
  sel = null; commit();
});

/* ------------------------------------------------------------ vista ------- */
function limites() {
  var xs = [], ys = [];
  doc.paredes.forEach(function (w) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); });
  doc.cotas.forEach(function (c) {
    var dx = c.x2 - c.x1, dy = c.y2 - c.y1, L = Math.hypot(dx, dy) || 1;
    var nx = -dy / L, ny = dx / L, e = c.off + (c.off < 0 ? -8 : 8);
    xs.push(c.x1, c.x2, c.x1 + nx * e, c.x2 + nx * e);
    ys.push(c.y1, c.y2, c.y1 + ny * e, c.y2 + ny * e);
  });
  doc.itens.forEach(function (i) { xs.push(i.x, i.x + (i.w || 0)); ys.push(i.y, i.y + (i.h || 0)); });
  doc.textos.forEach(function (t) { xs.push(t.x); ys.push(t.y); });
  if (!xs.length) { xs = [0, 100]; ys = [0, 100]; }
  return { x0: Math.min.apply(null, xs) - 6, y0: Math.min.apply(null, ys) - 6,
           x1: Math.max.apply(null, xs) + 6, y1: Math.max.apply(null, ys) + 6 };
}
function enquadrar() {
  var b = limites(), r = svg.getBoundingClientRect();
  if (r.width < 20 || r.height < 20) { requestAnimationFrame(enquadrar); return; }
  var k = Math.min(r.width / (b.x1 - b.x0), r.height / (b.y1 - b.y0)) * 0.92;
  view.k = clamp(k, 0.5, 60);
  view.x = (r.width - (b.x1 - b.x0) * view.k) / 2 - b.x0 * view.k;
  view.y = (r.height - (b.y1 - b.y0) * view.k) / 2 - b.y0 * view.k;
  render();
}

/* --------------------------------------------------------- exportações ---- */
function svgLimpo() {
  var b = limites();
  var s = svg.cloneNode(true);
  s.setAttribute('xmlns', NS);
  s.setAttribute('viewBox', b.x0 + ' ' + b.y0 + ' ' + (b.x1 - b.x0) + ' ' + (b.y1 - b.y0));
  s.setAttribute('width', Math.round((b.x1 - b.x0) * 12));
  s.setAttribute('height', Math.round((b.y1 - b.y0) * 12));
  var w = s.querySelector('#world'); w.removeAttribute('transform');
  ['#gGrade', '#gSel', '#gPreview'].forEach(function (q) { var e = s.querySelector(q); if (e) e.textContent = ''; });
  w.insertBefore(el('rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, fill: '#fff' }), w.firstChild);
  return { txt: new XMLSerializer().serializeToString(s), b: b };
}
function baixar(nome, blob) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$('#btSvg').addEventListener('click', function () {
  baixar('planta.svg', new Blob([svgLimpo().txt], { type: 'image/svg+xml' }));
});
$('#btPng').addEventListener('click', function () {
  var r = svgLimpo(), esc = 3, img = new Image();
  img.onload = function () {
    var c = document.createElement('canvas');
    c.width = Math.round((r.b.x1 - r.b.x0) * 12 * esc);
    c.height = Math.round((r.b.y1 - r.b.y0) * 12 * esc);
    var cx = c.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(function (b) { baixar('planta.png', b); });
  };
  img.onerror = function () { alert('Não foi possível gerar o PNG. Use "SVG", ou "Imprimir → salvar em PDF".'); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.txt);
});
$('#btSalvar').addEventListener('click', function () {
  baixar('planta.json', new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
});
$('#btAbrir').addEventListener('click', function () { $('#arqJson').click(); });
$('#arqJson').addEventListener('change', function (ev) {
  var f = ev.target.files[0]; if (!f) return;
  var fr = new FileReader();
  fr.onload = function () {
    try {
      var d = JSON.parse(fr.result); if (!d.paredes) throw 0;
      marcar(); doc = migrar(d); sel = null; commit(); enquadrar();
    } catch (e) { alert('Arquivo inválido.'); }
  };
  fr.readAsText(f); ev.target.value = '';
});
$('#btImprimir').addEventListener('click', function () { window.print(); });
$('#btOriginal').addEventListener('click', function () {
  if (!confirm('Voltar para a planta original, sem móveis (a planta bem do início)? As alterações atuais serão perdidas.')) return;
  marcar(); doc = plantaOriginal(); sel = null; commit(); enquadrar();
});
$('#btPadrao').addEventListener('click', function () {
  if (!confirm('Voltar para o último layout publicado? As alterações atuais neste navegador serão perdidas.')) return;
  marcar(); doc = plantaPadrao(); sel = null; commit(); enquadrar();
});

/* ------------------------------------------------------------ controles --- */
$('#btUndo').addEventListener('click', desfazer);
$('#btRedo').addEventListener('click', refazer);
$('#btZoomFit').addEventListener('click', enquadrar);
$('#ckGrade').addEventListener('change', function (e) { mostrarGrade = e.target.checked; render(); });
$('#ckSnap').addEventListener('change', function (e) { imã = e.target.checked; });
$('#ckCotas').addEventListener('change', function (e) { mostrarCotas = e.target.checked; render(); });
window.addEventListener('resize', render);

/* ------------------------------------------------------------- início ----- */
carregarLocal();
setTool('selecionar');
render();
enquadrar();
painel();

})();
