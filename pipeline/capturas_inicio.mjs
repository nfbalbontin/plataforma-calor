// Pantallazos del inicio: cada vista de la plataforma, en modo oscuro y claro.
// Necesita el sitio corriendo en el puerto 3300 y Google Chrome (macOS).
// Uso: node --experimental-websocket pipeline/capturas_inicio.mjs
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITIO = process.env.SITIO ?? "http://localhost:3300";
const SALIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "inicio");
mkdirSync(SALIDA, { recursive: true });
const ir = (sel, extra = "") => `localStorage.setItem('tutorial-oculto','1'); ${extra} const el=document.querySelector('${sel}'); if (el) { el.scrollIntoView({block:'start'}); window.scrollBy(0,-72); } 1`;
const VISTAS = [
  ["historia-chile", "historia", ir("[data-tour=filtros]")],
  ["historia-serie", "historia/region/13", ir("[data-tour=serie]", "setTimeout(()=>document.querySelectorAll('[data-tour=serie] svg rect[fill=transparent]')[28]?.dispatchEvent(new MouseEvent('click',{bubbles:true})),300);")],
  ["historia-donde", "historia/region/13", ir("[data-tour=donde]")],
  ["historia-quienes", "historia", ir("[data-tour=quienes]", "setTimeout(()=>[...document.querySelectorAll('[data-tour=quienes] .segmento button')].find(b=>b.textContent==='Sexo y edad')?.click(),300);")],
  ["historia-hospital", "historia/hospital/109100", ir("[data-tour=ruta]")],
  ["riesgo-chile", "riesgo", ir("body")],
  ["riesgo-region", "riesgo?region=05&dia=12", ir("body")],
  ["riesgo-manzanas", "riesgo?comuna=13110&dia=12", ir("body")],
  ["riesgo-simular", "riesgo?simular=34", ir("body")],
  ["riesgo-aura", "riesgo?comuna=13110&dia=12&aura=1", ir("body", "setTimeout(()=>{const l=document.querySelector('.lateral'); const a=document.querySelector('[data-tour=aura-efecto]'); if(l&&a) l.scrollTop=a.offsetTop-60;},2500);")],
];
const perfil = mkdtempSync(path.join(tmpdir(), "capturas-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${perfil}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const base = "http://127.0.0.1:9334", dormir = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(base + "/json/version"); break; } catch { await dormir(250); } }
for (const [nombre, ruta, js] of VISTAS) {
  for (const [tema, valor] of [["oscuro", "dark"], ["claro", "light"]]) {
    const pest = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(pest.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const espera = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && espera.has(d.id)) { espera.get(d.id)(d.result); espera.delete(d.id); } };
    const cmd = (method, params = {}) => new Promise((r) => { const n = ++id; espera.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    await cmd("Emulation.setDeviceMetricsOverride", { width: 1360, height: 850, deviceScaleFactor: 1, mobile: false });
    await cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: valor }] });
    await cmd("Page.enable");
    await cmd("Page.navigate", { url: `${SITIO}/${ruta}` });
    await dormir(4000);
    await cmd("Runtime.evaluate", { expression: "localStorage.setItem('tutorial-oculto','1'); localStorage.removeItem('tema'); location.reload(); 1" });
    await dormir(9000);
    await cmd("Runtime.evaluate", { expression: js });
    await dormir(3500);
    const r = await cmd("Page.captureScreenshot", { format: "jpeg", quality: 78 });
    const archivo = path.join(SALIDA, `${nombre}-${tema}.jpg`);
    writeFileSync(archivo, Buffer.from(r.data, "base64"));
    execFileSync("sips", ["-Z", "1200", archivo], { stdio: "ignore" });
    ws.close(); await fetch(`${base}/json/close/${pest.id}`);
    console.log(nombre, tema);
  }
}
chrome.kill();
