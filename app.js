'use strict';
/* =====================================================
   Mis entrenamientos — app.js
   Módulos: Utilidades · Store · Routines · Exercises ·
   Sets · Training · Timer · History · UI/Vistas
   ===================================================== */

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => v === '' ? '' : Number(v);
const fmtDate = t => new Date(t).toLocaleDateString('es-AR', {day:'numeric', month:'short', year:'numeric'});
const fmtTime = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = String(s%60).padStart(2,'0');
  return h ? `${h}:${String(m).padStart(2,'0')}:${x}` : `${m}:${x}`; };
const kg = w => w === '' || w == null ? 'sin peso' : `${w} kg`;
const weightOk = s => s.weight !== '' && s.weight != null && s.weight >= 0;
const doneCount = e => e.sets.filter(s => s.done).length;

let toastT;
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
function ask(title, msg, ok = 'Confirmar', danger = false) { // diálogo de confirmación con opción de cancelar
  return new Promise(res => { const m = $('#modal');
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><p>${esc(msg)}</p>
      <div class="row"><button class="btn ghost" data-m="no">Cancelar</button><button class="btn ${danger?'danger':''}" data-m="ok">${esc(ok)}</button></div></div>`;
    m.hidden = false;
    m.onclick = e => { if (e.target === m || e.target.closest('[data-m]')) { m.hidden = true; res(e.target.dataset.m === 'ok'); } };
  });
}

/* ---------- Persistencia (LocalStorage) ---------- */
const KEY = 'gymapp.v1';
const Store = {
  data: {routines: [], history: [], active: null},
  load() { // devuelve true si ya existían datos
    try { const raw = localStorage.getItem(KEY); if (raw === null) return false;
      const d = JSON.parse(raw); if (d && Array.isArray(d.routines)) this.data = {routines: d.routines, history: d.history || [], active: d.active || null};
    } catch (e) {} return true; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { toast('No se pudo guardar: almacenamiento lleno'); } },
  export() { // descarga una copia de seguridad en JSON
    const blob = new Blob([JSON.stringify(this.data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `entrenamientos-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import(file) { // restaura una copia de seguridad
    return new Promise(res => { const fr = new FileReader();
      fr.onload = () => { try { const d = JSON.parse(fr.result);
        if (!d || !Array.isArray(d.routines)) throw new Error('formato');
        this.data = {routines: d.routines, history: d.history || [], active: d.active || null};
        this.save(); res(true);
      } catch (e) { res(false); } };
      fr.onerror = () => res(false);
      fr.readAsText(file);
    });
  }
};

/* ---------- Series ---------- */
const Sets = {
  add(ex) { ex.sets.push({reps: '', weight: '', done: false}); },
  remove(ex, i) { if (ex.sets.length > 1) ex.sets.splice(i, 1); else toast('Dejá al menos una serie'); }
};

/* ---------- Ejercicios ---------- */
const Exercises = {
  create() { return {id: uid(), name: '', rest: 60, notes: '', sets: [{reps: '', weight: '', done: false}, {reps: '', weight: '', done: false}, {reps: '', weight: '', done: false}]}; }
};

/* ---------- Rutinas ---------- */
const Routines = {
  totalSets: r => r.exercises.reduce((n, e) => n + e.sets.length, 0),
  totalVolume: r => r.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + (s.reps >= 1 && weightOk(s) ? s.reps * s.weight : 0), 0), 0),
  validate(r) {
    if (!r.name.trim()) return 'Poné un nombre a la rutina';
    if (!r.exercises.length) return 'Agregá al menos un ejercicio';
    for (const e of r.exercises) {
      if (!e.name.trim()) return 'Todos los ejercicios necesitan un nombre';
      if (!e.sets.length) return `Agregá al menos una serie a "${e.name}"`;
      for (const s of e.sets) { if (!(s.reps >= 1)) return `Revisá las repeticiones de "${e.name}"`; if (s.weight !== '' && s.weight != null && !(s.weight >= 0)) return `Revisá el peso de "${e.name}"`; }
    }
    return null; },
  save(d) { const r = JSON.parse(JSON.stringify(d)); r.name = r.name.trim(); r.modified = Date.now();
    r.exercises.forEach(e => { e.name = e.name.trim(); e.rest = e.rest === '' ? 0 : +e.rest;
      e.sets.forEach(s => { s.reps = +s.reps; s.weight = s.weight === '' || s.weight == null ? '' : +s.weight; s.done = false; }); });
    const L = Store.data.routines, i = L.findIndex(x => x.id === r.id);
    if (i >= 0) L[i] = r; else { r.id = uid(); L.unshift(r); } Store.save(); },
  remove(id) { Store.data.routines = Store.data.routines.filter(r => r.id !== id); Store.save(); }
};

/* ---------- Historial ---------- */
const History = {
  add(session) { Store.data.history.unshift(session); Store.save(); },
  remove(id) { Store.data.history = Store.data.history.filter(h => h.id !== id); Store.save(); }
};

/* ---------- Temporizador ---------- */
const Timer = {
  id: null,
  start() { this.stop(); this.id = setInterval(() => this.tick(), 250); },
  stop() { clearInterval(this.id); this.id = null; },
  tick() { const a = Store.data.active;
    if (!a) return this.stop();
    const el = $('#elapsed'); if (el && !el.matches('[data-frozen]')) el.textContent = fmtTime((Date.now() - a.start) / 1000);
  }
};

/* ---------- Modo entrenamiento ---------- */
const Training = {
  start(r) { Store.data.active = {routineId: r.id, name: r.name, start: Date.now(),
      exercises: r.exercises.map(e => ({id: e.id, name: e.name, notes: e.notes, rest: e.rest || 0,
        sets: e.sets.map(s => ({reps: s.reps, weight: s.weight, done: false}))}))};
    Store.save(); Timer.start(); UI.go('train'); },
  setDone(ei, si) { const a = Store.data.active; if (!a) return;
    const s = a.exercises[ei] && a.exercises[ei].sets[si]; if (!s) return;
    s.done = !s.done; Store.save(); UI.render(); },
  save() { const a = Store.data.active, r = Store.data.routines.find(x => x.id === a.routineId);
    if (r) { r.exercises = a.exercises.map(e => ({id: e.id || uid(), name: e.name, rest: e.rest || 0, notes: e.notes || '',
      sets: e.sets.map(s => ({reps: +s.reps || 1, weight: s.weight === '' ? '' : +s.weight, done: false}))})); r.modified = Date.now(); }
    a.end = Date.now();
    a.exercises = a.exercises.map(e => ({...e, sets: e.sets.map(s => ({...s, done: true}))}));
    a.id = uid();
    History.add(a);
    Store.data.active = null; Store.save(); Timer.stop(); Editor.draft = null; UI.go('hist');
    toast('Sesión guardada en el historial'); },
  end() { // vuelve al inicio sin guardar (pide confirmación si hubo series completadas)
    const a = Store.data.active;
    if (a && a.exercises.some(e => e.sets.some(s => s.done))) {
      return ask('¿Salir del entrenamiento?', 'Se van a perder las series marcadas que no guardes.', 'Salir', true)
        .then(ok => { if (ok) { Store.data.active = null; Store.save(); Timer.stop(); UI.go('home'); } });
    }
    Store.data.active = null; Store.save(); Timer.stop(); UI.go('home');
  }
};

/* ---------- Editor de rutinas (borrador en memoria) ---------- */
const Editor = {
  draft: null,
  open(id) { const r = Store.data.routines.find(x => x.id === id);
    this.draft = r ? JSON.parse(JSON.stringify(r)) : {id: null, name: '', desc: '', cat: '', exercises: [Exercises.create()]};
    UI.go('edit'); }
};

/* ---------- Vistas ---------- */
const UI = {
  view: 'home', last: null, viewId: null,
  go(v) { this.view = v; window.scrollTo(0, 0); this.render(); },
  render() {
    const y = window.scrollY, V = {home: vHome, edit: vEdit, train: vTrain, hist: vHist, view: vView};
    $('#app').innerHTML = V[this.view]();
    window.scrollTo(0, y);
  }
};

function vHome() {
  const R = Store.data.routines, a = Store.data.active, H = Store.data.history.length;
  return `<h1>Mis entrenamientos</h1><p class="mut">Organizá y registrá tu progreso</p>
  <p class="count"><b>${R.length}</b> ${R.length === 1 ? 'rutina guardada' : 'rutinas guardadas'} · <b>${H}</b> ${H === 1 ? 'sesión' : 'sesiones'}</p>
  <button class="btn" data-act="new" style="margin-bottom:16px">+ Crear rutina</button>
  ${a ? `<div class="card"><b>Entrenamiento en curso</b><p class="mut" style="margin:4px 0 12px">${esc(a.name)}</p><button class="btn" data-act="go" data-id="train">Continuar</button></div>` : ''}
  ${R.length ? R.map(r => `<article class="card rcard"><h2>${esc(r.name)}</h2>
    <p class="mut meta">${r.exercises.length} ejercicios · ${Routines.totalSets(r)} series${Routines.totalVolume(r) ? ` · ${Routines.totalVolume(r)} kg` : ''}<br>Modificada el ${fmtDate(r.modified)}</p>
    <div class="row"><button class="btn small" data-act="view" data-id="${r.id}">Ver</button><button class="btn small ghost" data-act="edit" data-id="${r.id}">Editar</button><button class="btn small danger" data-act="del" data-id="${r.id}">Eliminar</button></div></article>`).join('')
  : `<div class="card empty"><p>Todavía no tenés rutinas. Creá la primera con el botón de arriba.</p></div>`}`;
}

function vView() {
  const r = Store.data.routines.find(x => x.id === UI.viewId);
  if (!r) { UI.view = 'home'; return vHome(); }
  return `<div class="bar"><button class="icon" data-act="home" aria-label="Volver">←</button><h1 class="sm">${esc(r.name)}</h1></div>
  <p class="mut" style="margin-bottom:14px">${r.exercises.length} ejercicios · ${Routines.totalSets(r)} series · modificada el ${fmtDate(r.modified)}</p>
  ${r.exercises.map((e, i) => `<section class="card"><h2>${esc(e.name)}</h2>
    ${e.notes ? `<p class="mut">${esc(e.notes)}</p>` : ''}
    <div class="syms">
      <div class="sq" aria-label="${e.sets.length} series"><b>${e.sets.length}</b><small>${e.sets.length === 1 ? 'serie' : 'series'}</small></div>
      ${e.sets.map(s => `<div class="ci"><small class="lbl">repeticiones</small><b>${s.reps}</b>${weightOk(s) ? `<small>${s.weight} kg</small>` : ''}</div>`).join('')}
    </div></section>`).join('')}
  <button class="btn" data-act="home">Volver al inicio</button>`;
}

function vEdit() {
  const d = Editor.draft;
  if (!d) { UI.view = 'home'; return vHome(); }
  return `<div class="bar"><button class="icon" data-act="cancel-edit" aria-label="Cancelar">✕</button><h1 class="sm">${d.id ? 'Editar rutina' : 'Nueva rutina'}</h1></div>
  <section class="card"><label>Nombre de la rutina<input data-f="name" value="${esc(d.name)}" placeholder="Pecho y tríceps" maxlength="60"></label></section>
  ${d.exercises.map((e, i) => `<section class="card" id="ex${i}">
    <div class="exh"><label style="flex:1">Ejercicio ${i + 1}<input data-ei="${i}" data-ef="name" value="${esc(e.name)}" placeholder="Press de banca" maxlength="60"></label></div>
    <div class="sets"><span class="h">Serie</span><span class="h">Reps</span><span></span>
    ${e.sets.map((s, j) => `<span class="n">${j + 1}</span><input type="number" inputmode="numeric" min="1" placeholder="0" data-ei="${i}" data-si="${j}" data-sf="reps" value="${s.reps}" aria-label="Repeticiones serie ${j + 1}">
      <button class="icon" data-act="rm-set" data-ei="${i}" data-si="${j}" aria-label="Quitar serie ${j + 1}">−</button>`).join('')}</div>
    <div class="row"><button class="btn small ghost" data-act="add-set" data-ei="${i}">+ Serie</button></div></section>`).join('')}
  <button class="btn green" data-act="add-ex">+ Agregar ejercicio</button>
  <div class="sticky"><div class="row"><button class="btn ghost" data-act="cancel-edit">Salir</button><button class="btn" data-act="save-routine">Guardar rutina</button></div></div>`;
}

function vTrain() {
  const a = Store.data.active; if (!a) { UI.view = 'home'; return vHome(); }
  const total = a.exercises.reduce((n, e) => n + e.sets.length, 0), done = a.exercises.reduce((n, e) => n + doneCount(e), 0);
  return `<div class="bar"><div style="flex:1"><h1 class="sm">${esc(a.name)}</h1><p class="mut">Tiempo <b id="elapsed">${fmtTime((Date.now() - a.start) / 1000)}</b> · ${done}/${total} series</p></div></div>
  ${a.exercises.map((e, i) => `<section class="card"><div class="exh"><h2><span class="no">${i + 1}</span>${esc(e.name)}</h2></div>
    ${e.notes ? `<p class="mut">${esc(e.notes)}</p>` : ''}
    <div class="syms">
      <div class="sq" aria-label="${e.sets.length} series"><b>${doneCount(e)}/${e.sets.length}</b><small>hechas</small></div>
      ${e.sets.map((s, n) => `<button class="ci ${s.done ? 'done' : ''}" data-act="toggle-set" data-ei="${i}" data-si="${n}" aria-pressed="${s.done}" aria-label="Serie ${n + 1}: ${s.reps} repeticiones, ${kg(s.weight)}">
        <span>${s.reps}</span>${weightOk(s) ? `<small>${s.weight} kg</small>` : ''}</button>`).join('')}
    </div></section>`).join('')}
  <div class="sticky"><div class="row"><button class="btn ghost" data-act="end-training">Salir</button><button class="btn" data-act="finish-training">Guardar sesión</button></div></div>`;
}

function vHist() {
  const H = Store.data.history;
  return `<div class="bar"><button class="icon" data-act="home" aria-label="Volver">←</button><h1 class="sm">Historial</h1></div>
  ${H.length ? H.map(h => `<section class="card"><div class="exh"><h2 style="flex:1">${esc(h.name)}</h2><button class="icon" data-act="del-hist" data-id="${h.id}" aria-label="Eliminar sesión">✕</button></div>
    <p class="mut meta">${fmtDate(h.start)} · ${fmtTime((h.end - h.start) / 1000)} · ${h.exercises.length} ejercicios</p>
    ${h.exercises.map(e => `<p class="h-line"><b>${esc(e.name)}</b> <span class="mut">${e.sets.map(s => `${s.reps}${weightOk(s) ? '×' + s.weight : ''}`).join(' · ')}</span></p>`).join('')}</section>`).join('')
  : `<div class="card empty"><p>Sin sesiones todavía. Cuando termines un entrenamiento aparece acá.</p></div>`}
  <button class="btn ghost" data-act="home">Volver al inicio</button>`;
}

/* ---------- Acciones (clicks) ---------- */
/* Cada acción recibe {event, ei, si, id} */
const Actions = {
  home: () => { UI.go('home'); },
  go: ({id}) => { if (id === 'train') Timer.start(); UI.go(id); },
  new: () => Editor.open(null),
  view: ({id}) => { UI.viewId = id; UI.go('view'); },
  edit: ({id}) => Editor.open(id),
  hist: () => { UI.go('hist'); },
  export: () => { Store.export(); toast('Copia descargada'); },
  del: async ({id}) => { const r = Store.data.routines.find(x => x.id === id); if (!r) return;
    if (await ask('¿Eliminar rutina?', `Se borrará "${r.name}". Esta acción no se puede deshacer.`, 'Eliminar', true)) { Routines.remove(id); UI.render(); toast('Rutina eliminada'); } },
  'del-hist': async ({id}) => { if (await ask('¿Eliminar sesión?', 'Se borrará esta sesión del historial.', 'Eliminar', true)) { History.remove(id); UI.render(); toast('Sesión eliminada'); } },
  start: async ({id}) => { const r = Store.data.routines.find(x => x.id === id); if (!r) return;
    if (Store.data.active && !await ask('Rutina abierta', 'Ya tenés una rutina abierta. ¿Cerrarla y entrenar esta?', 'Entrenar esta', true)) return;
    if (Store.data.active) { Store.data.active = null; Store.save(); }
    Training.start(r); },
  'start-trained': a => Actions.start(a),
  'cancel-edit': async () => { if (await ask('¿Salir sin guardar?', 'Se perderán los cambios de esta rutina.', 'Salir', true)) { Editor.draft = null; UI.go('home'); } },
  'save-routine': () => { const err = Routines.validate(Editor.draft); if (err) return toast(err); Routines.save(Editor.draft); Editor.draft = null; UI.go('home'); toast('Rutina guardada'); },
  'add-ex': () => { Editor.draft.exercises.push(Exercises.create()); Store.save(); UI.render(); const l = document.querySelectorAll('[data-ef="name"]'); l[l.length - 1].focus(); },
  'add-set': ({ei}) => { const ex = Editor.draft?.exercises[ei]; if (!ex) return; Sets.add(ex); Store.save(); UI.render(); },
  'rm-set': ({ei, si}) => { const ex = Editor.draft?.exercises[ei]; if (!ex || si == null) return; Sets.remove(ex, si); Store.save(); UI.render(); },
  'toggle-set': ({ei, si}) => { if (ei == null || si == null) return; Training.setDone(ei, si); },
  'finish-training': () => { if (!Store.data.active) return; Training.save(); },
  'end-training': () => Training.end()
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const d = b.dataset, f = Actions[d.act]; if (!f) return;
  f({event: e, ei: d.ei === undefined ? null : +d.ei, si: d.si === undefined ? null : +d.si, id: d.id});
});

/* ---------- Entradas de texto y archivos ---------- */
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset, ed = Editor.draft;
  if (d.imp !== undefined) return;
  if (d.f && ed) { ed[d.f] = t.value; Store.save(); }
  else if (d.ef && ed) { ed.exercises[+d.ei][d.ef] = d.ef === 'rest' ? num(t.value) : t.value; Store.save(); }
  else if (d.sf && ed) { ed.exercises[+d.ei].sets[+d.si][d.sf] = num(t.value); Store.save(); }
  else if (d.tf && Store.data.active) { const a = Store.data.active; a.exercises[+d.ei].sets[+d.si][d.tf] = num(t.value); Store.save(); }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.imp === undefined || !t.files || !t.files[0]) return;
  const ok = await Store.import(t.files[0]); t.value = '';
  if (ok) { Timer.stop(); if (Store.data.active) { UI.view = 'train'; Timer.start(); } Editor.draft = null; UI.go('home'); toast('Copia importada'); }
  else toast('El archivo no es una copia válida');
});

/* ---------- Inicio ---------- */
(function init() {
  Store.load();
  if (Store.data.active) { UI.view = 'train'; Timer.start(); } // retoma un entrenamiento interrumpido
  UI.render();
})();
