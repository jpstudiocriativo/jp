const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the real browser data layer without sending user data to Supabase.
const root = path.resolve(__dirname, '..');
const cache = new Map();
function loadTs(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  cache.set(file, mod);
  mod.paths = module.paths;
  mod.require = name => name.startsWith('@/') ? loadTs(path.join(root, 'src', name.slice(2) + '.ts')) : name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  mod._compile(result.outputText, file);
  return mod.exports;
}
const api = loadTs(path.join(root, 'src/lib/supabase/workspace.ts'));
const uid = 'user-1';

function fakeClient() {
  const db = {
    projects: [{ id: 'project-1', user_id: uid, name: 'Marca', description: '', color: '#123456', status: 'active' }],
    project_channels: [], content_items: [], production_steps: [], publications: [], batch_updates: [], batch_update_items: [],
  };
  const client = { db, writes: 0, failTable: null, missingSlot: false, auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) } };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.sorts = []; this.start = 0; this.end = 999; this.operation = 'read'; }
    select(fields) { this.fields = fields; return this; }
    eq(k, v) { this.filters.push(r => r[k] === v); return this; }
    is(k, v) { this.filters.push(r => (r[k] ?? null) === v); return this; }
    in(k, values) { this.filters.push(r => values.includes(r[k])); return this; }
    gte(k, v) { this.filters.push(r => r[k] >= v); return this; }
    lte(k, v) { this.filters.push(r => r[k] <= v); return this; }
    order(k, options) { this.sorts.push([k, options?.ascending === false ? -1 : 1]); return this; }
    range(a, b) { this.start = a; this.end = b; return this; }
    limit(n) { this.end = n - 1; return this; }
    maybeSingle() { this.single = true; return this; }
    insert(rows) { this.operation = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(rows, options = {}) { this.operation = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.options = options; return this; }
    update(row) { this.operation = 'update'; this.patch = row; return this; }
    allowed(row) {
      if (row.user_id) return row.user_id === uid;
      if (this.table === 'production_steps') return db.content_items.some(c => c.id === row.content_id && c.user_id === uid);
      return true;
    }
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (this.operation === 'read' && this.table === 'publications' && this.fields?.includes('slot_key') && client.missingSlot) return { data: null, error: { message: 'column slot_key does not exist' } };
        if (this.operation !== 'read') {
          client.writes++;
          if (client.failTable === this.table) { client.failTable = null; return { data: null, error: { message: 'Simulated network failure' } }; }
        }
        const target = db[this.table];
        let rows = target.filter(r => this.allowed(r) && this.filters.every(f => f(r)));
        if (this.operation === 'update') { rows.forEach(row => Object.assign(row, this.patch)); }
        if (this.operation === 'insert' || this.operation === 'upsert') {
          rows = [];
          for (const payload of this.payload) {
            const keys = (this.options?.onConflict || 'id').split(',');
            const duplicate = target.find(row => keys.every(k => row[k] === payload[k]));
            if (this.operation === 'upsert' && duplicate) {
              if (!this.options.ignoreDuplicates) Object.assign(duplicate, payload);
              continue;
            }
            const row = { id: crypto.randomUUID(), user_id: uid, content_id: null, parent_content_id: null, slot_key: 'main', status: 'empty', scheduled_for: null, published_at: null, publication_url: null, notes: null, created_at: new Date().toISOString(), ...payload };
            target.push(row); rows.push(row);
          }
        }
        for (const [key, direction] of this.sorts.toReversed()) rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * direction);
        rows = rows.slice(this.start, this.end + 1).map(row => ({ ...row }));
        return { data: this.single ? rows[0] ?? null : rows, error: null };
      }).then(resolve, reject);
    }
  }
  client.from = table => new Query(table);
  return client;
}

function entry(overrides = {}) {
  return { date: '2027-02-01', platform: 'youtube', format: 'youtube_long', title: 'Meu assunto', brief: 'Ideia detalhada.', reference: 'Referência enviada', evidence: { idea: 'Ideia detalhada', title: 'Meu assunto', reference: 'Referência enviada' }, ...overrides };
}
function plan(entries = [entry()]) { return { month: '2027-02', projectName: 'Marca', sourceName: 'plano.md', warnings: [], entries }; }

test('loadWorkspace retrieves all steps beyond the default 1000-row limit without writes', async () => {
  const client = fakeClient();
  client.db.content_items.push({ id: 'content-1', user_id: uid, project_id: 'project-1', type: 'youtube_long', title: 'Vídeo' });
  for (let i = 0; i < 1250; i++) client.db.production_steps.push({ id: String(i).padStart(5, '0'), content_id: 'content-1', label: `Etapa ${i}`, block: 'Produção', sort_order: i, is_required: true, is_done: false });
  const ws = await api.loadWorkspace(client);
  assert.equal(ws.contents[0].steps.length, 1250);
  assert.equal(client.writes, 0);
});

test('reimport is idempotent and preserves a manual uncheck and published status', async () => {
  const client = fakeClient();
  await api.importPlan(client, 'project-1', plan());
  const step = client.db.production_steps.find(s => s.is_done);
  assert.ok(step, 'import must recognize supplied planning evidence');
  await api.setStep(client, step.id, false);
  client.db.publications[0].status = 'published';
  client.db.publications[0].published_at = '2027-02-01T12:03:00Z';
  const counts = [client.db.content_items.length, client.db.production_steps.length, client.db.publications.length];
  const result = await api.importPlan(client, 'project-1', plan());
  assert.deepEqual([client.db.content_items.length, client.db.production_steps.length, client.db.publications.length], counts);
  assert.equal(client.db.production_steps.find(s => s.id === step.id).is_done, false);
  assert.equal(client.db.publications[0].status, 'published');
  assert.equal(client.db.publications[0].published_at, '2027-02-01T12:03:00Z');
  assert.equal(result.created, 0);
});

test('a legacy empty main slot is filled without producing an extra obligation', async () => {
  const client = fakeClient();
  client.db.publications.push({ id: 'legacy-slot', user_id: uid, project_id: 'project-1', platform: 'youtube', planned_for: '2027-02-01', slot_key: 'main', content_id: null, status: 'empty' });
  await api.importPlan(client, 'project-1', plan());
  assert.equal(client.db.publications.length, 1);
  assert.equal(client.db.publications[0].id, 'legacy-slot');
  assert.ok(client.db.publications[0].content_id);
});

test('same titles across days/channels are separate content records linked by identity', async () => {
  const client = fakeClient();
  await api.importPlan(client, 'project-1', plan([entry(), entry({ platform: 'instagram', format: 'short' }), entry({ date: '2027-02-02' })]));
  assert.equal(client.db.content_items.length, 3);
  assert.equal(new Set(client.db.publications.map(p => p.content_id)).size, 3);
});

test('a conflicting title anywhere in a file fails before any writes', async () => {
  const client = fakeClient();
  await api.importPlan(client, 'project-1', plan());
  const writes = client.writes;
  await assert.rejects(api.importPlan(client, 'project-1', plan([entry({ date: '2027-02-02' }), entry({ title: 'Outro assunto' })])), /Conflito/);
  assert.equal(client.writes, writes);
});

test('partial import resumes without duplicate contents or reset checks', async () => {
  const client = fakeClient();
  client.failTable = 'publications';
  await assert.rejects(api.importPlan(client, 'project-1', plan()), /Parte do arquivo/);
  const count = client.db.production_steps.length;
  client.db.production_steps[0].is_done = false;
  await api.importPlan(client, 'project-1', plan());
  assert.equal(client.db.content_items.length, 1);
  assert.equal(client.db.production_steps.length, count);
  assert.equal(client.db.production_steps[0].is_done, false);
  assert.equal(client.db.publications.length, 1);
});

test('schema preflight and ownership checks prevent writes', async () => {
  const client = fakeClient();
  client.missingSlot = true;
  await assert.rejects(api.importPlan(client, 'project-1', plan()), /0003/);
  assert.equal(client.writes, 0);
  await assert.rejects(api.archiveProject(client, 'foreign-project', true), /nesta conta/);
  assert.equal(client.writes, 0);
});

test('cadence uses selected month/weekdays, preserves imported deliveries and is repeatable', async () => {
  const client = fakeClient();
  await api.importPlan(client, 'project-1', plan());
  await api.createCadence(client, 'project-1', '2027-02', ['youtube'], [1]);
  assert.deepEqual(client.db.publications.map(p => p.planned_for).sort(), ['2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22']);
  await api.createCadence(client, 'project-1', '2027-02', ['youtube'], [1]);
  assert.equal(client.db.publications.length, 4);
});

test('shared production checks never mark channel publications as published', async () => {
  const client = fakeClient();
  await api.importPlan(client, 'project-1', plan());
  const id = client.db.content_items[0].id;
  await api.reuseContent(client, id, 'project-1', 'instagram', '2027-02-01');
  const production = client.db.production_steps.filter(s => !/publica|agendar|postar/i.test(s.block + ' ' + s.label));
  for (const step of production) await api.setStep(client, step.id, true);
  assert.ok(client.db.publications.every(p => p.status === 'ready_to_schedule'));
  const pub = client.db.publications[0];
  await api.savePublication(client, pub, 'published');
  assert.equal(client.db.publications.filter(p => p.status === 'published').length, 1);
  assert.equal(client.db.publications.filter(p => p.status === 'ready_to_schedule').length, 1);
});
