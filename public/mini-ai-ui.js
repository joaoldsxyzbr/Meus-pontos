import { analyzeAttendance } from './mini-ai.js';

const status = document.getElementById('mini-ai-status');
const detail = document.getElementById('mini-ai-detail');
const analyzeButton = document.getElementById('mini-ai-analyze');
const copyButton = document.getElementById('mini-ai-copy');
let latestDay = null;
let latestReport = null;
let revision = 0;

async function getJson(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Consulta ao histórico indisponível (' + response.status + ').');
  return response.json();
}
function previousMonth(month) {
  const date = new Date(month + '-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
function render(report) {
  const prediction = report.prediction;
  status.textContent = prediction ? 'Previsão local disponível' : 'Análise local concluída';
  const lines = [];
  if (prediction) lines.push('Próxima batida (' + prediction.type.replaceAll('_', ' ') + '): por volta de ' + prediction.time + '. Margem histórica média: ±' + prediction.error_minutes + ' min.');
  else lines.push('Sem previsão confiável da próxima batida. A IA precisa de mais exemplos consistentes.');
  lines.push('Aprendizado: ' + report.training_days + ' dias válidos do histórico.');
  for (const finding of report.findings.filter(item => item.code !== 'SEM_PREVISAO_SEGURA')) lines.push('• ' + finding.detail);
  lines.push('Sugestões não alteram registros, horários nem banco de horas.');
  detail.textContent = lines.join('\n');
  copyButton.disabled = false;
}
async function analyze(day) {
  latestDay = day;
  const current = ++revision;
  copyButton.disabled = true;
  latestReport = null;
  status.textContent = 'Analisando jornada…';
  detail.textContent = 'A mini IA processa os dados neste dispositivo, sem API externa.';
  try {
    const month = day.date.slice(0, 7);
    const [a, b] = await Promise.all([
      getJson('/api/historico?mes=' + month),
      getJson('/api/historico?mes=' + previousMonth(month))
    ]);
    if (current !== revision) return;
    latestReport = analyzeAttendance(day, [...a.days, ...b.days]);
    render(latestReport);
  } catch (error) {
    if (current !== revision) return;
    status.textContent = 'Análise indisponível';
    detail.textContent = 'O histórico não pôde ser consultado. Os pontos permanecem disponíveis normalmente.';
  }
}
window.addEventListener('meus-pontos:dia-atualizado', event => {
  if (event.detail) void analyze(event.detail);
});
analyzeButton.addEventListener('click', async () => {
  if (latestDay) void analyze(latestDay);
  else {
    try { await analyze(await getJson('/api/hoje')); }
    catch { status.textContent = 'Entre no aplicativo para iniciar a análise.'; }
  }
});
copyButton.addEventListener('click', async () => {
  if (!latestReport) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
    copyButton.textContent = 'Relatório copiado';
    setTimeout(() => { copyButton.textContent = 'Copiar diagnóstico'; }, 2500);
  } catch {
    status.textContent = 'Não foi possível copiar o relatório neste navegador.';
  }
});
