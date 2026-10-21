import { expect, test } from 'bun:test';
import { taskNumbers } from '../src/lib/task-numbering';

const tasks = [
  { id: 'c', position: 30, completed: false },
  { id: 'a', position: 10, completed: true },
  { id: 'b', position: 20, completed: false },
];

test('day numbers follow position and include completed tasks without mutating the display order', () => {
  expect([...taskNumbers(tasks)]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  expect(tasks.map(t => t.id)).toEqual(['c', 'a', 'b']);
});

test('sorting, searching, filtering and hiding completed tasks preserve numbers and gaps', () => {
  const numbers = taskNumbers(tasks);
  const visible = tasks.filter(t => !t.completed).sort((a, b) => b.position - a.position);
  expect(visible.map(t => numbers.get(t.id))).toEqual([3, 2]);
  expect(tasks.filter(t => t.id === 'b').map(t => numbers.get(t.id))).toEqual([2]);
});

test('completing a task does not renumber it', () => {
  expect([...taskNumbers(tasks.map(t => ({ ...t, completed: true })))]).toEqual([...taskNumbers(tasks)]);
});

test('persisted reordering changes numbers', () => {
  expect([...taskNumbers(tasks.map(t => ({ ...t, position: t.id === 'c' ? 0 : t.position })))]).toEqual([['c', 1], ['a', 2], ['b', 3]]);
});

test('overdue numbers use their own unfiltered display order, not position or day numbers', () => {
  const numbers = taskNumbers(tasks, false);
  expect([...numbers]).toEqual([['c', 1], ['a', 2], ['b', 3]]);
  expect(tasks.filter(t => t.id !== 'a').map(t => numbers.get(t.id))).toEqual([1, 3]);
});