import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const publicDir = path.resolve("public");
const swCode = fs.readFileSync(path.join(publicDir,"sw.js"),"utf8");

test("PWA inclui recursos reais sem APIs no cache", () => {
  const assets = [...swCode.matchAll(/"\/[^"]+"/g)].map(x => x[0].slice(2,-1));
  for(const asset of assets) {
    if(asset !== "") assert.ok(fs.existsSync(path.join(publicDir,asset)), "Recurso ausente: "+asset);
  }
  assert.ok(!assets.some(x=>x.startsWith("api/")));
  const html=fs.readFileSync(path.join(publicDir,"index.html"),"utf8");
  for(const file of ["app.js","ajustes.js","mini-ai-ui.js","mini-ai.css"]){
    assert.ok(html.includes("/"+file),"HTML precisa carregar "+file);
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(publicDir,"manifest.webmanifest"),"utf8"));
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.start_url,"/");
  assert.ok(manifest.icons.every(x=>fs.existsSync(path.join(publicDir,x.src.slice(1)))));
});

test("service worker não intercepta consultas nem gravações de API", async () => {
  const listeners=new Map();
  const writes=[];
  const cache={ addAll:async()=>{}, put:async request=>writes.push(new URL(request.url).pathname) };
  vm.runInNewContext(swCode,{
    URL, Response,
    self:{
      location:{origin:"https://ponto.exemplo.com"},
      addEventListener:(name,callback)=>listeners.set(name,callback),
      skipWaiting:async()=>{},
      clients:{claim:async()=>{}}
    },
    caches:{open:async()=>cache,keys:async()=>[],match:async()=>null},
    fetch:async()=>new Response("arquivo")
  });
  function trigger(url,method) {
    let answer=null;
    const event={
      request:new Request(url,{method}),
      respondWith(promise){answer=promise;},
      waitUntil(){}
    };
    listeners.get("fetch")(event);
    return answer;
  }
  assert.equal(trigger("https://ponto.exemplo.com/api/hoje","GET"),null);
  assert.equal(trigger("https://ponto.exemplo.com/api/pontos","POST"),null);
  assert.equal(trigger("https://externo.com/styles.css","GET"),null);
  const accepted=trigger("https://ponto.exemplo.com/styles.css","GET");
  assert.ok(accepted);
  assert.equal((await accepted).status,200);
  assert.ok(!writes.some(x=>x.startsWith("/api/")));
});
