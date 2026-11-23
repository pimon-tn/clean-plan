import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, regenerate, dayView, addDays } from '../js/roster.js';

// Nov 2026: the 1st is a Sunday, Wednesdays are 4/11/18/25, Fridays are 6/13/20/27.
const setup = (names = ['A', 'B', 'C'], tasks = ['mop', 'sweep']) => {
  const s = emptyState();
  s.members = names.map((id) => ({ id, name: id, active: true }));
  s.tasks = tasks.map((id) => ({ id, name: id, active: true }));
  return s;
};
const plan = (s, from = '2026-11-01', through = from) => (s.roster = regenerate(s, from, through));
const bathroomDays = (s) =>
  Object.entries(s.roster).filter(([, d]) => d.bathroom).map(([date, d]) => [date, d.bathroom]);

test('Wednesdays and Clinic Holidays get no roster', () => {
  const s = setup();
  s.clinicHolidays = ['2026-11-10'];
  plan(s);
  const dates = Object.keys(s.roster);
  assert.ok(!dates.includes('2026-11-04') && !dates.includes('2026-11-10'));
  assert.equal(dates.length, 30 - 4 - 1);
});

test('Bathroom Duty rotates every Friday and that member gets no Task', () => {
  const s = setup();
  plan(s);
  assert.deepEqual(bathroomDays(s), [
    ['2026-11-06', 'A'], ['2026-11-13', 'B'], ['2026-11-20', 'C'], ['2026-11-27', 'A'],
  ]);
  for (const [date, who] of bathroomDays(s))
    assert.ok(!s.roster[date].assignments.some((a) => a.memberId === who));
});

test('Bathroom Day on a Clinic Holiday moves to the previous Working Day', () => {
  const s = setup();
  s.clinicHolidays = ['2026-11-13'];
  plan(s);
  assert.equal(s.roster['2026-11-12'].bathroom, 'B');
});

test('member off on their Bathroom Day is replaced and goes next week', () => {
  const s = setup(['A', 'B', 'C', 'D']);
  s.memberDaysOff = [{ memberId: 'B', date: '2026-11-13' }];
  plan(s);
  assert.deepEqual(bathroomDays(s).map(([, w]) => w), ['A', 'C', 'B', 'D']);
});

test('nobody gets the same Task on consecutive Working Days, even with days off', () => {
  const s = setup(['A', 'B', 'C', 'D'], ['mop', 'sweep', 'trash']);
  s.memberDaysOff = ['02', '03', '09', '16', '17', '24'].map((d, i) => ({
    memberId: 'ABCD'[i % 4], date: `2026-11-${d}`,
  }));
  plan(s);
  const days = Object.values(s.roster);
  for (let i = 1; i < days.length; i++)
    for (const a of days[i].assignments)
      assert.ok(
        !days[i - 1].assignments.some((p) => p.memberId === a.memberId && p.taskId === a.taskId),
        `repeat on day ${i}`,
      );
});

test('every Task is covered when there are more Tasks than members', () => {
  const s = setup(['A', 'B'], ['mop', 'sweep', 'trash']);
  plan(s);
  const monday = s.roster['2026-11-02'];
  assert.equal(monday.assignments.length, 3);
  assert.ok(monday.assignments.every((a) => a.memberId));
});

test('rotation continues across months', () => {
  const once = setup();
  plan(once, '2026-11-01', '2026-12-01');
  const split = setup();
  plan(split, '2026-11-01');
  plan(split, '2026-12-01');
  assert.deepEqual(split.roster, once.roster);
});

test('re-planning keeps past days, flows into later months and keeps Manual Overrides', () => {
  const s = setup();
  plan(s, '2026-11-01', '2026-12-01');
  const before = structuredClone(s.roster);
  s.overrides['2026-11-23|mop'] = 'C';
  s.memberDaysOff = [{ memberId: 'A', date: '2026-11-20' }];
  plan(s, '2026-11-16');
  for (const d of Object.keys(before).filter((d) => d < '2026-11-16'))
    assert.deepEqual(s.roster[d], before[d]);
  assert.notDeepEqual(s.roster['2026-11-20'], before['2026-11-20']);
  assert.ok(s.roster['2026-12-31']);
  assert.equal(dayView(s, '2026-11-23').assignments.find((a) => a.taskId === 'mop').memberId, 'C');
});

test('a new member joins the rotation', () => {
  const s = setup();
  plan(s);
  s.members.push({ id: 'D', name: 'D', active: true });
  plan(s, '2026-11-16');
  const days = Object.keys(s.roster).filter((d) => d >= '2026-11-16');
  assert.ok(days.some((d) => s.roster[d].assignments.some((a) => a.memberId === 'D')));
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});
