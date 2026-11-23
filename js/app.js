import { emptyState, regenerate, dayView, isWorkingDay, addDays, monthEnd } from './roster.js';

const KEY = 'clean-plan';
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const today = () => new Date().toLocaleDateString('sv'); // local YYYY-MM-DD
const thaiDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Soft pastel tone to sit with the Light & Shadow palette; dark text stays readable on it.
// Changing TONE re-rolls every member's colour once.
const TONE = ' 42% 70%)';
const EVENT_TEXT = '#2f3a45';

let s = load();
colorMembers();
save();

// Random hue, but the farthest of 12 random tries from hues already taken, so members stay easy to tell apart.
function randomColor() {
  const used = s.members.filter((m) => m.color?.endsWith(TONE)).map((m) => parseInt(m.color.slice(4)));
  const gap = (h) => Math.min(360, ...used.map((u) => Math.min(Math.abs(h - u), 360 - Math.abs(h - u))));
  const tries = Array.from({ length: 12 }, () => Math.floor(Math.random() * 360));
  return `hsl(${tries.reduce((a, b) => (gap(b) > gap(a) ? b : a))}${TONE}`;
}
// Members with no colour, or one from before the palette change, get a new one; it is then stored.
function colorMembers() {
  s.members.forEach((m) => {
    if (!m.color?.endsWith(TONE)) m.color = randomColor();
  });
}
function load() {
  try {
    return { ...emptyState(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return emptyState();
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    alert('บันทึกข้อมูลไม่สำเร็จ เบราว์เซอร์อาจบล็อกการเก็บข้อมูล กรุณา export เก็บไว้ก่อนปิดหน้านี้');
  }
}
const nameOf = (list, id) => s[list].find((x) => x.id === id)?.name ?? '?';

// ---------- pages ----------
function route() {
  const page = location.hash.slice(1) || 'roster';
  const section = document.querySelector(`[data-page="${page}"]`);
  if (!section) return; // '#' from the sidebar toggle and theme menu
  document.querySelectorAll('[data-page]').forEach((el) => (el.hidden = el !== section));
  document.querySelectorAll('#navigation .nav-link').forEach((a) =>
    a.classList.toggle('active', a.getAttribute('href') === `#${page}`));
  $('#page-title').textContent = section.dataset.title;
  // FullCalendar 7 resizes itself when shown; refetch so renamed members and new days off appear.
  if (page === 'roster') calendar.refetchEvents();
  else render();
}
addEventListener('hashchange', route);

function render() {
  for (const list of ['members', 'tasks']) renderList(list);
  renderDaysOff();
  renderSettings();
}

// ---------- inline edit: one row at a time, keyed like 'members:2', 'dayoff:5', 'holiday:2026-11-28' ----------
let editingRow = null;
const editBtn = (key) =>
  `<button class="btn btn-sm btn-outline-primary" data-edit-row="${key}" aria-label="แก้ไข"><i class="bi bi-pencil"></i></button>`;
const editForm = (key, fields) => `
  <li class="list-group-item"><form class="input-group input-group-sm" data-edit="${key}">${fields}
    <button class="btn btn-primary">บันทึก</button>
    <button type="button" class="btn btn-outline-secondary" data-cancel>ยกเลิก</button>
  </form></li>`;
const memberOptions = (selected) => s.members.filter((m) => m.active || m.id === selected)
  .map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
const none = '<li class="list-group-item text-body-secondary">ยังไม่มีรายการ</li>';

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-edit-row], [data-cancel]');
  if (!btn) return;
  editingRow = btn.dataset.editRow ?? null;
  render();
  document.querySelector('form[data-edit] .form-control, form[data-edit] .form-select')?.focus();
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-edit]');
  if (!form) return;
  e.preventDefault();
  const [kind, ref] = form.dataset.edit.split(':');
  const f = form.elements;
  if (kind === 'members' || kind === 'tasks') {
    const name = f.label.value.trim();
    if (!name) return;
    s[kind][+ref].name = name;
  } else if (kind === 'dayoff') {
    s.memberDaysOff[+ref] = { memberId: f.memberId.value, date: f.date.value };
    s.memberDaysOff = s.memberDaysOff.filter((o, i, all) =>
      all.findIndex((x) => x.memberId === o.memberId && x.date === o.date) === i);
  } else {
    s.clinicHolidays = [...new Set(s.clinicHolidays.map((d) => (d === ref ? f.date.value : d)))];
  }
  editingRow = null;
  save();
  render();
});

// ---------- members & tasks: same add / rename / reorder / deactivate / delete list ----------
// Deleted items stay in the data, hidden, so past rosters can still show their names.
function renderList(list) {
  const items = s[list];
  const shown = items.map((x, i) => i).filter((i) => !items[i].deleted);
  $(`[data-list="${list}"]`).innerHTML = shown.length
    ? items.map((x, i) => x.deleted ? '' : editingRow === `${list}:${i}`
      ? editForm(`${list}:${i}`, `<input class="form-control" name="label" value="${esc(x.name)}" aria-label="ชื่อ" required />`)
      : `
      <li class="list-group-item d-flex align-items-center gap-2 ${x.active ? '' : 'text-body-tertiary'}">
        ${x.color ? `<span class="rounded-circle d-inline-block" style="width:.8rem;height:.8rem;background:${x.color}" aria-hidden="true"></span>` : ''}
        <span class="me-auto">${esc(x.name)}${x.active ? '' : ' <span class="badge text-bg-secondary">ปิดใช้งาน</span>'}</span>
        ${editBtn(`${list}:${i}`)}
        <button class="btn btn-sm btn-outline-secondary" data-move="${i},-1" aria-label="เลื่อนขึ้น" ${i === shown[0] ? 'disabled' : ''}><i class="bi bi-arrow-up"></i></button>
        <button class="btn btn-sm btn-outline-secondary" data-move="${i},1" aria-label="เลื่อนลง" ${i === shown.at(-1) ? 'disabled' : ''}><i class="bi bi-arrow-down"></i></button>
        <button class="btn btn-sm ${x.active ? 'btn-outline-warning' : 'btn-outline-success'}" data-toggle-active="${i}">${x.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${i}" aria-label="ลบ"><i class="bi bi-trash"></i></button>
      </li>`).join('')
    : none;
}
document.querySelectorAll('[data-add]').forEach((form) =>
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // form.elements, not form.name: a form's own `name` property shadows an input called "name".
    const name = form.elements.label.value.trim();
    if (!name) return;
    // Not crypto.randomUUID: it only exists on https/localhost, and the app may be opened over a LAN IP.
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    s[form.dataset.add].push({ id, name, active: true, ...(form.dataset.add === 'members' && { color: randomColor() }) });
    form.reset();
    save();
    render();
  }));
document.querySelectorAll('[data-list]').forEach((ul) =>
  ul.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move], [data-toggle-active], [data-delete]');
    if (!btn) return;
    const items = s[ul.dataset.list];
    if (btn.dataset.move) {
      const [i, step] = btn.dataset.move.split(',').map(Number);
      let j = i + step; // skip hidden deleted items
      while (items[j]?.deleted) j += step;
      if (!items[j]) return;
      [items[i], items[j]] = [items[j], items[i]];
    } else if (btn.dataset.delete) {
      const x = items[+btn.dataset.delete];
      if (!confirm(`ลบ "${x.name}" ?\nตารางเวรที่จัดไว้แล้วยังแสดงชื่อนี้ เวรข้างหน้าจะเปลี่ยนเมื่อกด "จัดเวร"`)) return;
      Object.assign(x, { deleted: true, active: false });
      if (ul.dataset.list === 'members') s.memberDaysOff = s.memberDaysOff.filter((o) => o.memberId !== x.id);
    } else {
      const x = items[+btn.dataset.toggleActive];
      x.active = !x.active;
    }
    editingRow = null;
    save();
    render();
  }));

// ---------- days off ----------
function renderDaysOff() {
  const f = $('#form-dayoff');
  const keep = f.memberId.value;
  f.memberId.innerHTML = memberOptions(keep);
  const row = (key, label, del) => editingRow === key ? null : `
    <li class="list-group-item d-flex align-items-center gap-2"><span class="me-auto">${label}</span>
      ${editBtn(key)}
      <button class="btn btn-sm btn-outline-danger" data-del="${del}" aria-label="ลบ"><i class="bi bi-trash"></i></button></li>`;
  const off = s.memberDaysOff.map((o, i) => ({ ...o, i })).sort((a, b) => a.date.localeCompare(b.date));
  $('#list-dayoff').innerHTML = off.length
    ? off.map((o) => row(`dayoff:${o.i}`, `${thaiDate(o.date)} — ${esc(nameOf('members', o.memberId))}`, o.i) ??
      editForm(`dayoff:${o.i}`, `
        <select class="form-select" name="memberId" aria-label="สมาชิก">${memberOptions(o.memberId)}</select>
        <input class="form-control" type="date" name="date" value="${o.date}" aria-label="วันที่" required />`)).join('')
    : none;
  $('#list-holiday').innerHTML = s.clinicHolidays.length
    ? [...s.clinicHolidays].sort().map((d) => row(`holiday:${d}`, thaiDate(d), d) ??
      editForm(`holiday:${d}`, `<input class="form-control" type="date" name="date" value="${d}" aria-label="วันที่" required />`)).join('')
    : none;
}
$('#form-dayoff').addEventListener('submit', (e) => {
  e.preventDefault();
  const { memberId, date } = e.target.elements;
  if (!s.memberDaysOff.some((o) => o.memberId === memberId.value && o.date === date.value))
    s.memberDaysOff.push({ memberId: memberId.value, date: date.value });
  save();
  renderDaysOff();
});
$('#form-holiday').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = e.target.elements.date.value;
  if (!s.clinicHolidays.includes(date)) s.clinicHolidays.push(date);
  save();
  renderDaysOff();
});
$('#list-dayoff').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  s.memberDaysOff.splice(+btn.dataset.del, 1);
  editingRow = null;
  save();
  renderDaysOff();
});
$('#list-holiday').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  s.clinicHolidays = s.clinicHolidays.filter((d) => d !== btn.dataset.del);
  editingRow = null;
  save();
  renderDaysOff();
});

// ---------- settings ----------
function renderSettings() {
  $('#bathroom-weekday').innerHTML = WEEKDAYS
    .map((w, i) => `<option value="${i}" ${i === s.settings.bathroomWeekday ? 'selected' : ''}>${w}</option>`).join('');
  $('#closed-weekdays').innerHTML = WEEKDAYS.map((w, i) => `
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="cw${i}" value="${i}" ${s.settings.closedWeekdays.includes(i) ? 'checked' : ''} />
      <label class="form-check-label" for="cw${i}">${w}</label>
    </div>`).join('');
}
$('#bathroom-weekday').addEventListener('change', (e) => {
  s.settings.bathroomWeekday = +e.target.value;
  save();
});
$('#closed-weekdays').addEventListener('change', () => {
  s.settings.closedWeekdays = [...document.querySelectorAll('#closed-weekdays input:checked')].map((c) => +c.value);
  save();
});
$('#btn-export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }));
  a.download = `clean-plan-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#input-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!Array.isArray(data.members) || !Array.isArray(data.tasks) || typeof data.roster !== 'object')
      throw new Error();
  } catch {
    return alert('ไฟล์นี้ไม่ใช่ข้อมูลของ Clean Plan');
  }
  if (!confirm('ข้อมูลทั้งหมดในเครื่องนี้จะถูกแทนที่ด้วยไฟล์นี้ ต้องการทำต่อหรือไม่')) return;
  s = { ...emptyState(), ...data };
  colorMembers();
  save();
  render();
  calendar.refetchEvents();
});

// ---------- roster calendar ----------
const OFF = '#9b918f'; // Cloud Cover, for closed days
const DAY_OFF = '#e6e2dc'; // a step darker than Cloud Dancer
const colorOf = (id) => s.members.find((m) => m.id === id)?.color ?? OFF;
let viewMonth = today().slice(0, 7) + '-01';
// Defined before the calendar: FullCalendar 7 fetches events while it is being constructed.
const mark = (d, slot) => (s.overrides[`${d}|${slot}`] ? '✎ ' : '');

const calendar = new FullCalendar.Calendar($('#calendar'), {
  initialView: 'dayGridMonth',
  locale: 'th',
  height: 'auto',
  dayMaxEvents: false,
  headerToolbar: { start: 'prev,next today', center: 'title', end: '' },
  eventOrder: 'order',
  datesSet: (info) => {
    viewMonth = info.view.currentStart.toLocaleDateString('sv');
  },
  events: (info, success) => {
    const events = [];
    const end = info.end.toLocaleDateString('sv');
    for (let d = info.start.toLocaleDateString('sv'); d < end; d = addDays(d, 1)) {
      if (!isWorkingDay(s, d)) {
        events.push({ start: d, display: 'background', color: OFF, title: 'ปิด' });
        continue;
      }
      const day = dayView(s, d);
      if (day?.bathroom)
        events.push({ start: d, order: 0, color: colorOf(day.bathroom), contrastColor: EVENT_TEXT, className: 'ev-bathroom', title: `ล้างห้องน้ำ: ${mark(d, 'bathroom')}${nameOf('members', day.bathroom)}`, extendedProps: { slot: 'bathroom' } });
      for (const a of day?.assignments ?? [])
        events.push({ start: d, order: 1, color: colorOf(a.memberId), contrastColor: EVENT_TEXT, title: `${nameOf('tasks', a.taskId)}: ${mark(d, a.taskId)}${nameOf('members', a.memberId)}`, extendedProps: { slot: a.taskId } });
      for (const o of s.memberDaysOff.filter((o) => o.date === d))
        events.push({ start: d, order: 2, color: DAY_OFF, contrastColor: '#756f69', title: `หยุด: ${nameOf('members', o.memberId)}` });
    }
    success(events);
  },
  eventClick: ({ event }) => event.extendedProps.slot && openOverride(event.startStr.slice(0, 10), event.extendedProps.slot),
});

$('#btn-plan').addEventListener('click', () => {
  if (!s.members.some((m) => m.active) || !s.tasks.some((t) => t.active))
    return alert('กรุณาเพิ่มสมาชิกและงานก่อนจัดเวร');
  const last = monthEnd(viewMonth);
  const planned = Object.keys(s.roster).some((d) => d >= viewMonth && d <= last);
  // Past days of a planned month never change; an unplanned month is planned whole.
  const from = planned && today() > viewMonth ? today() : viewMonth;
  if (from > last) return alert('เดือนนี้ผ่านไปแล้ว จัดเวรใหม่ไม่ได้');
  const later = Object.keys(s.roster).some((d) => d > last);
  if (planned && !confirm(`จัดเวรใหม่ตั้งแต่ ${thaiDate(from)} เป็นต้นไป${later ? ' รวมถึงเดือนถัดไปที่จัดไว้แล้ว' : ''}\nเวรที่แก้ด้วยมือจะคงไว้`)) return;
  s.roster = regenerate(s, from, last);
  save();
  calendar.refetchEvents();
});

// ---------- manual override ----------
const modal = new bootstrap.Modal('#modal-override');
let editing = null;
function openOverride(date, slot) {
  const day = dayView(s, date);
  const current = slot === 'bathroom' ? day.bathroom : day.assignments.find((a) => a.taskId === slot).memberId;
  const planned = slot === 'bathroom' ? s.roster[date].bathroom : s.roster[date].assignments.find((a) => a.taskId === slot).memberId;
  editing = { date, slot, planned };
  $('#override-slot').textContent = `${thaiDate(date)} — ${slot === 'bathroom' ? 'ล้างห้องน้ำ' : nameOf('tasks', slot)}`;
  const f = $('#form-override');
  f.memberId.innerHTML = s.members.filter((m) => m.active || m.id === current)
    .map((m) => `<option value="${m.id}">${esc(m.name)}${m.id === planned ? ' (ตามแผน)' : ''}</option>`).join('');
  f.memberId.value = current;
  modal.show();
}
$('#form-override').addEventListener('submit', (e) => {
  e.preventDefault();
  const { date, slot, planned } = editing;
  const key = `${date}|${slot}`;
  const id = e.target.memberId.value;
  if (id === planned) delete s.overrides[key];
  else s.overrides[key] = id;
  save();
  modal.hide();
  calendar.refetchEvents();
});

calendar.render();
route();
