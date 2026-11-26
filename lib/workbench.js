/**
 * Standalone full-page workbench for dsh-llmwiki.
 *
 * Served from the SAME origin as the DSH web app via an exact GET route, so it
 * reuses /api/llm-wiki/ with no second server, port or CORS. It is a single
 * self-contained HTML document: no external scripts, styles, fonts or CDN.
 *
 * Design rules (standing user preferences):
 *  - The server computes all human wording (r.text); this page only renders it.
 *  - Palette mirrors dsh-mnemon's --mn-* semantics (built on --dsw-alias-*),
 *    with literal fallbacks because a standalone page has no host CSS vars.
 *    Light/dark follows prefers-color-scheme. No purple (old scheme dropped).
 *  - Dual attribution to nashsu/llm_wiki (GPL-3.0) and iwtown/dsh-llm-wiki (MIT)
 *    is kept in the footer, non-official disclaimer included.
 */

const API = '/api/llm-wiki/';

const CSS = `
:root{
  --a:#2563eb; --a-soft:#dbeafe; --ok:#16a34a; --bad:#dc2626; --warn:#d97706;
  --bg:#ffffff; --bg2:#f5f7fa; --layer:#ffffff; --field:#ffffff;
  --tx:#1f2329; --mut:#646a73; --faint:#8f959e; --line:#e2e5ea; --line2:#cfd4dc;
  --card:#ffffff; --shadow:0 1px 3px rgba(16,24,40,.06),0 6px 20px rgba(16,24,40,.05);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;
  --r:8px;
}
@media (prefers-color-scheme:dark){
  :root{
    --a:#5b9dff; --a-soft:#1b2a44; --ok:#4ade80; --bad:#f87171; --warn:#fbbf24;
    --bg:#16181d; --bg2:#101216; --layer:#1e2128; --field:#181b21;
    --tx:#e8eaed; --mut:#9aa0a8; --faint:#6f7681; --line:#2b3038; --line2:#3a414c;
    --card:#1e2128; --shadow:0 1px 3px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);
  }
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--tx);font-family:var(--sans);font-size:14px;line-height:1.55}
a{color:var(--a);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px 64px}
header.top{display:flex;align-items:center;gap:12px;padding:18px 0;border-bottom:1px solid var(--line);margin-bottom:20px}
header.top .mark{width:30px;height:30px;flex:0 0 auto}
header.top h1{font-size:18px;margin:0;font-weight:650;letter-spacing:.2px}
header.top .spacer{flex:1}
header.top .lg{font-size:12px;color:var(--mut);background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:5px 10px;cursor:pointer}
header.top .lg:hover{border-color:var(--a);color:var(--a)}
.lead{color:var(--mut);font-size:13px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:190px 1fr;gap:20px}
nav.side{display:flex;flex-direction:column;gap:2px;position:sticky;top:16px;align-self:start}
nav.side button{text-align:left;border:0;background:transparent;color:var(--mut);padding:9px 12px;border-radius:var(--r);font-size:13px;cursor:pointer;font-family:inherit}
nav.side button:hover{background:var(--bg2);color:var(--tx)}
nav.side button[data-on="1"]{background:var(--a-soft);color:var(--a);font-weight:600}
main .vaultbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
main .vaultbar label{font-size:12px;color:var(--mut)}
select,input,textarea{font-family:inherit;font-size:13px;color:var(--tx);background:var(--field);border:1px solid var(--line2);border-radius:var(--r);padding:8px 10px;outline:none;width:100%}
select:focus,input:focus,textarea:focus{border-color:var(--a);box-shadow:0 0 0 3px var(--a-soft)}
textarea{min-height:90px;resize:vertical;line-height:1.5}
button.btn{font-family:inherit;font-size:13px;border:1px solid var(--line2);background:var(--layer);color:var(--tx);border-radius:var(--r);padding:8px 14px;cursor:pointer}
button.btn:hover{border-color:var(--a);color:var(--a)}
button.btn.pri{background:var(--a);border-color:var(--a);color:#fff}
button.btn.pri:hover{filter:brightness(1.06);color:#fff}
button.btn:disabled{opacity:.5;cursor:not-allowed}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:22px}
.card h2{margin:0 0 4px;font-size:15px}
.card .hint{color:var(--faint);font-size:12px;margin:0 0 18px}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
.row .f{flex:1;min-width:160px}
.row .f label{display:block;font-size:12px;color:var(--mut);margin-bottom:5px}
.msg{margin:12px 0;padding:10px 12px;border-radius:var(--r);font-size:13px;background:var(--bg2);border:1px solid var(--line)}
.msg[data-kind="err"]{border-color:var(--bad);color:var(--bad)}
.msg[data-kind="ok"]{border-color:var(--ok);color:var(--ok)}
.out{margin-top:16px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:16px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;max-height:520px;overflow:auto}
.out:empty{display:none}
.list{list-style:none;margin:14px 0 0;padding:0}
.list li{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r);margin-bottom:7px;background:var(--layer)}
.list li .g{flex:1;min-width:0}
.list li .t{font-weight:600}
.list li .s{font-size:12px;color:var(--faint)}
.tag{font-size:11px;color:var(--mut);border:1px solid var(--line2);border-radius:20px;padding:1px 8px}
.ck{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);cursor:pointer}
.ck input{width:auto}
footer{border-top:1px solid var(--line);margin-top:32px;padding-top:16px;color:var(--faint);font-size:11.5px;line-height:1.7}
footer b{color:var(--mut)}
`;

// Embedded JS uses ONLY string concatenation — no backticks / ${} — so the
// outer Node template literal is never interpolated.
const JS = `
(function(){
  var API=${JSON.stringify(API)};
  var $=function(s,r){return (r||document).querySelector(s)};
  var state={vault:'',vaults:[],tab:'vaults',busy:false,lang:'zh'};
  var I18N={
    zh:{vaults:'知识库',ingest:'导入',pages:'页面',graph:'图谱',ask:'检索问答',review:'体检',maintain:'维护',
      lead:'独立的 LLM Wiki 工作台。所有能力由服务端计算成可读结果，这里只负责呈现。',
      vault:'当前知识库',refresh:'刷新',name:'名称',purpose:'目标 / 用途',create:'创建知识库',
      title:'标题',source:'来源链接',text:'文档内容',add:'导入并建页',enrich:'用 AI 丰富页面（需配置 LLM）',
      pageList:'列出页面',read:'读取',graphBtn:'生成图谱',question:'你的问题',askBtn:'检索上下文',
      fusion:'融合检索（含 mnemon）',reviewBtn:'开始体检',stale:'陈旧页复查',hygiene:'一键整理',
      digest:'画像线索',plan:'维护计划',hintNote:'值得沉淀的线索（可选）',hintBtn:'记录沉淀线索',
      noVault:'还没有知识库。到「知识库」新建一个，再导入文档。',loading:'处理中…',
      footerTitle:'关于',nonofficial:'非官方实现 · 未复制上游源码 · 按公开文档干净室重建',
      cn1:'知识模型源自',cn2:'（GPL-3.0，Copyright © 2024-2026 Yong Su）。',
      cn3:'思路借鉴',cn4:'（MIT by iwtown）；dsh-mnemon 仅通过公开工具使用，未做修改。'},
    en:{vaults:'Wikis',ingest:'Ingest',pages:'Pages',graph:'Graph',ask:'Ask',review:'Review',maintain:'Maintain',
      lead:'Standalone LLM Wiki workbench. The server computes every result in plain language; this page only renders it.',
      vault:'Active wiki',refresh:'Refresh',name:'Name',purpose:'Goals / scope',create:'Create wiki',
      title:'Title',source:'Source URL',text:'Document text',add:'Add & build page',enrich:'Enrich page with AI (needs LLM config)',
      pageList:'List pages',read:'Read',graphBtn:'Build graph',question:'Your question',askBtn:'Get context',
      fusion:'Fusion search (with mnemon)',reviewBtn:'Run review',stale:'Stale review',hygiene:'Tidy up',
      digest:'Profile clues',plan:'Maintenance plan',hintNote:'Note worth keeping (optional)',hintBtn:'Record hint',
      noVault:'No wiki yet. Create one under "Wikis", then ingest a document.',loading:'Working…',
      footerTitle:'About',nonofficial:'Unofficial implementation · no upstream source copied · clean-room rebuild from public docs',
      cn1:'Knowledge model from',cn2:' (GPL-3.0, Copyright © 2024-2026 Yong Su).',
      cn3:'Ideas inspired by',cn4:' (MIT by iwtown); dsh-mnemon is used through public tools only, unmodified.'}
  };
  var T=function(){return I18N[state.lang]};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function call(action,payload){
    return fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({action:action},payload||{}))})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
      .then(function(x){
        if(!x.ok||!x.j||x.j.ok!==true) throw new Error((x.j&&x.j.error)||'HTTP error');
        return x.j;
      });
  }
  function setMsg(text,kind){var m=$('#msg');m.textContent=text||'';m.setAttribute('data-kind',kind||'ok')}
  function setOut(text){$('#out').textContent=text||''}
  function busy(on){state.busy=!!on;var bs=document.querySelectorAll('button.btn');for(var i=0;i<bs.length;i++)bs[i].disabled=!!on}
  function run(action,payload,onDone){
    busy(true);setMsg(T().loading,'');setOut('');
    return call(action,payload).then(function(r){
      setMsg(r.text||'OK','ok');
      if(onDone)onDone(r.data);
      return loadVaults();
    }).catch(function(e){setMsg(e.message,'err')}).then(function(){busy(false)});
  }
  function loadVaults(){
    return call('vaults').then(function(r){
      state.vaults=r.data||[];
      var sel=$('#vault');
      var cur=state.vault;
      sel.innerHTML='<option value="">—</option>'+state.vaults.map(function(v){
        return '<option value="'+esc(v.id)+'">'+esc(v.name)+' ('+v.pages+'p)</option>';
      }).join('');
      if(!cur||!state.vaults.some(function(v){return v.id===cur}))cur=state.vaults.length?state.vaults[0].id:'';
      state.vault=cur;sel.value=cur;
    }).catch(function(e){setMsg(e.message,'err')});
  }
  var TABS=['vaults','ingest','pages','graph','ask','review','maintain'];
  function renderNav(){
    $('#nav').innerHTML=TABS.map(function(k){
      return '<button data-k="'+k+'" data-on="'+(state.tab===k?'1':'0')+'">'+esc(T()[k])+'</button>';
    }).join('');
  }
  function vaultLine(){var v=state.vaults.filter(function(x){return x.id===state.vault})[0];return v?v.name:'—'}
  function view(){
    var t=T(),v=state.vault;
    if(state.tab==='vaults'){
      return '<h2>'+esc(t.vaults)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<div class="row"><div class="f"><label>'+esc(t.name)+'</label><input id="nName" placeholder="e.g. Research Notes"></div>'+
        '<div class="f"><label>'+esc(t.purpose)+'</label><input id="nPurpose" placeholder="What questions should it answer?"></div></div>'+
        '<button class="btn pri" id="bCreate">'+esc(t.create)+'</button> '+
        '<button class="btn" id="bRefresh">'+esc(t.refresh)+'</button>'+
        '<ul class="list">'+ (state.vaults.length?state.vaults.map(function(x){
          return '<li><span class="g"><span class="t">'+esc(x.name)+'</span> <span class="s">· '+x.pages+' pages · '+x.sources+' sources</span></span><span class="tag">'+esc(x.id)+'</span></li>';
        }).join(''):'<li><span class="g"><span class="s">'+esc(t.noVault)+'</span></span></li>')+'</ul>';
    }
    if(!v)return '<h2>'+esc(t[state.tab])+'</h2><p class="hint">'+esc(t.noVault)+'</p>';
    if(state.tab==='ingest'){
      return '<h2>'+esc(t.ingest)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<div class="row"><div class="f"><label>'+esc(t.title)+'</label><input id="iTitle" placeholder="Document title"></div>'+
        '<div class="f"><label>'+esc(t.source)+'</label><input id="iOrigin" placeholder="https://…"></div></div>'+
        '<label>'+esc(t.text)+'</label><textarea id="iText" placeholder="Paste article, notes, or any text…"></textarea>'+
        '<div class="row" style="margin-top:12px"><label class="ck"><input type="checkbox" id="iGen">'+esc(t.enrich)+'</label>'+
        '<button class="btn pri" id="bIngest" style="margin-left:auto">'+esc(t.add)+'</button></div>';
    }
    if(state.tab==='pages'){
      return '<h2>'+esc(t.pages)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<button class="btn pri" id="bPages">'+esc(t.pageList)+'</button><div id="plist"></div>';
    }
    if(state.tab==='graph'){
      return '<h2>'+esc(t.graph)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<button class="btn pri" id="bGraph">'+esc(t.graphBtn)+'</button>';
    }
    if(state.tab==='ask'){
      return '<h2>'+esc(t.ask)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<label>'+esc(t.question)+'</label><textarea id="qText" style="min-height:64px" placeholder="What do you want to know from this wiki?"></textarea>'+
        '<div class="row" style="margin-top:12px"><label class="ck"><input type="checkbox" id="qFusion" checked>'+esc(t.fusion)+'</label>'+
        '<button class="btn pri" id="bAsk" style="margin-left:auto">'+esc(t.askBtn)+'</button></div>';
    }
    if(state.tab==='review'){
      return '<h2>'+esc(t.review)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<button class="btn pri" id="bReview">'+esc(t.reviewBtn)+'</button>';
    }
    if(state.tab==='maintain'){
      return '<h2>'+esc(t.maintain)+'</h2><p class="hint">'+esc(t.lead)+'</p>'+
        '<div class="row"><button class="btn pri" id="bStale">'+esc(t.stale)+'</button><button class="btn" id="bHygiene">'+esc(t.hygiene)+'</button></div>'+
        '<div class="row"><button class="btn" id="bDigest">'+esc(t.digest)+'</button><button class="btn" id="bPlan">'+esc(t.plan)+'</button></div>'+
        '<div class="row"><input id="mNote" class="f" placeholder="'+esc(t.hintNote)+'"><button class="btn" id="bHint">'+esc(t.hintBtn)+'</button></div>';
    }
    return '';
  }
  function bind(){
    var nav=$('#nav').querySelectorAll('button');
    for(var i=0;i<nav.length;i++)(function(b){b.onclick=function(){state.tab=b.getAttribute('data-k');render();setMsg('','');setOut('')}})(nav[i]);
    var B=function(id,fn){var e=$('#'+id);if(e)e.onclick=fn};
    B('bCreate',function(){run('createVault',{name:$('#nName').value,purpose:$('#nPurpose').value},function(d){state.vault=d.id})});
    B('bRefresh',function(){run('vaults',{})});
    B('bIngest',function(){run('ingest',{vault:state.vault,text:$('#iText').value,title:$('#iTitle').value,origin:$('#iOrigin').value,generate:$('#iGen').checked})});
    B('bPages',function(){run('pages',{vault:state.vault},function(d){
      var list=$('#plist');
      (d||[]).forEach(function(p,i){
        var li=document.createElement('div');li.className='list';
        var g=document.createElement('span');g.className='g';
        g.textContent='• '+(p.title||p.rel)+'  ['+p.type+']  '+p.rel;
        var b=document.createElement('button');b.className='btn';b.textContent=T().read;
        b.onclick=function(){run('readPage',{vault:state.vault,path:p.rel||p.path},function(page){
          setOut((page.frontmatter&&page.frontmatter.title?'# '+page.frontmatter.title+'\\n\\n':'')+(page.body||''));
        })};
        li.appendChild(g);li.appendChild(b);list.appendChild(li);
      });
      if(!(d&&d.length))list.innerHTML='<p class="s">—</p>';
    })});
    B('bGraph',function(){run('graph',{vault:state.vault},function(d){
      var lines=['Clusters:'];
      (d.nodes||[]).forEach(function(n){lines.push('  #'+n.community+'  '+n.label+' ['+n.type+'] degree '+n.degree)});
      lines.push('','Connections:');
      (d.edges||[]).forEach(function(e){lines.push('  '+e.a+'  <->  '+e.b+'  ('+Number(e.weight).toFixed(1)+')')});
      if(d.insights&&d.insights.gaps&&d.insights.gaps.length){lines.push('','Gaps:');d.insights.gaps.forEach(function(g){lines.push('  - '+g)})}
      setOut(lines.join('\\n'));
    })});
    B('bAsk',function(){var a=$('#qFusion').checked?'fusedQuery':'query';run(a,{vault:state.vault,question:$('#qText').value},function(d){setOut(d.context||'')})});
    B('bReview',function(){run('review',{vault:state.vault},function(d){setOut((d.issues||[]).map(function(x){return '['+x.severity+'] '+x.type+': '+x.message}).join('\\n')||(d.summary||''))})});
    B('bStale',function(){run('staleReview',{vault:state.vault},function(d){setOut((d.stale||[]).map(function(s){return '• '+s.title+' — '+s.why}).join('\\n')||'—')})});
    B('bHygiene',function(){run('hygiene',{vault:state.vault})});
    B('bDigest',function(){run('profileDigest',{vault:state.vault},function(d){setOut((d.candidates||[]).map(function(c){return '• '+c.title+' ('+c.page+')'}).join('\\n')||'—')})});
    B('bPlan',function(){run('maintenancePlan',{vault:state.vault},function(d){setOut(d.text||'')})});
    B('bHint',function(){run('compileHint',{vault:state.vault,note:$('#mNote').value})});
  }
  function render(){
    document.title='LLM Wiki · Workbench';
    $('#lead').textContent=T().lead;
    $('#vaultLabel').textContent=T().vault;
    $('#bRefreshTop').textContent=T().refresh;
    $('#lg').textContent=state.lang==='zh'?'EN':'中文';
    renderNav();
    $('#view').innerHTML=view();
    var s=$('#vault');
    s.onchange=function(){state.vault=s.value;setMsg('','');setOut('')};
    bind();
  }
  $('#lg').onclick=function(){state.lang=state.lang==='zh'?'en':'zh';render();setMsg('','');setOut('')};
  $('#bRefreshTop').onclick=function(){run('vaults',{})};
  render();
  loadVaults().then(render);
})();
`;

const MARK =
  '<svg class="mark" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<circle cx="6" cy="6" r="2.5" fill="#2563eb"/>' +
  '<circle cx="18" cy="7" r="2" fill="#16a34a"/>' +
  '<circle cx="12" cy="18" r="2.5" fill="#d97706"/>' +
  '<path d="M8 7L16 8M7 8l4 8M17 9l-4 7" stroke="#8f959e" stroke-width="1.2" fill="none"/>' +
  '</svg>';

/** Build the complete standalone HTML document. */
export function renderWorkbenchHtml() {
  return (
    '<!doctype html><html lang="zh"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>LLM Wiki · Workbench</title>' +
    '<style>' + CSS + '</style></head><body>' +
    '<div class="wrap">' +
    '<header class="top">' + MARK +
    '<h1>LLM Wiki · Workbench</h1><span class="spacer"></span>' +
    '<button class="lg" id="lg">EN</button>' +
    '</header>' +
    '<p class="lead" id="lead"></p>' +
    '<div class="vaultbar"><label id="vaultLabel">当前知识库</label>' +
    '<select id="vault" style="width:auto;min-width:220px"><option value="">—</option></select>' +
    '<button class="btn" id="bRefreshTop">刷新</button></div>' +
    '<div class="grid"><nav class="side" id="nav"></nav>' +
    '<main><div class="card"><div id="view"></div>' +
    '<div class="msg" id="msg" data-kind="ok"></div>' +
    '<div class="out" id="out"></div></div></main></div>' +
    '<footer><b id="ftAbout">关于 / About</b><br>' +
    '<span id="ftDisc"></span><br><span id="ftCn1"></span><span id="ftCn2"></span><br>' +
    '<span id="ftCn3"></span><span id="ftCn4"></span></footer>' +
    '</div>' +
    '<script>' + JS + '</script>' +
    // Localize footer text at load (server-computed, static, no data structure leak).
    '<script>(function(){var zh=document.lang||"zh";' +
    'document.getElementById("ftDisc").textContent="非官方实现 · 未复制上游源码 · 按公开文档干净室重建";' +
    'document.getElementById("ftCn1").textContent="知识模型源自 ";' +
    'document.getElementById("ftCn2").textContent="nashsu/llm_wiki（GPL-3.0，Copyright © 2024-2026 Yong Su）。";' +
    'document.getElementById("ftCn3").textContent="思路借鉴 ";' +
    'document.getElementById("ftCn4").textContent="iwtown/dsh-llm-wiki（MIT by iwtown）；dsh-mnemon 仅通过公开工具使用，未做修改。";' +
    '})();</script>' +
    '</body></html>'
  );
}

/** HTTP route handler for the standalone page (GET/HEAD only). */
export function workbenchHandler(req, res) {
  const method = (req && req.method) || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const html = renderWorkbenchHtml();
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html, 'utf8'),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(method === 'HEAD' ? undefined : html);
}
