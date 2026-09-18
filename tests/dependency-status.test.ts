import { test, expect } from 'bun:test';
import { dependencyStatus } from '../src/lib/dependency-status';
const links = [{ successor_id: 'b', lag_days: 2, predecessor: { id: 'a', title: 'A', scheduled_date: '2027-03-02', completed: false } }];
test('flags earlier dates, accounts for lag, accepts exact limit', () => {
 expect(dependencyStatus('2027-02-20', links).conflicts).toHaveLength(1);
 expect(dependencyStatus('2027-03-03', links).conflicts).toHaveLength(1);
 expect(dependencyStatus('2027-03-04', links).conflicts).toHaveLength(0);
 expect(dependencyStatus('2027-02-20', links).pending).toEqual(['A']);
});
test('latest predecessor controls repair; null dates are safe', () => {
 const second = { successor_id: 'b', lag_days: 3, predecessor: { id: 'c', title: 'C', scheduled_date: '2027-03-10', completed: true } };
 expect(dependencyStatus('2027-02-20', [...links, second]).suggestedDate).toBe('2027-03-13');
 expect(dependencyStatus('2027-02-20', [second]).pending).toEqual([]);
 expect(dependencyStatus(null, links).conflicts).toHaveLength(0);
 expect(dependencyStatus('2027-03-01', [{...links[0], predecessor: null}]).conflicts).toHaveLength(0);
});
