export const metadata = { title: "Bishi Local", description: "Bishi with strangers, made safe." };

const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap');
:root{--bg:#07070c;--glass:rgba(255,255,255,.045);--line:rgba(255,255,255,.09);--fg:#f3f1ec;--mut:#8d90a0;
--acc:#ffc21a;--pink:#ff3d8b;--cyan:#22e4ff;--ok:#3dffa8;--bad:#ff4d5e;--vio:#8b5cff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 'Space Grotesk',system-ui,sans-serif;overflow-x:hidden}
body:before{content:"";position:fixed;inset:-20%;z-index:-2;background:
 radial-gradient(40% 35% at 15% 10%,rgba(255,61,139,.22),transparent 60%),
 radial-gradient(35% 30% at 85% 20%,rgba(34,228,255,.18),transparent 60%),
 radial-gradient(45% 40% at 50% 100%,rgba(139,92,255,.22),transparent 60%);
 animation:drift 18s ease-in-out infinite alternate;filter:blur(10px)}
body:after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
 background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
 background-size:44px 44px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 80%)}
@keyframes drift{to{transform:translate3d(-4%,3%,0) rotate(6deg)}}
main{max-width:1100px;margin:0 auto;padding:20px 16px 120px}
h1{font-size:clamp(34px,6vw,64px);line-height:1;margin:0;letter-spacing:-.03em;font-weight:700}
h2{font-size:13px;margin:0 0 14px;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);font-weight:500}
.grad{background:linear-gradient(90deg,var(--acc),var(--pink) 45%,var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent;background-size:200% 100%;animation:shine 6s linear infinite}
@keyframes shine{to{background-position:200% 0}}
.mut{color:var(--mut)}.ok{color:var(--ok)}.bad{color:var(--bad)}.acc{color:var(--acc)}.cy{color:var(--cyan)}.pk{color:var(--pink)}
.mono{font-family:'JetBrains Mono',monospace}
.card{background:var(--glass);border:1px solid var(--line);border-radius:22px;padding:22px;margin-top:20px;backdrop-filter:blur(14px);
 box-shadow:0 0 0 1px rgba(255,255,255,.02) inset,0 30px 80px -40px rgba(0,0,0,.8);position:relative;overflow:hidden}
.card.glow:before{content:"";position:absolute;inset:-1px;border-radius:22px;padding:1px;pointer-events:none;
 background:conic-gradient(from var(--a,0deg),transparent 0 70%,var(--pink),var(--acc),var(--cyan),transparent);
 -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:spin 6s linear infinite}
@property --a{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes spin{to{--a:360deg}}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.btn,button{position:relative;background:linear-gradient(135deg,var(--acc),#ff8a1a);color:#120c00;border:0;border-radius:12px;padding:10px 18px;
 font:600 14px 'Space Grotesk';cursor:pointer;transition:transform .15s,box-shadow .2s;box-shadow:0 8px 30px -10px rgba(255,194,26,.7)}
button:hover{transform:translateY(-2px);box-shadow:0 14px 40px -10px rgba(255,61,139,.8)}
button:active{transform:translateY(0) scale(.98)}
button.ghost{background:rgba(255,255,255,.05);color:var(--fg);border:1px solid var(--line);box-shadow:none}
button.hot{background:linear-gradient(135deg,var(--pink),var(--vio));color:#fff;box-shadow:0 8px 30px -10px rgba(255,61,139,.9)}
button:disabled{opacity:.35;cursor:not-allowed;transform:none}
input,select{background:rgba(0,0,0,.45);color:var(--fg);border:1px solid var(--line);border-radius:12px;padding:9px 12px;font:inherit;outline:none;transition:border .2s,box-shadow .2s}
input:focus,select:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(34,228,255,.15)}
label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--mut);letter-spacing:.04em}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;border:1px solid var(--line);background:rgba(255,255,255,.04)}
.pill.live:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok);animation:blink 1.2s infinite}
@keyframes blink{50%{opacity:.25}}

/* train hero */
.track{position:relative;height:74px;margin:18px 0 6px;overflow:hidden;border-bottom:2px dashed rgba(255,255,255,.12)}
.train{position:absolute;bottom:4px;left:-420px;animation:ride 9s cubic-bezier(.6,.05,.4,.95) infinite;filter:drop-shadow(0 0 18px rgba(255,194,26,.45))}
@keyframes ride{0%{left:-420px}45%,55%{left:calc(50% - 200px)}100%{left:110%}}

/* split-flap board */
.board{border-radius:16px;overflow:hidden;border:1px solid #1c1c24;background:#050507}
.brow{display:grid;grid-template-columns:2.3fr 1fr .8fr 1.6fr 1.6fr;gap:8px;padding:12px 16px;border-bottom:1px solid #15151c;align-items:center;cursor:pointer;transition:background .2s}
.brow:hover{background:rgba(255,194,26,.06)}
.brow.head{cursor:default;background:#0b0b10;color:#6d6f7c;font-size:11px;letter-spacing:.16em;text-transform:uppercase}
.flap{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--acc);letter-spacing:.06em;text-shadow:0 0 12px rgba(255,194,26,.55)}
.flap span{display:inline-block;background:#111117;border-radius:4px;padding:0 3px;margin-right:2px;animation:flip .5s both;transform-origin:50% 50%}
@keyframes flip{from{transform:rotateX(90deg);opacity:0}to{transform:none;opacity:1}}
.bar{height:6px;border-radius:9px;background:#15151c;overflow:hidden}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--cyan),var(--pink));border-radius:9px;transition:width .6s}

/* room visual */
.stage{display:grid;grid-template-columns:minmax(300px,440px) 1fr;gap:22px;align-items:center}
@media(max-width:820px){.stage{grid-template-columns:1fr}.brow{grid-template-columns:1.6fr 1fr 1fr}.brow>:nth-child(4),.brow>:nth-child(5){display:none}}
svg text{font-family:'JetBrains Mono',monospace}
.orbit{animation:rot 14s linear infinite;transform-origin:50% 50%}
@keyframes rot{to{transform:rotate(360deg)}}
.pulse{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
.wave{animation:wave 3s linear infinite}
@keyframes wave{to{transform:translateX(-120px)}}
.stack{display:flex;height:34px;border-radius:12px;overflow:hidden;border:1px solid var(--line)}
.stack>div{display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#08080c;transition:flex-grow .4s;white-space:nowrap;overflow:hidden}
input[type=range]{-webkit-appearance:none;width:100%;height:8px;border-radius:9px;padding:0;background:linear-gradient(90deg,var(--ok),var(--acc),var(--pink))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 0 0 6px rgba(255,61,139,.35),0 0 24px var(--pink);cursor:pointer}
.seg{display:flex;gap:6px;flex-wrap:wrap}
.seg button{background:rgba(255,255,255,.04);color:var(--fg);border:1px solid var(--line);box-shadow:none;padding:10px 14px}
.seg button.on{background:linear-gradient(135deg,rgba(255,194,26,.2),rgba(255,61,139,.2));border-color:var(--acc)}
.gauge{width:160px}
.ticker{font-family:'JetBrains Mono',monospace;font-size:12px;max-height:200px;overflow:auto}
.ticker div{padding:6px 0;border-bottom:1px dashed rgba(255,255,255,.06);animation:in .4s both}
@keyframes in{from{opacity:0;transform:translateX(-8px)}}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:50;padding:12px 18px;border-radius:14px;background:rgba(10,10,16,.85);
 border:1px solid var(--line);backdrop-filter:blur(10px);font-weight:600;animation:in .3s both;max-width:92vw}
.confetti{position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden}
.confetti i{position:absolute;top:-12px;width:8px;height:14px;border-radius:2px;animation:fall 2.4s ease-in forwards}
@keyframes fall{to{transform:translateY(105vh) rotate(720deg);opacity:.2}}
.steps{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding-top:6px}
@media(max-width:820px){.steps{grid-template-columns:1fr 1fr}}
.step{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:16px;border:1px solid var(--line);background:rgba(0,0,0,.3);transition:all .4s;font-size:13px;z-index:1}
.step .dot{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:20px;background:#12121a;border:1px solid var(--line);transition:all .4s}
.step.on{border-color:var(--acc);transform:translateY(-4px);box-shadow:0 18px 40px -20px rgba(255,194,26,.6)}
.step.on .dot{background:linear-gradient(135deg,var(--acc),var(--pink));box-shadow:0 0 24px rgba(255,61,139,.7);transform:scale(1.1)}
.rail{position:absolute;left:30px;right:30px;top:30px;height:2px;background:rgba(255,255,255,.08);z-index:0}
.rail i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--pink));transition:width .6s;box-shadow:0 0 10px var(--pink)}
.tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:14px}
.table{padding:16px;border-radius:20px;border:1px solid var(--line);background:rgba(0,0,0,.35);cursor:pointer;transition:transform .25s,border-color .25s,box-shadow .25s}
.table:hover{transform:translateY(-5px);border-color:rgba(255,61,139,.5);box-shadow:0 24px 60px -30px rgba(255,61,139,.8)}
.table.sel{border-color:var(--acc)}
.cap{margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border-left:3px solid var(--acc);font-size:13px;line-height:1.45}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{padding:12px;border-radius:14px;background:rgba(0,0,0,.35);border:1px solid var(--line)}
.stat b{display:block;font-size:20px;font-family:'JetBrains Mono',monospace}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <style>{css}</style>
        {children}
      </body>
    </html>
  );
}
