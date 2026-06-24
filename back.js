const BASE = 'https://api.clickup.com/api/v2';
let allCourses = [], allStatuses = [], memberListId = null;

function getKey() { return document.getElementById('apiKey').value.trim(); }
function showMsg(id, text, type) { const el = document.getElementById(id); el.textContent = text; el.className = 'msg show ' + type; }
function hideMsg(id) { document.getElementById(id).className = 'msg'; }

async function apiFetch(path) {
  const r = await fetch(BASE + path, { headers: { Authorization: getKey() } });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.err || e.error || 'HTTP ' + r.status); }
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: getKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.err || e.error || 'HTTP ' + r.status); }
  return r.json();
}

async function loadWorkspace() {
  if (!getKey()) { showMsg('msg-connect','Cole sua API Key primeiro.','warn'); return; }
  showMsg('msg-connect','Conectando...','info');
  ['section-lists','section-courses','section-members','section-action']
    .forEach(id => document.getElementById(id).classList.add('section-hidden'));
  try {
    const teams = await apiFetch('/team');
    if (!teams.teams?.length) { showMsg('msg-connect','Nenhum workspace encontrado.','error'); return; }
    const teamId = teams.teams[0].id;
    const spaces = await apiFetch(`/team/${teamId}/space?archived=false`);
    let allLists = [];
    for (const sp of spaces.spaces) {
      const fd = await apiFetch(`/space/${sp.id}/folder?archived=false`);
      for (const fo of fd.folders) {
        const ld = await apiFetch(`/folder/${fo.id}/list?archived=false`);
        for (const l of ld.lists) allLists.push({ id: l.id, label: `${sp.name} / ${fo.name} / ${l.name}`, raw: l.name });
      }
      const rd = await apiFetch(`/space/${sp.id}/list?archived=false`);
      for (const l of rd.lists) allLists.push({ id: l.id, label: `${sp.name} / ${l.name}`, raw: l.name });
    }
    if (!allLists.length) { showMsg('msg-connect','Nenhuma lista encontrada.','error'); return; }

    const selC = document.getElementById('sel-courses');
    const selM = document.getElementById('sel-members');
    selC.innerHTML = '<option value="">— selecione a lista de cursos —</option>';
    selM.innerHTML = '<option value="">— selecione a lista de membros —</option>';
    for (const l of allLists) {
      const n = l.raw.toLowerCase();
      selC.appendChild(Object.assign(new Option(l.label, l.id), { selected: n.includes('curso') || n.includes('capacit') }));
      selM.appendChild(Object.assign(new Option(l.label, l.id), { selected: n === 'membros' || n.includes('membro') }));
    }
    document.getElementById('section-lists').classList.remove('section-hidden');
    document.getElementById('num-1').classList.add('done');
    document.getElementById('num-1').textContent = '✓';
    showMsg('msg-connect','Conectado com sucesso!','success');
    if (selC.value) loadCourses();
    if (selM.value) loadMemberStatuses();
  } catch(e) { showMsg('msg-connect','Erro: ' + e.message,'error'); }
}

async function loadCourses() {
  const listId = document.getElementById('sel-courses').value;
  if (!listId) return;
  document.getElementById('section-courses').classList.add('section-hidden');
  allCourses = [];
  try {
    const data = await apiFetch(`/list/${listId}/task?archived=false&page=0`);
    const tasks = data.tasks || [];
    const details = await Promise.all(tasks.map(t => apiFetch(`/task/${t.id}`).catch(() => t)));
    allCourses = details.map(d => ({
      id: d.id, name: d.name, tags: d.tags || [],
      description: d.description || '',
      markdown_description: d.markdown_description || '',
      checklists: d.checklists || []
    }));
    const el = document.getElementById('courses-list');
    document.getElementById('section-courses').classList.remove('section-hidden');
    if (!allCourses.length) { el.innerHTML = '<span class="empty">Nenhuma tarefa encontrada.</span>'; return; }
    document.getElementById('count-courses').textContent = allCourses.length + ' cursos';
    let html = `<label class="select-all-row"><input type="checkbox" onchange="toggleAll('course',this.checked)"> Selecionar todos</label><div class="list-grid">`;
    for (const c of allCourses) {
      const tagHtml = c.tags.map(t => `<span class="tag">${t.name}</span>`).join('');
      const total = c.checklists.reduce((a, cl) => a + (cl.items?.length || 0), 0);
      const badge = total > 0 ? `<span class="checklist-badge">✓ ${total} itens</span>` : '';
      html += `<div class="check-item" id="ci-c-${c.id}">
        <input type="checkbox" class="chk-course" value="${c.id}" onchange="onCheck(this,'ci-c-${c.id}')">
        <label onclick="this.previousElementSibling.click()">${c.name}${tagHtml}${badge}</label>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
    updateSummary();
  } catch(e) { showMsg('msg-lists','Erro ao carregar cursos: ' + e.message,'error'); }
}

async function loadMemberStatuses() {
  const listId = document.getElementById('sel-members').value;
  if (!listId) return;
  memberListId = listId;
  document.getElementById('section-members').classList.add('section-hidden');
  allStatuses = [];
  try {
    const data = await apiFetch(`/list/${listId}`);
    allStatuses = (data.statuses || [])
      .filter(s => s.type !== 'closed')
      .map(s => ({ name: s.status, color: s.color || '#4BAED4' }));
    const el = document.getElementById('members-list');
    document.getElementById('section-members').classList.remove('section-hidden');
    if (!allStatuses.length) { el.innerHTML = '<span class="empty">Nenhum status encontrado.</span>'; return; }
    document.getElementById('count-members').textContent = allStatuses.length + ' membros';
    let html = `<label class="select-all-row"><input type="checkbox" onchange="toggleAll('member',this.checked)"> Selecionar todos</label><div class="list-grid">`;
    for (const s of allStatuses) {
      const sid = s.name.replace(/[^a-zA-Z0-9]/g,'_');
      html += `<div class="check-item" id="ci-m-${sid}">
        <input type="checkbox" class="chk-member" value="${s.name}" onchange="onCheck(this,'ci-m-${sid}')">
        <span class="status-dot" style="background:${s.color}"></span>
        <label onclick="this.previousElementSibling.previousElementSibling.click()">${s.name}</label>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
    updateSummary();
  } catch(e) { showMsg('msg-lists','Erro ao carregar membros: ' + e.message,'error'); }
}

function onCheck(cb, wrapId) {
  const wrap = document.getElementById(wrapId);
  if (wrap) cb.checked ? wrap.classList.add('selected') : wrap.classList.remove('selected');
  updateSummary();
}

function toggleAll(type, checked) {
  document.querySelectorAll(`.chk-${type}`).forEach(c => {
    c.checked = checked;
    const wrap = c.closest('.check-item');
    if (wrap) checked ? wrap.classList.add('selected') : wrap.classList.remove('selected');
  });
  updateSummary();
}

function updateSummary() {
  const nc = document.querySelectorAll('.chk-course:checked').length;
  const nm = document.querySelectorAll('.chk-member:checked').length;
  const sect = document.getElementById('section-action');
  if (nc > 0 && nm > 0) {
    sect.classList.remove('section-hidden');
    document.getElementById('summary').innerHTML =
      `Serão criadas <strong>${nc * nm}</strong> tarefa(s): <strong>${nc}</strong> curso(s) × <strong>${nm}</strong> membro(s). Cada cópia inclui descrição, link e checklist completo.`;
  } else {
    sect.classList.add('section-hidden');
  }
}

async function copyCourses() {
  const selectedCourseIds = [...document.querySelectorAll('.chk-course:checked')].map(c => c.value);
  const selectedStatuses  = [...document.querySelectorAll('.chk-member:checked')].map(c => c.value);
  const courses = allCourses.filter(c => selectedCourseIds.includes(c.id));
  const total = courses.length * selectedStatuses.length;
  let done = 0, errors = 0;
  const log = [];

  document.getElementById('btn-copy').disabled = true;
  document.getElementById('progress-wrap').style.display = '';
  document.getElementById('result-list').innerHTML = '';
  hideMsg('msg-result');

  for (const statusName of selectedStatuses) {
    for (const course of courses) {
      document.getElementById('progress-label').textContent = `Copiando "${course.name}" → "${statusName}"...`;
      try {
        const body = { name: course.name, status: statusName };
        if (course.markdown_description) body.markdown_description = course.markdown_description;
        else if (course.description) body.description = course.description;
        const created = await apiPost(`/list/${memberListId}/task`, body);
        for (const cl of course.checklists) {
          const newCl = await apiPost(`/task/${created.id}/checklist`, { name: cl.name || 'Checklist' });
          const clId = newCl.checklist?.id;
          if (!clId) continue;
          for (const item of (cl.items || []))
            await apiPost(`/checklist/${clId}/checklist_item`, { name: item.name, resolved: false });
        }
        log.push({ ok: true, text: `✓ ${course.name} → ${statusName}` });
      } catch(e) {
        errors++;
        log.push({ ok: false, text: `✗ ${course.name} → ${statusName}: ${e.message}` });
      }
      done++;
      document.getElementById('progress-fill').style.width = Math.round(done / total * 100) + '%';
    }
  }

  document.getElementById('btn-copy').disabled = false;
  document.getElementById('progress-wrap').style.display = 'none';
  document.getElementById('result-list').innerHTML = log.map(l => `<div class="result-item ${l.ok?'ok':'err'}">${l.text}</div>`).join('');
  document.getElementById('num-5').classList.add('done');
  document.getElementById('num-5').textContent = errors === 0 ? '✓' : '!';
  showMsg('msg-result',
    errors === 0 ? `✓ ${done} tarefa(s) duplicada(s) com sucesso!` : `${done - errors} criadas, ${errors} com erro.`,
    errors === 0 ? 'success' : 'warn'
  );
}