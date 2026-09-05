// Local-only HTTP fixture for manual browser QA. Never deployed with the app.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'audit@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const date = new Date(); const today = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
const payload = Buffer.from(JSON.stringify({ sub: uid, aud: 'authenticated', exp: Math.floor(Date.now()/1000)+7200, role: 'authenticated' })).toString('base64url');
const jwt = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') + '.' + payload + '.local-only';
const content1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', content2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const db = { projects: [{ id: projectId, user_id: uid, name: 'Ateliê Teste', description: 'Conta de teste local', color: '#7057da', status: 'active', created_at: new Date().toISOString() }], project_channels: ['youtube','instagram','tiktok'].map(platform => ({ id: randomUUID(), project_id: projectId, platform, is_active: true, daily_cadence: 1 })), content_items: [content1,content2].map((id,i) => ({ id, user_id:uid, project_id:projectId, parent_content_id:null, type:i?'carousel':'youtube_long', title:'Mesmo título, formatos diferentes', idea:'Ideia completa do plano.', desired_action:'Comente', technical_reference:null, script_url:null, asset_url:null, created_at:new Date().toISOString() })), production_steps: [content1,content2].flatMap((id,i) => ['Ideia', i?'Roteiro dos cards':'Roteiro (texto)', i?'Imagens dos cards':'Narração'].map((label,j) => ({ id:randomUUID(), content_id:id, block:j?'2 · Construção':'1 · Ideia', label,is_required:true,is_done:j===0,completed_at:j===0?new Date().toISOString():null,sort_order:j }))), publications: ['youtube','instagram','tiktok'].map((platform,i) => ({ id:randomUUID(),user_id:uid,project_id:projectId,content_id:i===0?content1:i===1?content2:null,platform,format:null,planned_for:today,slot_key:'main',status:i===2?'empty':'in_progress',scheduled_for:null,published_at:null,publication_url:null,notes:null,created_at:new Date().toISOString() })), batch_updates:[],batch_update_items:[] };
function matches(row, params) {
  for (const [key, value] of params) {
    if (['select','order','offset','limit','on_conflict'].includes(key)) continue;
    const dot = value.indexOf('.'); const op = value.slice(0,dot), wanted=value.slice(dot+1); const actual=row[key];
    if (op==='eq' && String(actual)!==wanted) return false;
    if (op==='neq' && String(actual)===wanted) return false;
    if (op==='is' && (wanted==='null'?actual!=null:String(actual)!==wanted)) return false;
    if (op==='in' && !wanted.slice(1,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(actual))) return false;
    if (op==='gte' && String(actual)<wanted) return false;
    if (op==='lte' && String(actual)>wanted) return false;
  } return true;
}
http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS'); res.setHeader('Access-Control-Expose-Headers','Content-Range'); res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.end();return}
  const url=new URL(req.url,'http://127.0.0.1:54329'); let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):null;
  if(url.pathname.startsWith('/auth/v1/')){
    if(url.pathname.endsWith('/token')){res.end(JSON.stringify({access_token:jwt,token_type:'bearer',expires_in:7200,expires_at:Math.floor(Date.now()/1000)+7200,refresh_token:'local-fixture-refresh',user}));return}
    res.end(JSON.stringify(url.pathname.endsWith('/logout')?{}:user));return;
  }
  const table=url.pathname.split('/').at(-1);
  if(!db[table]){res.statusCode=404;res.end(JSON.stringify({message:'Fixture table not found: '+table}));return}
  let rows=db[table].filter(row=>matches(row,url.searchParams));
  if(req.method==='POST'){
    rows=[];for(const values of Array.isArray(body)?body:[body]){
      const conflict=(url.searchParams.get('on_conflict')||'id').split(',');
      const existing=db[table].find(r=>conflict.every(k=>r[k]===values[k]));
      if(existing && String(req.headers.prefer).includes('ignore-duplicates')) continue;
      if(existing){Object.assign(existing,values);rows.push(existing)}
      else{const row={id:randomUUID(),created_at:new Date().toISOString(),user_id:uid,...values};db[table].push(row);rows.push(row)}
    }res.statusCode=201;
  }else if(req.method==='PATCH'){rows.forEach(r=>Object.assign(r,body))}
  let offset=Number(url.searchParams.get('offset')||0), limit=Number(url.searchParams.get('limit')||1000);
  const order=url.searchParams.get('order');if(order){const key=order.split('.')[0];rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key])))}
  rows=rows.slice(offset,offset+limit);res.setHeader('Content-Range','0-'+Math.max(0,rows.length-1)+'/'+rows.length);
  if(String(req.headers.accept).includes('vnd.pgrst.object'))res.end(JSON.stringify(rows[0]??null));
  else res.end(JSON.stringify(rows));
}).listen(54329,'127.0.0.1',()=>console.log('Local-only audit fixture at http://127.0.0.1:54329'));

