/* eslint-disable */
// Dusty, the ScopeCrete lander, as an SVG string — ported as-is from the
// Claude Design landing page package (2026-10-04). DustySVG(mode, {size, id})
// returns a self-contained, CSS-animated SVG. Modes: idle, listen, sort, scan,
// land, celebrate, alert, sleep, static. Honours prefers-reduced-motion.
// @ts-nocheck

export type DustyMode = "idle" | "listen" | "sort" | "scan" | "land" | "celebrate" | "alert" | "sleep" | "static";

export const DustySVG: (mode: DustyMode, opts?: { size?: number; id?: string; title?: string | false }) => string = (function () {
  var O = '#F2610C', S = '#5980A6', G = '#1FA971', INK = '#34383D', PAPER = '#FAF8F3', AMBER = '#F2B40C';
  var KF = '@keyframes dBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
    '@keyframes dBlink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}' +
    '@keyframes dLook{0%,100%{transform:translateX(-2.5px)}50%{transform:translateX(2.5px)}}' +
    '@keyframes dPeek{0%,40%,100%{transform:translateX(0)}55%,85%{transform:translateX(2.5px)}}' +
    '@keyframes dDash{to{stroke-dashoffset:-104}}' +
    '@keyframes dWob{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}' +
    '@keyframes dFlash{0%{opacity:1}50%{opacity:.25}}' +
    '@keyframes dScanY{from{transform:translateY(0)}to{transform:translateY(15px)}}' +
    '@keyframes dBeam{from{opacity:.08}to{opacity:.3}}' +
    '@keyframes dRipple{0%{opacity:.9;transform:rotate(-32deg) scale(.4)}100%{opacity:0;transform:rotate(-32deg) scale(2.4)}}' +
    '@keyframes dConfetti{0%{opacity:0;transform:translateY(10px) rotate(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-18px) rotate(180deg)}}' +
    '@keyframes dZ{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(10px,-22px)}}' +
    '@keyframes dLand{0%{transform:translateY(-60px);opacity:0}10%{opacity:1}42%{transform:translateY(0)}50%{transform:translateY(3px) scaleY(.96)}58%,100%{transform:translateY(0)}}' +
    '@keyframes dFlame{0%,38%{opacity:.9;transform:scaleY(1)}20%{transform:scaleY(.7)}44%,100%{opacity:0;transform:scaleY(.2)}}' +
    '@keyframes dHop{0%,100%{transform:translateY(0)}30%{transform:translateY(-12px)}55%{transform:translateY(0) scaleY(.95)}65%{transform:translateY(0)}}' +
    '@keyframes dShake{0%,60%,100%{transform:translateX(0)}10%,30%,50%{transform:translateX(-2px)}20%,40%{transform:translateX(2px)}}' +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';
  function st(a, extra) { return ' style="transform-box:fill-box;transform-origin:' + ((extra && extra.origin) || 'center') + ';animation:' + a + (extra && extra.delay ? ';animation-delay:' + extra.delay : '') + (extra && extra.op != null ? ';opacity:' + extra.op : '') + '"'; }
  function DustySVG(mode, opts) {
    // A stable id (not a counter or Math.random) so the server's markup and the
    // browser's match on hydration.
    opts = opts || {};
    mode = mode || 'idle';
    var size = opts.size || 120, small = size < 48, sw = small ? 5 : 2.6, live = mode !== 'static';
    var id = 'dusty-' + (opts.id || (mode + size)), clip = id + 'c';
    function eye(x, y, s) {
      if (mode === 'scan') return '';
      if (mode === 'sleep') return '<rect x="' + x + '" y="' + (y + s * .45) + '" width="' + s + '" height="2" fill="' + G + '" opacity=".55"/>';
      var halo = '<rect x="' + (x - 2.5) + '" y="' + (y - 2.5) + '" width="' + (s + 5) + '" height="' + (s + 5) + '" fill="' + (mode === 'alert' ? AMBER : G) + '" opacity=".18"' + (mode === 'alert' ? st('dFlash .8s steps(1) infinite') : '') + '/>';
      if (mode === 'celebrate') return halo + '<rect x="' + x + '" y="' + (y + s * .35) + '" width="' + s + '" height="3" fill="' + G + '"/>';
      var c = mode === 'alert' ? AMBER : G;
      var core = '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="' + c + '"' +
        (mode === 'alert' ? st('dFlash .8s steps(1) infinite') : live ? st('dBlink 4.2s ease-in-out infinite') : '') + '/>';
      var look = mode === 'sort' ? st('dLook .7s ease-in-out infinite') : mode === 'listen' ? st('dPeek 3s ease-in-out infinite') : '';
      return '<g' + look + '>' + halo + core + '</g>';
    }
    var dash = mode === 'sort' ? ' stroke-dasharray="20 6" style="animation:dDash .6s linear infinite"' : mode === 'sleep' ? ' stroke-dasharray="4 5"' : '';
    function ring(front) {
      return '<g transform="rotate(-6 60 74)"><ellipse cx="60" cy="74" rx="36" ry="7" fill="none" stroke="' + O + '" stroke-width="' + (sw + .4) + '"' +
        (front ? ' clip-path="url(#' + clip + ')"' : '') + (mode === 'sleep' ? ' opacity=".5"' : '') + dash + '/></g>';
    }
    var defs = '<defs><pattern id="' + id + '" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><line x1="0" y1="0" x2="0" y2="4" stroke="' + INK + '" stroke-width="' + (small ? 2 : 1.3) + '"/></pattern>' +
      '<clipPath id="' + clip + '" clipPathUnits="userSpaceOnUse"><rect x="-40" y="74" width="200" height="80"/></clipPath></defs>';
    var dish = '<g' + (mode === 'listen' ? st('dWob 2.4s ease-in-out infinite', { origin: 'left bottom' }) : '') + '>' +
      '<line x1="72" y1="38" x2="82" y2="22" stroke="' + INK + '" stroke-width="' + sw + '"/>' +
      '<ellipse cx="84" cy="19" rx="8" ry="3.5" fill="' + PAPER + '" stroke="' + S + '" stroke-width="' + sw + '" transform="rotate(-32 84 19)"/>' +
      (mode === 'alert' ? '<rect x="88" y="12" width="6" height="6" fill="' + O + '"' + st('dFlash .8s steps(1) infinite') + '/>' : '') + '</g>';
    var lw = small ? sw + .4 : 3;
    var legs = '<line x1="44" y1="84" x2="30" y2="106" stroke="' + S + '" stroke-width="' + lw + '"/><line x1="76" y1="84" x2="90" y2="106" stroke="' + S + '" stroke-width="' + lw + '"/>' +
      '<rect x="25" y="104" width="11" height="4" fill="' + S + '"/><rect x="84" y="104" width="11" height="4" fill="' + S + '"/>';
    var block = '<rect x="36" y="38" width="48" height="48" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="' + sw + '"/>' +
      '<rect x="37.5" y="39.5" width="45" height="45" fill="url(#' + id + ')"' + (mode === 'sleep' ? ' opacity=".6"' : '') + '/>' +
      '<rect x="42" y="45" width="36" height="19" fill="' + (mode === 'scan' ? '#E7F5EE' : PAPER) + '" stroke="' + INK + '" stroke-width="' + (small ? 3 : 1.6) + '"/>' +
      eye(48, 50, 8) + eye(64, 50, 8) +
      (mode === 'scan' ? '<rect x="43" y="46" width="34" height="2.5" fill="' + G + '" style="animation:dScanY 1.4s ease-in-out infinite alternate"/>' : '');
    var fx = '';
    if (mode === 'listen') [0, .7, 1.4].forEach(function (d) { fx += '<rect x="78" y="7" width="14" height="14" fill="none" stroke="' + G + '" stroke-width="1.6"' + st('dRipple 2.1s ease-out infinite', { delay: d + 's', op: 0 }) + '/>'; });
    if (mode === 'scan') fx += '<polygon points="50,108 70,108 96,118 24,118" fill="' + G + '" opacity=".2"' + st('dBeam 1.4s ease-in-out infinite alternate') + '/><rect x="22" y="117" width="76" height="1.6" fill="' + G + '" opacity=".7"/>';
    if (mode === 'sort') [O, S, G].forEach(function (c, i) { fx += '<rect x="-3" y="-3" width="6" height="6" fill="' + c + '"><animateMotion dur="1.8s" repeatCount="indefinite" begin="' + (i * -.6) + 's" path="M24,74 a36,7 -6 1,0 72,0 a36,7 -6 1,0 -72,0"/></rect>'; });
    if (mode === 'celebrate') [[22, 40, O], [96, 34, G], [30, 20, S], [92, 60, O], [16, 66, G], [104, 18, S]].forEach(function (p, i) { fx += '<rect x="' + p[0] + '" y="' + p[1] + '" width="5" height="5" fill="' + p[2] + '"' + st('dConfetti 1.6s ease-out infinite', { delay: (i * .18) + 's', op: 0 }) + '/>'; });
    if (mode === 'sleep') [0, 1.2].forEach(function (d) { fx += '<text x="92" y="36" fill="' + S + '" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="700" font-size="14"' + st('dZ 2.4s ease-out infinite', { delay: d + 's', op: 0 }) + '>z</text>'; });
    var flame = mode === 'land' ? '<polygon points="50,86 70,86 60,104" fill="' + O + '" opacity=".85"' + st('dFlame 2.8s linear infinite', { origin: 'top' }) + '/>' : '';
    var motion = {
      idle: 'dBob 3s ease-in-out infinite', listen: 'dBob 3s ease-in-out infinite', scan: 'dBob 2.2s ease-in-out infinite',
      land: 'dLand 2.8s cubic-bezier(.3,.6,.4,1) infinite', sort: 'dBob 1s ease-in-out infinite',
      celebrate: 'dHop 1.6s cubic-bezier(.3,.7,.4,1) infinite', sleep: 'dBob 5s ease-in-out infinite', alert: 'dShake .8s ease-in-out infinite'
    }[mode];
    var title = opts.title === false ? '' : '<title>' + (opts.title || 'Dusty') + '</title>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" style="display:block;overflow:visible" role="img">' + title +
      (live ? '<style>' + KF + '</style>' : '') + defs +
      '<g' + (mode === 'sleep' ? ' transform="rotate(-4 60 108)"' : '') + '>' +
      '<g' + (motion ? st(motion) : '') + '>' + flame + legs + dish + ring(false) + block + ring(true) + '</g>' + fx + '</g></svg>';
  }
  return DustySVG;
})();
