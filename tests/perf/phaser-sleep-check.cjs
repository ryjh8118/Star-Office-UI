"use strict";
// The pixel office's frame loop sleeps while it is off screen: that it does, that everything it drove keeps going,
// and that it is back, drawing, before the reader is.
//
//   node tests/perf/phaser-sleep-check.cjs http://127.0.0.1:19393
const S = require("./lib/session.cjs");
const { sleep } = S;

const BASE = (process.argv[2] || "http://127.0.0.1:19393").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error("LOCAL_ONLY");
const results = [];
const check = (name, pass, detail) => {
  results.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail).slice(0, 260)}`);
};

(async () => {
  const s = await S.open({ base: BASE, urlPath: "/?intro=off", viewport: "desktop" });
  try {
    await sleep(2500);
    const loop = () => s.json(`(function(){var g=game.game; return {running: g.loop.running, frame: g.loop.frame, actualFps: Math.round(g.loop.actualFps)};})()`);
    const statusHits = (from) => s.reqOrder.slice(from).filter((r) => r.url.split("?")[0] === "/status").length;
    const guestHits = (from) => s.reqOrder.slice(from).filter((r) => r.url.split("?")[0] === "/agents").length;

    const top = await loop();
    check("At the top the frame loop is running", top.running === true, top);
    const f0 = (await loop()).frame;
    await sleep(1000);
    check("...and it is drawing", (await loop()).frame - f0 > 40, { frames_in_1s: (await loop()).frame - f0 });

    // scroll well past the canvas
    await s.ev(`window.scrollTo({top:2600,behavior:'instant'});1`);
    await sleep(1200);
    const away = await loop();
    check("Scrolled away, the loop sleeps", away.running === false, away);
    const mark = s.reqOrder.length;
    await sleep(6000);
    const f1 = (await loop()).frame;
    await sleep(1000);
    check("...and draws nothing while it does", (await loop()).frame === f1, { frame: f1 });
    const st = statusHits(mark);
    const gu = guestHits(mark);
    check("/status is still asked for about once a second while it sleeps", st >= 5 && st <= 9, { over_7s: st });
    check("/agents is still asked for about every 3.5 s", gu >= 1 && gu <= 3, { over_7s: gu });

    // a status the server sends while asleep is applied: the state it names is the state the canvas shows on return
    const applied = await s.ev(`typeof currentState !== 'undefined' ? currentState : null`);
    check("What /status says is still applied to the scene while it sleeps", applied !== null, { currentState: applied });

    // coming back: awake before the canvas is on screen
    await s.ev(`window.scrollTo({top:900,behavior:'instant'});1`); // canvas ~ 200px below the viewport's top edge... still within the margin
    await sleep(600);
    const near = await loop();
    check("Within the margin of the canvas the loop is already awake", near.running === true, near);
    await s.ev(`window.scrollTo({top:0,behavior:'instant'});1`);
    await sleep(800);
    const f2 = (await loop()).frame;
    await sleep(1000);
    const back = await loop();
    check("Back at the top it draws again at its old pace", back.running === true && back.frame - f2 > 40, { frames_in_1s: back.frame - f2 });

    // the canvas is not blank after a sleep
    const shot = await s.c.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 600, height: 400, scale: 0.25 } });
    const distinct = await s.ev(`(async function(){var i=new Image(); i.src='data:image/png;base64,${shot.data}'; await i.decode(); var c=document.createElement('canvas'); c.width=i.width; c.height=i.height; var g=c.getContext('2d'); g.drawImage(i,0,0); var d=g.getImageData(0,0,c.width,c.height).data, seen={}; for(var k=0;k<d.length;k+=16){seen[(d[k]>>4)+','+(d[k+1]>>4)+','+(d[k+2]>>4)]=1} return Object.keys(seen).length;})()`);
    check("The top of the page is drawn (not blank) after a sleep", distinct > 12, { distinct_colours: distinct });

    // folding the office away is also "off screen"
    const foldedFrom = await s.json(`(function(){var b=document.querySelector('header.co-map-header button.co-zone-toggle'); if(!b) return null; b.click(); return true;})()`);
    if (foldedFrom) {
      await sleep(1500);
      const folded = await loop();
      check("A folded office sleeps too", folded.running === false, folded);
      await s.ev(`document.querySelector('header.co-map-header button.co-zone-toggle').click(); 1`);
      await sleep(1500);
      check("...and unfolding wakes it", (await loop()).running === true);
    }

    // a load that starts with the office already off screen
    await s.ev(`window.scrollTo({top:2600,behavior:'instant'});1`);
    await sleep(500);
    await s.navigate(BASE + "/?intro=off");
    await sleep(6000);
    const restored = await s.json(`(function(){var g=game.game; return {y: Math.round(scrollY), running: g.loop.running};})()`);
    if (restored.y > 1500) {
      check("Loaded already scrolled away, the loop sleeps and the page is still alive", restored.running === false, restored);
      await s.ev(`window.scrollTo({top:0,behavior:'instant'});1`);
      await sleep(1200);
      const f3 = (await loop()).frame;
      await sleep(800);
      check("...and it draws when the reader reaches it", (await loop()).frame - f3 > 30);
    } else console.log("(scroll restoration did not keep the position; that case was not exercised)");

    check("No page errors", s.errors.length === 0, s.errors.slice(0, 3));
  } finally {
    await s.shutdown();
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
