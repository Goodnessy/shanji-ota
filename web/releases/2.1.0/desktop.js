(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return ''; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
    remove(k) { try { sessionStorage.removeItem(k); } catch (_) {} }
  };
  const state = {
    code: new URLSearchParams(location.search).get('code') || session.get('shanji-web-session') || '',
    connected: false, busy: false, page: 'home', data: null, notes: [], tasks: [], projects: [],
    chatMode: 'SMART', candidateBusy:false, clarifyCandidateId:null, readerFocus:false, readerFont:1, projectFilter:'ALL', projectDraft:null, projectBusy:false, searchRequest:0, taskProjectId:null, noteProjectId:null, chatTargetId:null,
    noteId: null, note: null, noteDraft: null, noteBusy: false, noteQuery: '', kind: 'all',
    taskFilter: 'open', taskZone: 'ALL', weekOffset: 0, expandedWeekDay: '', taskDraft: null, taskBusy: false, messages: [], chatBusy: false,
    reviewPeriod: 'DAILY', reviewScope: 'ALL', review: null, gallery: [], galleryOffset: 0,
    galleryMore: false, galleryBusy: false, fileBusy: false
  };
  const titles = {
    home: ['首页', 'Capture first. Use later.'],
    chat: ['闪记一下', '输入、理解、确认，直接保存到手机'],
    library: ['内容', '查看和整理手机里的真实记录'],
    tasks: ['待办', '所有变更直接写入手机'],
    projects: ['项目', '项目进度、关联待办和内容'],
    review: ['回顾', '真实数据 · 智能梳理'],
    search: ['搜索', '跨内容、待办和项目'],
    gallery: ['媒体', '同一局域网 · 无需云同步']
  };
  const escape = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const dateLabel = (n) => {
    if (!n) return '';
    const d = new Date(Number(n));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const dayKey = (n) => {
    if (!n) return '';
    const d = new Date(Number(n));
    if (Number.isNaN(d.getTime())) return '';
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const toast = (message) => {
    const el = $('toast');
    el.textContent = message; el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 3400);
  };
  const authUrl = (path) => {
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin) throw new Error('请求来源不正确');
    url.searchParams.set('code', state.code);
    return url.pathname + url.search;
  };
  async function api(path, options = {}) {
    if (!state.code) throw new Error('尚未连接手机');
    let response;
    try { response = await fetch(authUrl(path), { cache:'no-store', credentials:'omit', ...options }); }
    catch (_) { throw new Error('无法访问手机，请确认闪记互联仍然开启且电脑网络未切换'); }
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const err = new Error(typeof payload === 'string' ? payload : payload.message || payload.error || '操作失败');
      err.status = response.status;
      if (response.status === 403) showFailure('连接码已失效，请从手机重新复制新的互联网址');
      throw err;
    }
    return payload;
  }
  const post = (path, data = {}) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  function showFailure(message) {
    $('appError').hidden = false; $('appError').textContent = message;
    $('syncStatus').textContent = '连接异常';
  }
  function clearFailure() {
    $('appError').hidden = true; $('appError').textContent = '';
    $('syncStatus').textContent = '已连接';
  }
  function sourceLabel(n) {
    const source = (n.sourceType || '').toUpperCase();
    if (source === 'XIAOHONGSHU' || source === 'XHS') return '小红书';
    if (source === 'WECHAT' || source === 'WECHAT_OFFICIAL' || source === 'WECHAT_CHANNELS') return '微信';
    if (source === 'DOUYIN') return '抖音';
    if (source === 'BILIBILI') return 'B站';
    if (n.audioCount) return '录音';
    if (n.imageCount) return '图片';
    return n.sourceType && source !== 'NONE' ? '网页' : '笔记';
  }
  function noteKind(n) {
    const type = (n.sourceType || '').toUpperCase();
    if (/XHS|XIAOHONGSHU/.test(type)) return 'xhs';
    if (/WECHAT|WEIXIN/.test(type)) return 'wechat';
    if (n.audioCount > 0) return 'audio';
    if (n.imageCount > 0) return 'image';
    if (type !== 'NONE' && type) return 'web';
    return 'note';
  }
  function safeMedia(raw) {
    const u = String(raw || '').trim();
    if (u.startsWith('/api/')) {
      const url = new URL(u, location.origin);
      if (url.origin !== location.origin) return '';
      if (!url.searchParams.has('code')) url.searchParams.set('code', state.code);
      return url.pathname + url.search;
    }
    if (/^https?:\/\//i.test(u)) return u;
    return '';
  }
  async function bootstrap(silent = false) {
    const data = await api('/api/bootstrap');
    state.data = data;
    state.notes = (data.notes || []).filter(n => !n.deleted);
    state.tasks = (data.tasks || []).filter(t => !t.deleted);
    state.projects = data.projects || [];
    if(state.taskProjectId&&!state.projects.some(p=>p.id===state.taskProjectId))state.taskProjectId=null;
    if(state.noteProjectId&&!state.projects.some(p=>p.id===state.noteProjectId))state.noteProjectId=null;
    $('deviceVersion').textContent = '手机 V' + (data.versionName || '—') + ' · 局域网';
    clearFailure();
    renderActive();
    if (!silent) toast('已读取手机最新数据');
    return data;
  }
  async function connect() {
    const inputCode = $('connectCode').value.trim();
    if (inputCode) state.code = inputCode;
    if (!/^\d{6}$/.test(state.code)) {
      $('connectError').textContent = '请输入手机的六位连接码';
      return;
    }
    const submit = $('connectForm').querySelector('button[type=submit]');
    submit.disabled = true; $('connectError').textContent = '';
    try {
      await bootstrap(true);
      state.connected = true;
      session.set('shanji-web-session', state.code);
      history.replaceState(null, '', location.pathname);
      $('connectScreen').hidden = true; $('appShell').hidden = false;
      navigate('home');
    } catch (e) {
      $('connectError').textContent = e.message;
    } finally { submit.disabled = false; }
  }
  function navigate(page) {
    if (!titles[page] || !state.connected) return;
    state.page = page;
    document.querySelectorAll('.screen').forEach(el => { el.hidden = el.id !== 'screen-' + page; });
    document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $('pageTitle').textContent = titles[page][0];
    $('pageSubtitle').textContent = titles[page][1];
    document.querySelector('.sidebar').classList.remove('open');
    renderActive();
    if (page === 'chat') loadChat();
    if (page === 'review') loadReview();
    if (page === 'gallery') loadGallery(true);
  }
  function renderActive() {
    if (!state.connected) return;
    if (state.page === 'home') renderHome();
    if (state.page === 'library') renderLibrary();
    if (state.page === 'tasks') renderTasks();
    if (state.page === 'projects') renderProjects();
    if (state.page === 'search') renderSearch();
  }
  function renderHome() {
    const custom=state.data?.homeGreeting;
    const title=$('homeGreeting');
    title.textContent=custom==null?'想到，就闪记一下。':custom;
    title.hidden=state.data?.homeGreetingVisible===false || !title.textContent.trim();
    const pending = state.tasks.filter(t => !t.isDone);
    $('homeStats').innerHTML = [
      ['闪记内容', state.notes.length],
      ['待办总数', state.tasks.length],
      ['待完成', pending.length],
      ['已完成', state.tasks.length-pending.length]
    ].map(([label, count]) => '<div class="stat"><strong>'+escape(count)+'</strong><span>'+escape(label)+'</span></div>').join('');
    const recent = [...state.notes].sort((a,b) => Number(b.presentationTimestamp || b.updatedAt)-Number(a.presentationTimestamp || a.updatedAt)).slice(0,7);
    $('homeRecent').innerHTML = recent.length ? recent.map(n =>
      '<button class="compact-row" type="button" data-home-note="'+escape(n.id)+'"><strong>'+escape(n.title || '无标题')+'</strong><span>'+escape(dateLabel(n.presentationTimestamp || n.updatedAt))+'</span></button>'
    ).join('') : '<div class="empty">暂无内容</div>';
    $('homeRecent').querySelectorAll('[data-home-note]').forEach(b => b.onclick = () => { navigate('library'); openNote(Number(b.dataset.homeNote)); });
    $('homeTasks').innerHTML = pending.length ? pending.slice(0,7).map(t =>
      '<button class="compact-row" type="button" data-home-task="'+escape(t.id)+'"><strong>'+escape(t.title)+'</strong><span>'+escape(t.plannedAt || t.dueAt ? dayKey(t.plannedAt || t.dueAt) : '待安排')+'</span></button>'
    ).join('') : '<div class="empty">所有待办已完成</div>';
    $('homeTasks').querySelectorAll('[data-home-task]').forEach(b => b.onclick = () => { navigate('tasks'); editTask(Number(b.dataset.homeTask)); });
  }
  function candidateLabel(kind) {
    return ({TASK:'待办',CONTENT:'内容',PROJECT:'项目',EVENT:'日程',NOTE:'闪记'})[kind] || '整理建议';
  }
  function candidateDetails(data) {
    const details = [];
    const when = data.plannedAt || data.dueAt || data.due_at || data.date;
    if (typeof when === 'number' && when > 0) details.push(dateLabel(when));
    else if (typeof when === 'string' && when.length < 55) details.push(when);
    const project = data.projectName || data.project_name;
    if (typeof project === 'string' && project.trim()) details.push('项目 · '+project.trim().slice(0,80));
    return details.map(x=>'<span>'+escape(x)+'</span>').join('');
  }
  function renderChat() {
    const root = $('chatMessages');
    const pending = state.messages.reduce((count,entry)=>count+(entry.candidates||[]).filter(c=>c.status==='PENDING').length,0);
    $('chatPendingCount').textContent = pending ? pending+' 项待确认' : '暂无待确认';
    root.innerHTML = state.messages.length ? state.messages.map(entry => {
      const msg = entry.message || {};
      const waiting = (entry.candidates||[]).filter(c=>c.status==='PENDING');
      const candidates = (entry.candidates || []).map(c => {
        const data = c.payload || {};
        const heading = data.title || data.text || data.name || data.content || data.raw || '';
        const description = data.description || data.summary || '';
        const badge = c.status==='CONFIRMED'?'已保存':c.status==='REJECTED'?'已取消':'待确认';
        return '<div class="candidate '+(c.status==='PENDING'?'pending':'resolved')+'"><div class="candidate-head"><span class="candidate-kind">'+escape(candidateLabel(c.kind))+'</span><span class="candidate-status">'+escape(badge)+'</span></div>'+
          '<div class="candidate-title">'+escape(heading || '待确认内容')+'</div>'+
          (description?'<p class="candidate-detail">'+escape(description)+'</p>':'')+
          (candidateDetails(data)?'<div class="candidate-metadata">'+candidateDetails(data)+'</div>':'')+
          (c.status === 'PENDING' ? '<div class="candidate-actions"><button type="button" class="candidate-confirm" data-action="confirm" data-id="'+escape(c.id)+'">确认保存</button><button type="button" data-action="clarify" data-id="'+escape(c.id)+'">补充信息</button><button type="button" data-action="reject" data-id="'+escape(c.id)+'">不保存</button></div>':'')+
          '</div>';
      }).join('');
      const isAssistant=msg.role==='ASSISTANT';
      const sourceButtons=isAssistant?(entry.sourceLinks||[]).filter(s=>s.targetId>0 && (s.targetType==='CONTENT'||s.targetType==='TASK')).slice(0,6).map(s=>'<button type="button" data-source-type="'+escape(s.targetType)+'" data-source-target="'+escape(s.targetId)+'">'+(s.targetType==='TASK'?'查看待办':'查看内容')+'</button>').join(''):'';
      const bulk=waiting.length>1?'<button type="button" class="bulk-confirm" data-bulk-confirm="'+escape(msg.id)+'">确认本条全部 '+waiting.length+' 项</button>':'';
      return '<article data-message-id="'+escape(msg.id||'')+'" class="chat-bubble'+(isAssistant?' assistant':' user')+'"><div class="chat-avatar" aria-hidden="true">'+(isAssistant?'闪':'我')+'</div><div class="chat-bubble-body"><div class="meta">'+(isAssistant?'闪记':'我')+' · '+escape(dateLabel(msg.createdAt))+'</div><div class="content">'+escape(msg.rawText || (isAssistant?'已整理完成':'已发送'))+'</div>'+(candidates?'<div class="candidate-list">'+candidates+'</div>':'')+(bulk?'<div class="bulk-actions">'+bulk+'</div>':'')+(sourceButtons?'<div class="candidate-actions source-evidence">'+sourceButtons+'</div>':'')+'</div></article>';
    }).join('') : '<div class="chat-empty"><span class="chat-empty-icon">闪</span><strong>有什么想记的，直接说</strong><p>工作记录、网页链接、待办和问题都可以从这里开始。识别结果确认后才会保存。</p></div>';
    root.querySelectorAll('[data-action]').forEach(b => b.onclick = () => candidateAction(b.dataset.action,Number(b.dataset.id)));
    root.querySelectorAll('[data-bulk-confirm]').forEach(b=>b.onclick=()=>{
      const entry=state.messages.find(e=>Number(e.message?.id)===Number(b.dataset.bulkConfirm));
      const ids=(entry?.candidates||[]).filter(c=>c.status==='PENDING').map(c=>Number(c.id)).filter(Number.isInteger);
      if(ids.length>1)candidateAction('confirm-all',ids);
    });
    root.querySelectorAll('[data-source-target]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.sourceTarget);if(b.dataset.sourceType==='TASK'){navigate('tasks');editTask(id);}else{navigate('library');openNote(id);}});
  }
  async function loadChat() {
    if (!state.connected) return;
    try {
      const result = await api('/api/conversation/recent?limit=80');
      const root = $('chatMessages');
      const firstLoad = root.dataset.initialLoaded !== '1';
      const previousScrollTop = root.scrollTop;
      const wasNearBottom = root.scrollHeight - previousScrollTop - root.clientHeight < 120;
      state.messages = result.items || [];
      renderChat();
      root.scrollTop = firstLoad || wasNearBottom ? root.scrollHeight : previousScrollTop;
      root.dataset.initialLoaded='1';
      if(state.chatTargetId){const target=root.querySelector('[data-message-id="'+state.chatTargetId+'"]');if(target?.scrollIntoView)target.scrollIntoView({block:'center'});state.chatTargetId=null;}
    } catch (e) { toast('读取对话失败：'+e.message); }
  }
  function updateChatDraft() {
    const field=$('chatInput'), count=field.value.length;
    $('chatInputCount').textContent=count+' / 12000';
    $('chatSend').disabled=state.chatBusy||!field.value.trim();
    const height=Number(field.scrollHeight);
    if(Number.isFinite(height)&&height>0)field.style.height=Math.min(220,Math.max(78,height))+'px';
  }
  async function sendChat() {
    const value = $('chatInput').value.trim();
    if (!value || state.chatBusy) return;
    state.chatBusy = true; $('chatSend').disabled = true; $('chatSend').textContent = '整理中…';
    try {
      const result=await post('/api/conversation/intake',{ text:value,inputMode:state.chatMode });
      $('chatInput').value = '';
      await Promise.all([loadChat(),bootstrap(true)]);
      const candidates=(result.candidates||[]).filter(c=>c.status==='PENDING').length;
      toast(candidates?('已识别 '+candidates+' 项，请确认需要保存的内容'):'已获取闪记回复');
    } catch (e) { toast('发送失败：'+e.message); }
    finally { state.chatBusy=false;$('chatSend').innerHTML='发送 <span>↗</span>';updateChatDraft(); }
  }
  async function candidateAction(action,id) {
    if(action==='clarify'){
      state.clarifyCandidateId=id;
      $('clarifyText').value='';
      $('clarifyDialog').showModal();
      $('clarifyText').focus();
      return;
    }
    if(state.candidateBusy)return;
    state.candidateBusy=true;
    try {
      const bulk=action==='confirm-all';
      const endpoint=bulk?'confirm':action;
      const payload=bulk?{candidateIds:id}:{candidateId:id};
      await post('/api/conversation/'+endpoint,payload);
      await Promise.all([loadChat(),bootstrap(true)]);
      toast(action==='reject'?'已取消':bulk?'已批量确认保存':'已保存到手机');
    } catch (e) { toast('操作失败：'+e.message); }
    finally { state.candidateBusy=false; }
  }
  async function submitClarification(event){
    event.preventDefault();
    const text=$('clarifyText').value.trim();
    if(!text||state.candidateBusy||!state.clarifyCandidateId)return;
    state.candidateBusy=true;$('clarifySubmit').disabled=true;
    try{
      await post('/api/conversation/clarify',{candidateId:state.clarifyCandidateId,text});
      $('clarifyDialog').close();state.clarifyCandidateId=null;
      await Promise.all([loadChat(),bootstrap(true)]);
      toast('已重新理解，请检查并确认');
    }catch(e){toast('补充失败：'+e.message);}
    finally{state.candidateBusy=false;$('clarifySubmit').disabled=false;}
  }
  function filteredNotes() {
    const words = state.noteQuery.trim().toLowerCase();
    return state.notes.filter(n => {
      if (state.kind !== 'all' && noteKind(n) !== state.kind) return false;
      if(state.noteProjectId && n.projectId!==state.noteProjectId)return false;
      return !words || [n.title,n.excerpt,n.searchText,n.projectName].some(v => String(v||'').toLowerCase().includes(words));
    }).sort((a,b) => Number(b.presentationTimestamp||b.updatedAt)-Number(a.presentationTimestamp||a.updatedAt));
  }
  function renderLibrary() {
    const list = $('libraryList'),notes=filteredNotes();
    const project=state.projects.find(p=>p.id===state.noteProjectId);
    $('libraryProjectScope').hidden=!project;
    $('libraryProjectName').textContent=project?.name||'';
    list.innerHTML = notes.length ? notes.map(n =>
      '<button class="record-row'+(n.id===state.noteId?' active':'')+'" data-note-id="'+escape(n.id)+'" type="button"><strong>'+escape(n.title||'无标题')+'</strong>'+
      '<p>'+escape(n.excerpt||'')+'</p><small>'+escape(sourceLabel(n))+' · '+escape(dateLabel(n.presentationTimestamp||n.updatedAt))+'</small></button>'
    ).join('') : '<div class="empty">没有找到符合条件的闪记</div>';
    list.querySelectorAll('[data-note-id]').forEach(b => b.onclick = ()=>openNote(Number(b.dataset.noteId)));
  }
  async function openNote(id) {
    if (!Number.isInteger(id) || id<=0) return;
    state.noteId = id;
    renderLibrary();
    $('noteDetail').scrollTop=0;
    $('noteDetail').innerHTML = '<div class="empty">正在读取手机详情…</div>';
    try {
      const note=await api('/api/note?id='+encodeURIComponent(id));
      if (state.noteId !== id) return;
      state.note=note;
      renderNoteDetail();
    } catch(e) { $('noteDetail').textContent='详情读取失败：'+e.message; }
  }
  function readerBlock(block) {
    if(block.type==='IMAGE'){
      const url=safeMedia(block.src);
      return url?'<figure class="reader-figure"><img src="'+escape(url)+'" alt="'+escape(block.caption||'正文配图')+'" loading="lazy">'+(block.caption?'<figcaption>'+escape(block.caption)+'</figcaption>':'')+'</figure>':'';
    }
    if(block.type==='DIVIDER')return '<hr class="reader-divider">';
    const txt=escape(block.text||'');
    if(!txt)return '';
    if(block.type==='HEADING'){
      return Number(block.level)===1?'<h3 class="reader-heading">'+txt+'</h3>':'<h4 class="reader-subheading">'+txt+'</h4>';
    }
    if(block.type==='QUOTE')return '<blockquote class="reader-quote">'+txt+'</blockquote>';
    if(block.type==='CODE')return '<pre class="reader-code"><code>'+txt+'</code></pre>';
    return '<p class="reader-paragraph">'+txt+'</p>';
  }
  function renderNoteDetail() {
    const n=state.note;
    if(!n)return;
    const all=filteredNotes(), index=all.findIndex(x=>x.id===n.id);
    const previous=index>0?all[index-1]:null, next=index>=0&&index<all.length-1?all[index+1]:null;
    const blocks=n.blocks||[];
    const represented=new Set(blocks.filter(b=>b.type==='IMAGE'&&b.attachmentId!=null).map(b=>Number(b.attachmentId)));
    const source=/^https?:\/\//i.test(n.sourceUrl||'')?n.sourceUrl:'';
    let result='<div class="reader-paper" style="--reader-font-scale:'+state.readerFont+'">';
    result+='<div class="reader-toolbar"><div class="reader-position">'+(index>=0?(index+1)+' / '+all.length:'阅读内容')+'</div><div class="reader-controls">'+
      '<button type="button" id="readerSmaller" class="reader-tool" aria-label="缩小正文字号" title="缩小正文字号">A−</button>'+
      '<button type="button" id="readerLarger" class="reader-tool" aria-label="放大正文字号" title="放大正文字号">A＋</button>'+
      '<button type="button" id="readerFocus" class="reader-tool reader-focus-toggle" aria-pressed="'+state.readerFocus+'">'+(state.readerFocus?'退出专注':'专注阅读')+'</button></div></div>';
    result+='<header class="reader-header"><div class="reader-kicker">'+escape(n.sourceLabel||n.zoneDisplayName||'闪记内容')+'</div>'+
      '<h2>'+escape(n.title||'无标题闪记')+'</h2>'+
      '<div class="reader-byline">'+(n.author?'<span>'+escape(n.author)+'</span>':'')+
      '<span>'+escape(dateLabel(n.sourcePublishedAt||n.createdAt||n.updatedAt))+'</span>'+
      (n.projectName?'<span>'+escape(n.projectName)+'</span>':'')+'</div></header>';
    result+='<div class="reader-actions"><button id="detailEdit" class="primary" type="button">编辑内容</button>'+
      '<button id="detailFull" class="soft-button" type="button">高级编辑</button>'+
      '<button id="detailAi" class="soft-button" type="button">✳ AI 整理</button>'+
      '<button id="detailDelete" class="reader-danger" type="button">移至最近删除</button>'+
      (source?'<a class="source-link" href="'+escape(source)+'" target="_blank" rel="noopener noreferrer">查看来源原文 ↗</a>':'')+
      '</div>';
    // Article first: summaries never replace or precede the original.
    result+='<article class="reader-article" aria-label="正文原文">'+blocks.map(readerBlock).join('')+
      (!blocks.length && n.originalText?'<p class="reader-paragraph">'+escape(n.originalText)+'</p>':'')+
      (!blocks.length&&!n.originalText?'<div class="empty">尚无正文，可点击「编辑内容」添加。</div>':'')+'</article>';
    for(const a of n.attachments||[]){
      if(a.type==='IMAGE'&&represented.has(Number(a.id)))continue;
      const link=safeMedia(a.downloadUrl||a.inlineUrl);
      const inline=safeMedia(a.inlineUrl||a.downloadUrl);
      if(!link)continue;
      const mime=String(a.mimeType||'').toLowerCase();
      result+='<section class="reader-attachment">';
      if(mime.startsWith('image/')&&inline)result+='<figure class="reader-figure"><img src="'+escape(inline)+'" alt="'+escape(a.name||'附件图片')+'" loading="lazy"></figure>';
      else if(mime.startsWith('video/')&&inline)result+='<video class="inline-media" controls preload="metadata" playsinline src="'+escape(inline)+'"></video>';
      else if(mime.startsWith('audio/')&&inline)result+='<audio class="inline-media" controls preload="metadata" src="'+escape(inline)+'"></audio>';
      result+='<div class="reader-attachment-label"><span>附件</span><a href="'+escape(link)+'" target="_blank" rel="noopener noreferrer">'+escape(a.name||'未命名附件')+'</a><small>'+escape(a.sizeLabel||'')+'</small></div></section>';
    }
    if(n.articleSummaryText||n.aiSummary)result+='<details class="reader-summary"><summary>阅读 AI 摘要 <span>展开 / 收起</span></summary><div>'+escape(n.articleSummaryText||n.aiSummary)+'</div></details>';
    if(n.originalText&&blocks.length)result+='<details class="reader-original"><summary>查看原始记录</summary><div>'+escape(n.originalText)+'</div></details>';
    result+='<footer class="reader-footer"><button id="readerPrev" type="button" '+(previous?'':'disabled')+'>← 上一篇'+(previous?' · '+escape(previous.title||'无标题'):'')+'</button>'+
      '<button id="readerNext" type="button" '+(next?'':'disabled')+'>下一篇'+(next?' · '+escape(next.title||'无标题'):'')+' →</button></footer></div>';
    $('noteDetail').innerHTML=result;
    const layout=$('screen-library').querySelector('.library-layout');
    if(layout)layout.classList.toggle('reading-focus',state.readerFocus);
    $('readerFocus').onclick=()=>{state.readerFocus=!state.readerFocus;renderNoteDetail();$('noteDetail').scrollTop=0;};
    $('readerSmaller').onclick=()=>{state.readerFont=Math.max(.85,Math.round((state.readerFont-.1)*100)/100);renderNoteDetail();};
    $('readerLarger').onclick=()=>{state.readerFont=Math.min(1.45,Math.round((state.readerFont+.1)*100)/100);renderNoteDetail();};
    $('readerPrev').onclick=()=>{if(previous)openNote(previous.id);};
    $('readerNext').onclick=()=>{if(next)openNote(next.id);};
    $('detailEdit').onclick=()=>openNoteEditor(n);
    $('detailFull').onclick=()=>window.open(authUrl('/workbench'),'_blank','noopener');
    $('detailAi').onclick=async()=>{
      if(!n.aiEnabled){toast('手机尚未启用 AI 服务');return;}
      $('detailAi').disabled=true;
      try{await post('/api/note/run-ai',{id:n.id,expectedUpdatedAt:n.updatedAt});toast('已提交 AI 整理，可稍后刷新查看结果');}
      catch(e){toast('整理失败：'+e.message);}
      finally{$('detailAi').disabled=false;}
    };
    $('detailDelete').onclick=()=>deleteNote(n.id);
  }
  async function newNote() {
    try {
      const result=await post('/api/note/create');
      await bootstrap(true);
      await openNote(result.id);
      if(state.note)openNoteEditor(state.note);
    } catch(e) { toast('新建失败：'+e.message); }
  }
  function fillOptions(element, items, first) {
    element.replaceChildren();
    const choose=(value,label)=>{
      const option=document.createElement('option');
      option.value=String(value);option.textContent=label;element.append(option);
    };
    if(first)choose('',first);
    for(const i of items)choose(i.id,i.name);
  }
  function openNoteEditor(note) {
    state.noteDraft={...note,blocks:(note.blocks||[]).map(b=>({...b})),tagIds:[...(note.tagIds||[])]};
    $('noteDialogTitle').textContent='编辑内容';
    $('editNoteTitle').value=note.title||'';
    $('editNoteAuthor').value=note.author||'';
    $('noteAuthorWrap').hidden=!note.showAuthor;
    $('editNoteZone').value=note.zone||'WORK';
    fillOptions($('editNoteProject'),state.projects,'不关联项目');
    $('editNoteProject').value=note.projectId==null?'':String(note.projectId);
    fillOptions($('editNoteTags'),state.data?.tags||[]);
    for(const o of $('editNoteTags').options)o.selected=state.noteDraft.tagIds.includes(Number(o.value));
    renderNoteBlockEditor();
    $('noteUploadFiles').value='';
    $('noteDialog').showModal();
  }
  function renderNoteBlockEditor() {
    const root=$('noteBlockEditor');root.replaceChildren();
    const blocks=state.noteDraft?.blocks||[];
    blocks.forEach((b,i)=>{
      const wrap=document.createElement('div');
      if(b.type==='IMAGE'||b.type==='DIVIDER'){
        wrap.className='block-preserved';
        wrap.textContent=b.type==='IMAGE'?'图片 · 保留原图及位置':'分隔线';
      }else{
        wrap.className='block-line';
        const label=document.createElement('label');
        label.textContent=({HEADING:'小标题',QUOTE:'引用',CODE:'代码',RICH:'富文本'})[b.type]||'正文段落';
        const input=document.createElement('textarea');
        input.rows=Math.min(12,Math.max(3,Math.ceil(String(b.text||'').length/55)));
        input.value=b.text||'';
        input.addEventListener('input',()=>{
          b.text=input.value;
          // A changed paragraph should not be overwritten by its older HTML representation.
          b.html='';
        });
        wrap.append(label,input);
      }
      root.append(wrap);
    });
    if(!blocks.length)root.innerHTML='<div class="empty">尚无正文，可以添加段落。</div>';
  }
  async function saveNote(event) {
    event.preventDefault();
    const draft=state.noteDraft;
    if(!draft||state.noteBusy)return;
    const title=$('editNoteTitle').value.trim();
    if(!title){toast('请填写标题');return;}
    state.noteBusy=true;$('saveNoteButton').disabled=true;
    try {
      const result=await post('/api/note/save',{
        id:draft.id,expectedUpdatedAt:draft.updatedAt,title,
        author:$('editNoteAuthor').value,
        blocks:draft.blocks,tagIds:[...$('editNoteTags').selectedOptions].map(x=>Number(x.value)),
        zone:$('editNoteZone').value,customZoneId:draft.customZoneId||null,
        projectId:$('editNoteProject').value?Number($('editNoteProject').value):null,
        todo:{
          isTodo:!!draft.isTodo,isDone:!!draft.isDone,dueAt:draft.dueAt||null,
          dueHasTime:!!draft.dueHasTime,parentTodoId:draft.parentTodoId||null
        }
      });
      $('noteDialog').close();state.noteDraft=null;
      await bootstrap(true);await openNote(result.id||draft.id);toast('已保存到手机');
    }catch(e){
      toast(e.status===409?'手机端内容发生变化，为防止覆盖请先复制修改的内容再刷新':'保存失败：'+e.message);
    }finally{state.noteBusy=false;$('saveNoteButton').disabled=false;}
  }
  async function uploadNoteFiles() {
    const draft=state.noteDraft,files=Array.from($('noteUploadFiles').files||[]);
    if(!draft||!files.length||state.fileBusy)return;
    // Loading a new attachment changes the phone document. Never allow a subsequent
    // save of a stale editor snapshot to silently remove the newly added image blocks.
    if(!confirm('上传后将从手机重新载入这条闪记。请先保存已编辑的正文，再执行上传。确定继续？'))return;
    state.fileBusy=true;$('noteUploadButton').disabled=true;
    try{
      const fd=new FormData();files.forEach(f=>fd.append('files',f,f.name));
      const result=await api('/api/note/upload?id='+encodeURIComponent(draft.id),{method:'POST',body:fd});
      toast('已上传 '+(result.count||files.length)+' 个附件，重新载入内容');
      const n=await api('/api/note?id='+encodeURIComponent(draft.id));
      // Discard the stale snapshot immediately and reopen the freshly saved phone record.
      $('noteDialog').close();state.noteDraft=null;state.note=n;await bootstrap(true);renderNoteDetail();
      $('noteUploadFiles').value='';
    }catch(e){toast('上传失败：'+e.message);}
    finally{state.fileBusy=false;$('noteUploadButton').disabled=false;}
  }
  async function deleteNote(id) {
    if(!confirm('将此内容移至手机的最近删除？'))return;
    try{
      await post('/api/note/delete',{id});
      state.note=null;state.noteId=null;
      $('noteDetail').innerHTML='<div class="empty">已移至最近删除</div>';
      await bootstrap(true);toast('已移至最近删除');
    }catch(e){toast('删除失败：'+e.message);}
  }
  function startOfWeek() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const day = (today.getDay()+6)%7;
    today.setDate(today.getDate()-day+state.weekOffset*7);
    return today;
  }
  function taskDate(task) { return task.plannedAt || task.dueAt || null; }
  function weekCard(task, inPool = false) {
    const time = taskDate(task), timeText = task.hasTime && time
      ? new Date(Number(time)).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}) : '';
    const drag = !task.isDone ? ' draggable="true" data-drag-task="'+escape(task.id)+'"' : '';
    return '<div class="week-task'+(task.isDone?' done':'')+(inPool?' pool-task':'')+'"'+drag+'>'+
      '<input type="checkbox" data-task-done="'+escape(task.id)+'" '+(task.isDone?'checked':'')+' aria-label="标记'+(task.isDone?'未完成':'完成')+'">'+
      '<button type="button" class="week-task-content" data-task-edit="'+escape(task.id)+'" title="'+escape(task.title)+'"><span class="week-task-title">'+escape(task.title)+'</span>'+
      ((timeText||task.projectName)?'<span class="week-task-meta">'+(timeText?escape(timeText)+' · ':'')+escape(task.projectName||'')+'</span>':'')+
      '</button></div>';
  }
  function renderTasks() {
    const project=state.projects.find(p=>p.id===state.taskProjectId);
    $('taskProjectScope').hidden=!project;
    $('taskProjectName').textContent=project?.name||'';
    const filtered=state.tasks.filter(t=>
      (!state.taskProjectId||t.projectId===state.taskProjectId) &&
      (state.taskZone==='ALL'||t.zone===state.taskZone) &&
      (state.taskFilter==='all'||(state.taskFilter==='done'?t.isDone:!t.isDone)));
    const monday=startOfWeek(),today=dayKey(Date.now()),days=Array.from({length:7},(_,i)=>{
      const d=new Date(monday);d.setDate(monday.getDate()+i);
      return {date:d,key:dayKey(d.getTime()),weekday:['周一','周二','周三','周四','周五','周六','周日'][i]};
    });
    const last=days[6].date;
    $('weekRange').textContent=monday.getFullYear()===last.getFullYear()&&monday.getMonth()===last.getMonth()
      ? (monday.getMonth()+1)+'月'+monday.getDate()+'日 — '+last.getDate()+'日'
      : (monday.getMonth()+1)+'月'+monday.getDate()+'日 — '+(last.getMonth()+1)+'月'+last.getDate()+'日';
    const maxCards=5;
    $('weekCalendar').innerHTML=days.map(day=>{
      const scheduled=filtered.filter(t=>dayKey(taskDate(t))===day.key).sort((a,b)=>
        Number(!!a.isDone)-Number(!!b.isDone) || Number(!!b.hasTime)-Number(!!a.hasTime) ||
        Number(taskDate(a)||0)-Number(taskDate(b)||0));
      const expanded=state.expandedWeekDay===day.key;
      const visible=expanded?scheduled:scheduled.slice(0,maxCards);
      return '<div class="week-day'+(day.key===today?' is-today':'')+'" data-week-drop="'+day.key+'">'+
        '<div class="week-day-header"><span>'+day.weekday+'</span><strong>'+day.date.getDate()+'</strong>'+
        '<span class="week-day-count">'+scheduled.length+' 项</span></div>'+
        '<div class="week-day-body">'+visible.map(t=>weekCard(t)).join('')+
        (scheduled.length>maxCards?'<button type="button" class="week-more" data-expand-day="'+day.key+'">'+
          (expanded?'收起':'还有 '+(scheduled.length-maxCards)+' 项')+'</button>':'')+
        '<button class="week-add" data-add-day="'+day.key+'" type="button" aria-label="'+day.weekday+' 新建待办">＋ 添加</button></div></div>';
    }).join('');
    const todayZero=new Date();todayZero.setHours(0,0,0,0);
    const overdue=filtered.filter(t=>!t.isDone && t.dueAt != null && Number(t.dueAt)<todayZero.getTime())
      .sort((a,b)=>Number(a.dueAt)-Number(b.dueAt));
    const undated=filtered.filter(t=>!t.isDone && !taskDate(t)).sort((a,b)=>Number(b.updatedAt)-Number(a.updatedAt));
    const poolSection=(name,subtitle,items,kind)=>'<section class="inbox-section"><div class="inbox-head"><strong>'+name+
      '</strong><span class="inbox-count">'+items.length+'</span></div><p class="inbox-sub">'+subtitle+'</p>'+
      (items.length?items.map(t=>weekCard(t,true)).join(''):'<p class="inbox-empty">'+(kind==='late'?'没有逾期事项':'所有事项均已安排')+'</p>')+'</section>';
    $('taskInbox').innerHTML='<div class="inbox-title"><strong>待办池</strong><span>集中处理遗漏事项</span></div>'+
      poolSection('逾期未完成','优先重新安排',overdue,'late')+
      poolSection('未安排日期','可拖动到左侧日期',undated,'none')+
      (state.taskFilter==='done'?'<p class="inbox-sub">已完成事项在对应日期中查看</p>':'');
    $('taskCount').textContent='本周 '+filtered.filter(t=>dayKey(taskDate(t))>=days[0].key&&dayKey(taskDate(t))<=days[6].key).length+' 项 · 待办池 '+(overdue.length+undated.length)+' 项';
    const workspace=$('screen-tasks');
    workspace.querySelectorAll('[data-task-done]').forEach(el=>el.onchange=()=>taskToggle(Number(el.dataset.taskDone),el.checked));
    workspace.querySelectorAll('[data-task-edit]').forEach(el=>el.onclick=()=>editTask(Number(el.dataset.taskEdit)));
    workspace.querySelectorAll('[data-add-day]').forEach(b=>b.onclick=()=>{
      editTask(null);$('editTaskDate').value=b.dataset.addDay;
    });
    workspace.querySelectorAll('[data-expand-day]').forEach(b=>b.onclick=()=>{
      state.expandedWeekDay=state.expandedWeekDay===b.dataset.expandDay?'':b.dataset.expandDay;renderTasks();
    });
    workspace.querySelectorAll('[data-drag-task]').forEach(card=>{
      card.ondragstart=e=>{e.dataTransfer.setData('text/plain',card.dataset.dragTask);e.dataTransfer.effectAllowed='move';};
    });
    workspace.querySelectorAll('[data-week-drop]').forEach(day=>{
      day.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';day.classList.add('drop-ready');};
      day.ondragleave=()=>day.classList.remove('drop-ready');
      day.ondrop=e=>{e.preventDefault();day.classList.remove('drop-ready');
        const id=Number(e.dataTransfer.getData('text/plain'));
        if(Number.isInteger(id)&&id>0)moveTaskToDay(id,day.dataset.weekDrop);
      };
    });
  }
  async function moveTaskToDay(id,date) {
    if(state.taskBusy)return;
    const task=state.tasks.find(t=>t.id===id);
    if(!task||task.isDone||!date)return;
    const existing=taskDate(task),time=task.hasTime&&existing?new Date(existing):null;
    const hour=time?String(time.getHours()).padStart(2,'0'):'00';
    const minute=time?String(time.getMinutes()).padStart(2,'0'):'00';
    const timestamp=new Date(date+'T'+hour+':'+minute+':00').getTime();
    if(!Number.isFinite(timestamp)||dayKey(timestamp)!==date)return;
    state.taskBusy=true;
    try {
      await post('/api/task/save',{id,plannedAt:timestamp,dueAt:timestamp,hasTime:!!task.hasTime});
      await bootstrap(true);toast('已安排到 '+date);
    } catch(e) { toast('调整日期失败：'+e.message); }
    finally {state.taskBusy=false;}
  }
  function editTask(id) {
    const task=id?state.tasks.find(x=>x.id===id):null;
    state.taskDraft=task?{...task}:null;
    $('taskDialogTitle').textContent=task?'编辑待办':'新建待办';
    $('editTaskTitle').value=task?.title||'';
    $('editTaskDescription').value=task?.description||'';
    const time=task?.plannedAt||task?.dueAt||null;
    $('editTaskDate').value=time?dayKey(time):'';
    $('editTaskTime').value=task?.hasTime&&time?new Date(time).toTimeString().slice(0,5):'';
    fillOptions($('editTaskProject'),state.projects,'不关联项目');
    $('editTaskProject').value=(task?.projectId??(!task?state.taskProjectId:null))==null?'':String(task?.projectId??state.taskProjectId);
    $('taskDialog').showModal();
  }
  async function saveTask(event) {
    event.preventDefault();
    const title=$('editTaskTitle').value.trim();
    if(!title){toast('请填写待办事项');return;}
    if(state.taskBusy)return;
    state.taskBusy=true;$('saveTaskButton').disabled=true;
    const d=$('editTaskDate').value,t=$('editTaskTime').value;
    const timestamp=d?new Date(d+'T'+(t||'00:00')+':00').getTime():null;
    if(d&&!Number.isFinite(timestamp)){toast('日期无效');state.taskBusy=false;$('saveTaskButton').disabled=false;return;}
    const payload={
      title,description:$('editTaskDescription').value.trim(),
      projectId:$('editTaskProject').value?Number($('editTaskProject').value):null,
      plannedAt:timestamp,dueAt:timestamp,hasTime:!!t
    };
    if(state.taskDraft)payload.id=state.taskDraft.id;
    try{
      await post(state.taskDraft?'/api/task/save':'/api/task/create',payload);
      $('taskDialog').close();state.taskDraft=null;await bootstrap(true);
      toast('待办已保存到手机');
    }catch(e){toast('保存失败：'+e.message);}
    finally{state.taskBusy=false;$('saveTaskButton').disabled=false;}
  }
  async function taskToggle(id,done) {
    try{await post('/api/task/toggle',{id,done});await bootstrap(true);toast(done?'已完成':'已恢复待办');}
    catch(e){await bootstrap(true);toast('操作失败：'+e.message);}
  }
  async function taskDelete(id) {
    if(!confirm('将这项待办移至手机最近删除？'))return;
    try{await post('/api/task/delete',{id});await bootstrap(true);toast('已移至最近删除');}
    catch(e){toast('删除失败：'+e.message);}
  }

  function renderProjects() {
    const root=$('projectList');
    const projects=state.projects.filter(p=>state.projectFilter==='ALL'||p.status===state.projectFilter);
    const statusText={ACTIVE:'进行中',PAUSED:'暂停',COMPLETED:'已完成'};
    root.innerHTML=projects.length?projects.map(p=>{
      const tasks=state.tasks.filter(t=>t.projectId===p.id);
      const notes=state.notes.filter(n=>n.projectId===p.id);
      const done=tasks.filter(t=>t.isDone).length;
      return '<article class="project-row"><div class="project-info"><strong>'+escape(p.name)+'</strong><span class="tiny-muted">'+escape(statusText[p.status]||p.status)+' · '+notes.length+' 条内容 · '+done+'/'+tasks.length+' 项待办</span>'+
        (p.description?'<p>'+escape(p.description)+'</p>':'')+'</div><div class="project-ops"><button type="button" class="soft-button" data-project-notes="'+escape(p.id)+'">关联内容</button><button type="button" class="soft-button" data-project-tasks="'+escape(p.id)+'">关联待办</button><button type="button" class="outline-button" data-project-edit="'+escape(p.id)+'">编辑</button></div></article>';
    }).join(''):'<div class="empty">暂无相关项目，可以创建新项目。</div>';
    root.querySelectorAll('[data-project-edit]').forEach(b=>b.onclick=()=>editProject(Number(b.dataset.projectEdit)));
    root.querySelectorAll('[data-project-tasks]').forEach(b=>b.onclick=()=>{
      state.taskProjectId=Number(b.dataset.projectTasks);
      state.taskFilter='all';
      document.querySelectorAll('[data-taskfilter]').forEach(el=>el.classList.toggle('active',el.dataset.taskfilter==='all'));
      navigate('tasks');
    });
    root.querySelectorAll('[data-project-notes]').forEach(b=>b.onclick=()=>{
      state.noteProjectId=Number(b.dataset.projectNotes);
      navigate('library');
    });
  }
  function editProject(id) {
    const p=id?state.projects.find(x=>x.id===id):null;
    state.projectDraft=p?{...p}:null;
    $('projectDialogTitle').textContent=p?'编辑项目':'新建项目';
    $('editProjectName').value=p?.name||'';
    $('editProjectDescription').value=p?.description||'';
    $('editProjectZone').value=p?.zone||'WORK';
    $('editProjectStatus').value=p?.status||'ACTIVE';
    $('editProjectStatus').disabled=!p;
    $('deleteProject').hidden=!p;
    $('projectDialog').showModal();
  }
  async function saveProject(event) {
    event.preventDefault();
    if(state.projectBusy)return;
    const name=$('editProjectName').value.trim();
    if(!name){toast('请填写项目名称');return;}
    const draft=state.projectDraft;
    const body={name,description:$('editProjectDescription').value.trim(),zone:$('editProjectZone').value};
    if(draft)Object.assign(body,{id:draft.id,expectedUpdatedAt:draft.updatedAt,status:$('editProjectStatus').value});
    state.projectBusy=true;$('saveProject').disabled=true;
    try{
      await post(draft?'/api/project/update':'/api/project/create',body);
      $('projectDialog').close();state.projectDraft=null;
      await bootstrap(true);toast('项目已保存到手机');
    }catch(e){toast(e.status===409?'手机项目已更新，请刷新数据后重新编辑':'项目保存失败：'+e.message);}
    finally{state.projectBusy=false;$('saveProject').disabled=false;}
  }
  async function deleteProject() {
    const draft=state.projectDraft;
    if(!draft||state.projectBusy)return;
    if(!confirm('确定删除「'+draft.name+'」？关联的内容和待办会保留，但将不再属于此项目。'))return;
    state.projectBusy=true;$('deleteProject').disabled=true;
    try{
      await post('/api/project/delete',{id:draft.id,expectedUpdatedAt:draft.updatedAt});
      $('projectDialog').close();state.projectDraft=null;
      await bootstrap(true);toast('项目已删除，关联记录已保留');
    }catch(e){toast('删除失败：'+e.message);}
    finally{state.projectBusy=false;$('deleteProject').disabled=false;}
  }

  // Minimal safe Markdown reader: escape HTML before creating headings and emphasis.
  // Do not interpret embedded HTML, scripts, raw links or arbitrary attributes from AI output.
  function renderReviewText(raw) {
    const lines=String(raw||'').replace(/\r/g,'').split('\n');
    const bold=s=>escape(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    let out='',inList=false;
    for(const line of lines){
      const t=line.trim();
      const heading=t.match(/^(#{1,4})\s+(.+)$/);
      const bullet=t.match(/^[-*]\s+(.+)$/);
      const numbered=t.match(/^\d+[.)]\s+(.+)$/);
      if(heading){if(inList){out+='</ul>';inList=false;}out+='<h'+Math.min(heading[1].length+1,4)+'>'+bold(heading[2])+'</h'+Math.min(heading[1].length+1,4)+'>';continue;}
      if(bullet||numbered){if(!inList){out+='<ul>';inList=true;}out+='<li>'+bold((bullet||numbered)[1])+'</li>';continue;}
      if(inList){out+='</ul>';inList=false;}
      if(!t){continue;}
      out+='<p>'+bold(t)+'</p>';
    }
    return out+(inList?'</ul>':'');
  }
  function reviewParams() {
    let q=new URLSearchParams({period:state.reviewPeriod,scope:state.reviewScope});
    if(state.reviewPeriod==='MONTHLY')q.set('month',$('reviewMonth').value);
    if(state.reviewPeriod==='YEARLY')q.set('year',$('reviewYear').value);
    return q;
  }
  async function loadReview() {
    if(!state.connected)return;
    try{
      const p=reviewParams();
      state.review=await api('/api/review?'+p.toString());
      const r=state.review,m=r.metrics||{};
      $('reviewStats').innerHTML=[['记录',m.notes||0],['待办',m.todos||0],['API 调用',m.apiCalls||0],['Token',m.apiTokens||0]]
        .map(([l,v])=>'<div class="stat"><strong>'+escape(v)+'</strong><span>'+escape(l)+'</span></div>').join('');
      $('reviewLocal').innerHTML=renderReviewText(r.localText||'没有记录');
      $('reviewAi').innerHTML=renderReviewText(r.aiText||'还没有生成智能回顾');
      $('reviewGenerate').disabled=!r.aiEnabled;
    }catch(e){toast('回顾加载失败：'+e.message);}
  }
  async function generateReview() {
    if(!state.review?.aiEnabled){toast('手机尚未启用智能能力');return;}
    if(!confirm('按手机的真实数据生成智能回顾？'))return;
    $('reviewGenerate').disabled=true;$('reviewGenerate').textContent='生成中…';
    try{
      const p=Object.fromEntries(reviewParams().entries());
      await post('/api/review/generate',p);
      await loadReview();toast('智能回顾已更新');
    }catch(e){toast('生成失败：'+e.message);}
    finally{$('reviewGenerate').disabled=false;$('reviewGenerate').textContent='✳ 生成智能回顾';}
  }

  async function renderSearch() {
    const q=$('globalQuery').value.trim(),root=$('searchResults'),requested=++state.searchRequest;
    if(!q){root.innerHTML='<div class="empty">输入关键词，从手机统一搜索索引查找记录。</div>';return;}
    root.innerHTML='<div class="empty">正在搜索手机记录…</div>';
    try{
      const response=await api('/api/search?q='+encodeURIComponent(q)+'&limit=80');
      if(requested!==state.searchRequest)return;
      const items=response.items||[];
      const kind={CONTENT:'内容',TASK:'待办',PROJECT:'项目',CONVERSATION:'对话',REVIEW:'回顾',IMAGE:'图片'};
      root.innerHTML=items.length?items.map((x,i)=>
        '<button type="button" class="search-result" data-result="'+i+'"><span class="result-type">'+escape(kind[x.type]||x.type)+' · '+escape(x.metaLabel||'')+'</span><strong>'+escape(x.title||'无标题')+'</strong><p>'+escape(x.snippet||'')+'</p></button>'
      ).join(''):'<div class="empty">手机未找到相关内容。也可以在「闪记一下 → 提问」进一步检索。</div>';
      root.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{
        const x=items[Number(b.dataset.result)];
        if(x.noteId){navigate('library');openNote(Number(x.noteId));}
        else if(x.taskId){navigate('tasks');editTask(Number(x.taskId));}
        else if(x.projectId){navigate('projects');editProject(Number(x.projectId));}
        else if(x.messageId){state.chatTargetId=Number(x.messageId);navigate('chat');}
        else if(x.type==='REVIEW'){navigate('review');}
      });
    }catch(e){if(requested===state.searchRequest)root.textContent='搜索失败：'+e.message;}
  }
  async function loadGallery(reset) {
    if(!state.connected||state.galleryBusy)return;
    state.galleryBusy=true;
    try {
      const status=await api('/api/gallery/status');
      if(!status.sharingEnabled||!status.permissionGranted){
        $('galleryInfo').textContent='手机尚未授权共享相册，请在手机「闪记互联」里开启。';
        $('galleryGrid').replaceChildren();$('galleryMore').hidden=true;return;
      }
      if(reset){state.galleryOffset=0;state.gallery=[];}
      const result=await api('/api/gallery/photos?offset='+state.galleryOffset+'&limit=60');
      const batch=result.items||[];
      state.gallery.push(...batch);state.galleryOffset+=batch.length;state.galleryMore=!!result.hasMore;
      $('galleryInfo').textContent='已读取 '+state.gallery.length+' 张照片';
      $('galleryGrid').innerHTML=state.gallery.map(p=>'<a class="media-item" target="_blank" rel="noopener" href="'+escape(authUrl('/api/gallery/original?id='+p.id))+'"><img loading="lazy" alt="'+escape(p.name||'手机照片')+'" src="'+escape(authUrl('/api/gallery/thumbnail?id='+p.id+'&edge=420'))+'"></a>').join('');
      $('galleryMore').hidden=!state.galleryMore;
    } catch(e){$('galleryInfo').textContent='相册读取失败：'+e.message;}
    finally{state.galleryBusy=false;}
  }
  async function uploadFiles() {
    const files=Array.from($('uploadFiles').files||[]);
    if(!files.length){toast('请先选择文件');return;}
    if(state.fileBusy)return;
    state.fileBusy=true;$('uploadSend').disabled=true;$('uploadFeedback').textContent='正在发送…';
    try{
      const fd=new FormData();files.forEach(f=>fd.append('files',f,f.name));
      await api('/files',{method:'POST',body:fd});
      $('uploadFiles').value='';$('uploadFileCount').textContent='尚未选择文件';$('uploadFeedback').textContent='已发送到手机闪记接收区';toast('文件已发送到手机');
      await bootstrap(true);
    }catch(e){$('uploadFeedback').textContent='发送失败：'+e.message;toast('发送失败');}
    finally{state.fileBusy=false;$('uploadSend').disabled=false;}
  }
  function bind() {
    $('connectHost').textContent=location.host?'手机地址：'+location.host:'请在手机「闪记互联」中复制网址';
    $('connectCode').value=/^\d{6}$/.test(state.code)?state.code:'';
    $('connectForm').onsubmit=(e)=>{e.preventDefault();connect();};
    document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
    document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
    document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
    $('mobileNavButton').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
    $('disconnectButton').onclick=()=>{
      session.remove('shanji-web-session');state.code='';state.connected=false;
      $('appShell').hidden=true;$('connectScreen').hidden=false;$('connectCode').value='';
      $('connectError').textContent='已断开本次连接';
    };
    $('refreshButton').onclick=()=>bootstrap().catch(e=>showFailure(e.message));
    $('chatRefresh').onclick=loadChat;
    $('chatSend').onclick=sendChat;
    $('clarifyForm').onsubmit=submitClarification;
    const modePlaceholders={
      SMART:'写下想法、工作记录、待办，或者粘贴一段内容…',
      CONTENT:'记下需要保留的正文内容…',
      TASK:'描述待办事项和需要跟进的工作…',
      WEB:'粘贴小红书、微信公众号或其他网页链接…',
      QUESTION:'问问手机里已经保存的内容和待办…'
    };
    document.querySelectorAll('[data-input-mode]').forEach(button => {
      button.addEventListener('click',()=>{
        state.chatMode=button.dataset.inputMode;
        document.querySelectorAll('[data-input-mode]').forEach(b=>b.classList.toggle('active',b===button));
        $('chatInput').placeholder=modePlaceholders[state.chatMode];
        $('chatInput').focus();
      });
    });
    $('chatInput').oninput=updateChatDraft;
    $('chatInput').onkeydown=e=>{
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.altKey){
        e.preventDefault();sendChat();
      }
    };
    updateChatDraft();
    $('libraryQuery').oninput=e=>{state.noteQuery=e.target.value;renderLibrary();if(state.note&&!filteredNotes().some(n=>n.id===state.note.id)&&state.readerFocus){state.readerFocus=false;const layout=$('screen-library').querySelector('.library-layout');layout?.classList.remove('reading-focus');}};
    $('clearLibraryProject').onclick=()=>{state.noteProjectId=null;renderLibrary();};
    $('clearTaskProject').onclick=()=>{state.taskProjectId=null;renderTasks();};
    document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{
      state.kind=b.dataset.kind;
      document.querySelectorAll('[data-kind]').forEach(el=>el.classList.toggle('active',el===b));
      renderLibrary();
    });
    $('newNote').onclick=newNote;
    $('noteForm').onsubmit=saveNote;
    $('addNoteParagraph').onclick=()=>{
      if(!state.noteDraft)return;
      state.noteDraft.blocks.push({type:'PARAGRAPH',text:''});renderNoteBlockEditor();
      const items=$('noteBlockEditor').querySelectorAll('textarea');items[items.length-1]?.focus();
    };
    $('noteUploadButton').onclick=uploadNoteFiles;
    $('newTask').onclick=()=>editTask(null);
    $('weekPrev').onclick=()=>{state.weekOffset--;state.expandedWeekDay='';renderTasks();};
    $('weekNext').onclick=()=>{state.weekOffset++;state.expandedWeekDay='';renderTasks();};
    $('weekToday').onclick=()=>{state.weekOffset=0;state.expandedWeekDay='';renderTasks();};
    document.querySelectorAll('[data-taskzone]').forEach(b=>b.onclick=()=>{
      state.taskZone=b.dataset.taskzone;
      document.querySelectorAll('[data-taskzone]').forEach(el=>el.classList.toggle('active',el===b));
      renderTasks();
    });
    $('newProject').onclick=()=>editProject(null);
    $('projectForm').onsubmit=saveProject;
    $('deleteProject').onclick=deleteProject;
    document.querySelectorAll('[data-project-filter]').forEach(b=>b.onclick=()=>{state.projectFilter=b.dataset.projectFilter;document.querySelectorAll('[data-project-filter]').forEach(el=>el.classList.toggle('active',el===b));renderProjects();});
    $('taskForm').onsubmit=saveTask;
    document.querySelectorAll('[data-taskfilter]').forEach(b=>b.onclick=()=>{
      state.taskFilter=b.dataset.taskfilter;
      document.querySelectorAll('[data-taskfilter]').forEach(el=>el.classList.toggle('active',el===b));
      renderTasks();
    });
    const now=new Date();$('reviewMonth').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    $('reviewYear').value=now.getFullYear();
    document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{
      state.reviewPeriod=b.dataset.period;
      document.querySelectorAll('[data-period]').forEach(el=>el.classList.toggle('active',el===b));
      $('reviewMonth').hidden=state.reviewPeriod!=='MONTHLY';$('reviewYear').hidden=state.reviewPeriod!=='YEARLY';
      loadReview();
    });
    document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{
      state.reviewScope=b.dataset.scope;
      document.querySelectorAll('[data-scope]').forEach(el=>el.classList.toggle('active',el===b));
      loadReview();
    });
    $('reviewMonth').onchange=loadReview;$('reviewYear').onchange=loadReview;
    $('reviewGenerate').onclick=generateReview;
    $('copyReview').onclick=()=>{
      const text=$('reviewLocal').textContent;
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('已复制')).catch(()=>toast('请手动选择复制'));
      else toast('请手动选择复制');
    };
    $('globalQuery').oninput=renderSearch;
    $('uploadFiles').onchange=()=>{const n=$('uploadFiles').files?.length||0;$('uploadFileCount').textContent=n?n+' 个文件待发送':'尚未选择文件';};
    $('galleryRefresh').onclick=()=>loadGallery(true);
    $('galleryMore').onclick=()=>loadGallery(false);
    $('uploadSend').onclick=uploadFiles;
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&state.connected&&!$('noteDialog').open&&!$('taskDialog').open&&!$('clarifyDialog').open)bootstrap(true).catch(e=>showFailure(e.message));
    });
    setInterval(()=>{
      if(state.connected&&!document.hidden&&!$('noteDialog').open&&!$('taskDialog').open)
        bootstrap(true).catch(e=>showFailure(e.message));
    },45000);
    if(state.code)connect();
  }
  bind();
})();