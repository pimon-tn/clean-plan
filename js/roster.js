// Roster rules, kept free of the DOM so `node --test` can check them.
// Dates are 'YYYY-MM-DD' strings; weeks start on Monday.

export const addDays = (d, n) =>
  new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
export const monthEnd = (d) =>
  new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).toISOString().slice(0, 10);

export const emptyState = () => ({
  members: [], // { id, name, active }, array order = Member Order
  tasks: [], // { id, name, active }
  memberDaysOff: [], // { memberId, date }
  clinicHolidays: [], // dates added by hand, on top of settings.closedWeekdays
  settings: { closedWeekdays: [3], bathroomWeekday: 5 },
  roster: {}, // date -> { bathroom, assignments: [{ taskId, memberId }], state }
  overrides: {}, // 'date|taskId' or 'date|bathroom' -> memberId
});

export const isWorkingDay = (s, d) =>
  !s.settings.closedWeekdays.includes(weekday(d)) && !s.clinicHolidays.includes(d);

// The set weekday of d's week, or the last Working Day before it in that week when the clinic is closed.
export function isBathroomDay(s, d) {
  if (!isWorkingDay(s, d)) return false;
  const monday = addDays(d, -((weekday(d) + 6) % 7));
  let target = addDays(monday, (s.settings.bathroomWeekday + 6) % 7);
  while (target >= monday && !isWorkingDay(s, target)) target = addDays(target, -1);
  return target === d;
}

// Re-plan every Working Day from `from` to the end of the later of `through`'s month and
// the last planned month. Days before `from` are kept, and the rotation continues from them.
export function regenerate(s, from, through) {
  const dates = Object.keys(s.roster).sort();
  const roster = {};
  for (const d of dates) if (d < from) roster[d] = s.roster[d];
  const kept = Object.keys(roster);
  let prev = kept.length ? roster[kept.at(-1)] : null;
  const end = monthEnd([through, dates.at(-1) ?? through].sort().at(-1));
  for (let d = from; d <= end; d = addDays(d, 1)) {
    if (!isWorkingDay(s, d)) continue;
    prev = roster[d] = planDay(s, d, prev?.state ?? { k: -1, bathroomQueue: [] }, prev);
  }
  return roster;
}

function planDay(s, d, { k, bathroomQueue }, prev) {
  const active = s.members.filter((m) => m.active).map((m) => m.id);
  const off = new Set(s.memberDaysOff.filter((o) => o.date === d).map((o) => o.memberId));

  // The queue only reorders on Bathroom Days, so someone on a day off keeps their place for next week.
  let queue = [
    ...bathroomQueue.filter((id) => active.includes(id)),
    ...active.filter((id) => !bathroomQueue.includes(id)),
  ];
  let bathroom = null;
  if (isBathroomDay(s, d)) {
    bathroom = queue.find((id) => !off.has(id)) ?? null;
    if (bathroom) queue = [...queue.filter((id) => id !== bathroom), bathroom];
  }

  k += 1;
  const n = active.length;
  const rotated = n ? [...active.slice(k % n), ...active.slice(0, k % n)] : [];
  const free = rotated.filter((id) => !off.has(id) && id !== bathroom);
  const taskIds = s.tasks.filter((t) => t.active).map((t) => t.id);
  const assignments = free.length
    ? taskIds.map((taskId, j) => ({ taskId, memberId: free[j % free.length] }))
    : [];
  avoidRepeats(assignments, free, prev);
  return { bathroom, assignments, state: { k, bathroomQueue: queue } };
}

// Days off shift the rotation, so fix any Member who got the same Task as on the previous Working Day.
function avoidRepeats(assignments, free, prev) {
  if (!prev) return;
  const had = (id, taskId) =>
    prev.assignments.some((a) => a.memberId === id && a.taskId === taskId);
  for (const a of assignments) {
    if (!had(a.memberId, a.taskId)) continue;
    const b = assignments.find(
      (b) => b.memberId !== a.memberId && !had(a.memberId, b.taskId) && !had(b.memberId, a.taskId),
    );
    if (b) {
      [a.memberId, b.memberId] = [b.memberId, a.memberId];
      continue;
    }
    const idle = free.find((id) => !assignments.some((x) => x.memberId === id) && !had(id, a.taskId));
    if (idle) a.memberId = idle;
  }
}

// What the calendar shows for one day: the plan with Manual Overrides applied.
export function dayView(s, d) {
  const day = s.roster[d];
  if (!day) return null;
  const pick = (slot, id) => s.overrides[`${d}|${slot}`] ?? id;
  return {
    bathroom: day.bathroom && pick('bathroom', day.bathroom),
    assignments: day.assignments.map((a) => ({ ...a, memberId: pick(a.taskId, a.memberId) })),
  };
}
