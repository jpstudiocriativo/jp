const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module); cache.set(file, mod);
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return mod.exports;
}
const {parsePlanFile} = load(path.join(root,'src/lib/plan-parser.ts'));
const {buildSteps} = load(path.join(root,'src/lib/workflow.ts'));
const options = {month:'2026-09',defaultPlatform:'youtube',defaultFormat:'youtube_long'};
test('Casa real: 125 supported deliveries and correct weekly long titles',{skip:!fs.existsSync(path.resolve(root,'../Casa de Afeto/CASA DE AFETO/30-ideias-setembro.md'))},()=>{
 const file = path.resolve(root,'../Casa de Afeto/CASA DE AFETO/30-ideias-setembro.md');
 const plan = parsePlanFile('plano.md',fs.readFileSync(file,'utf8'),options);
 assert.equal(plan.projectName,'Casa de Afeto'); assert.equal(plan.entries.length,125);
 assert.equal(plan.entries.filter(e=>e.format==='youtube_long').length,5);
 assert.match(plan.entries.find(e=>e.date==='2026-09-02'&&e.format==='youtube_long').title,/agradar todo mundo/);
 assert.equal(plan.entries.find(e=>e.date==='2026-09-02'&&e.platform==='instagram').format,'carousel');
 assert.equal(plan.entries.filter(e=>e.platform==='pinterest').length,30);
 assert.equal(plan.entries.find(e=>e.date==='2026-09-01'&&e.platform==='pinterest').format,'image');
 assert.equal(plan.warnings.some(w=>/Pinterest.*não.*suportado/i.test(w)),false);
});
test('Aurora real: 30 longs; published status and thumbnail planning evidence preserved',{skip:!fs.existsSync(path.resolve(root,'../Aurora/01_Conteúdo/02_Ideias/30-ideais-setembro.md'))},()=>{
 const file=path.resolve(root,'../Aurora/01_Conteúdo/02_Ideias/30-ideais-setembro.md');
 const plan=parsePlanFile('plano.md',fs.readFileSync(file,'utf8'),{...options,projectNames:['Aurora']});
 assert.equal(plan.entries.length,30); assert.equal(plan.entries.filter(e=>e.published).length,3);
 assert.equal(plan.projectName,'Aurora'); assert.ok(plan.entries[3].reference);
 const steps=buildSteps(plan.entries[3]); assert.equal(steps.find(s=>s.label==='Imagem da thumbnail').is_done,false);
 assert.equal(steps.find(s=>s.label==='Roteiro (texto)').is_done,false);
 assert.equal(steps.find(s=>s.label==='Título do vídeo (SEO e IA)').is_done,true);
});
test('CSV arbitrary project and month, quoted separators and CRLF',()=>{
 const plan=parsePlanFile('plano.csv','projeto;data;canal;formato;titulo;ideia;cta\r\nMarca nova;2027-02-02;instagram;carousel;"Título; com separador";Ideia;Salvar\r\n',{month:'2027-02'});
 assert.equal(plan.projectName,'Marca nova'); assert.equal(plan.entries[0].title,'Título; com separador');
 assert.equal(buildSteps(plan.entries[0]).find(s=>s.label==='Ação desejada (CTA)').is_done,true);
});
test('rejects invalid dates, conflicts and empty files before writes',()=>{
 assert.throws(()=>parsePlanFile('empty.md','',options),/vazio/);
 assert.throws(()=>parsePlanFile('plano.json',JSON.stringify({entries:[{date:'2026-09-31',platform:'youtube',title:'Teste'}]}),options),/não existe/);
 assert.throws(()=>parsePlanFile('plano.csv','data;canal;titulo\n1;youtube;A\n1;youtube;B',options),/duas entregas/);
});
test('TikTok has reuse tasks only; publication does not mark the script',()=>{
 const plan=parsePlanFile('plan.json',JSON.stringify({project:'Novo',entries:[{date:'2026-09-01',platform:'tiktok',format:'short',title:'Gancho',published:true}]}),options);
 const steps=buildSteps(plan.entries[0]); assert.equal(steps.length,2); assert.equal(steps[0].is_done,false);
});
