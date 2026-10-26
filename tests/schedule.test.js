import test from "node:test";
import assert from "node:assert/strict";
import { effectiveSchedule } from "../src/schedule.js";

const base = { carga_minutos:240, usa_intervalo:0, sabado_referencia:null, justificativa:null };
test("sem referência não inventa folgas",()=>{
 assert.equal(effectiveSchedule("2026-10-31",base).carga_minutos,240);
 assert.equal(effectiveSchedule("2026-11-07",{...base,sabado_referencia:"2026-10-30"}).carga_minutos,240);
 assert.equal(effectiveSchedule("2026-10-24",{...base,sabado_referencia:"2026-10-31"}).carga_minutos,240);
});
test("sábados alternam apenas após o sábado trabalhado de referência",()=>{
 const schedule={...base,sabado_referencia:"2026-10-31"};
 assert.equal(effectiveSchedule("2026-10-31",schedule).carga_minutos,240);
 assert.equal(effectiveSchedule("2026-11-07",schedule).carga_minutos,0);
 assert.equal(effectiveSchedule("2026-11-14",schedule).carga_minutos,240);
 assert.equal(effectiveSchedule("2026-11-21",schedule).carga_minutos,0);
});
test("justificativas zeram carga exigida sem adulterar batidas",()=>{
 const row={carga_minutos:480,usa_intervalo:1,sabado_referencia:"2026-10-31",justificativa:"feriado"};
 assert.deepEqual(effectiveSchedule("2026-11-02",row),{carga_minutos:0,usa_intervalo:false,justificativa:"feriado"});
 assert.equal(effectiveSchedule("2026-11-03",{...row,justificativa:null}).carga_minutos,480);
});
test("referências inválidas não alteram carga",()=>{
 for(const ref of ["2026-02-30","2026-10-30","2026-10-31T00:00:00Z","sem-data"])
  assert.equal(effectiveSchedule("2026-11-07",{...base,sabado_referencia:ref}).carga_minutos,240);
});
