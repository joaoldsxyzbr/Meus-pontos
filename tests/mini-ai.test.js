import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAttendance, AI_VERSION } from '../public/mini-ai.js';

function history(days=26) {
  return Array.from({length:days}, (_,i) => {
    const date = new Date(Date.UTC(2026,8,1+i));
    const data = date.toISOString().slice(0,10);
    const tweak = (i % 3) * 2;
    const fmt = minutes => String(Math.floor(minutes/60)).padStart(2, '0')+ ':' +String(minutes%60).padStart(2,'0');
    return {data, carga_prevista:480, pendencia:null, entrada:fmt(410+tweak), ida_intervalo:fmt(630+tweak), volta_intervalo:fmt(740+tweak), saida:fmt(1020+tweak)};
  });
}
function today() {
  return {date:'2026-10-26', carga_minutos:480, usa_intervalo:true, points:[], next_type:'entrada', pendencia:null};
}
test('IA não estima sem histórico e não inventa ponto',()=>{
  const data=analyzeAttendance(today(), []);
  assert.equal(data.prediction,null);
  assert.equal(data.training_days,0);
  assert.equal(data.version,AI_VERSION);
  assert.ok(data.findings.some(f=>f.code==='SEM_PREVISAO_SEGURA'));
});
test('rede neural aprende horário aproximado sem alterar fonte',()=>{
  const day=today();const rows=history();const before=JSON.stringify({day,rows});
  const result=analyzeAttendance(day,rows);
  assert.ok(result.prediction,JSON.stringify(result));
  assert.equal(result.prediction.type,'entrada');
  assert.ok(result.prediction.time>='06:15'&&result.prediction.time<='07:45',JSON.stringify(result.prediction));
  assert.equal(JSON.stringify({day,rows}),before);
  assert.equal(result.history_days,26);
  assert.ok(result.prediction.error_minutes<=45);
  assert.ok(Number.isInteger(result.validation_baseline_mae_minutes));
});
test('detecta inconsistência e informa pendências sem vazar horários',()=>{
  const d={...today(),points:[{tipo:'saida',horario:'06:50'}],pendencia:'sem_entrada'};
  const rows=[{...history(1)[0],pendencia:'falta'}];
  const report=analyzeAttendance(d,rows);
  assert.ok(report.findings.some(f=>f.code==='SEQUENCIA_INCONSISTENTE'));
  assert.ok(report.findings.some(f=>f.code==='PENDENCIA_OFICIAL'));
  assert.ok(report.findings.some(f=>f.code==='HISTORICO_PENDENTE'));
  assert.ok(!JSON.stringify(report).includes('06:50'));
  assert.ok(!JSON.stringify(report).includes('sem_entrada'));
});
test('rejeita dados incompletos e descarta amostras inválidas',()=>{
  assert.throws(()=>analyzeAttendance(null, []),TypeError);
  const report=analyzeAttendance(today(), [{...history(1)[0],saida:'02:00'},{...history(1)[0],entrada:'99:99'}]);
  assert.equal(report.training_days,0);
});
