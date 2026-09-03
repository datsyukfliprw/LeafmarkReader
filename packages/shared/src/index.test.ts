import { describe,it,expect } from 'vitest';
import { isValidIsbn10,isValidIsbn13,nextPage,wordCount,elapsedSecondsSince,readingGoalReached } from './index';
describe('ISBN validation',()=>{
  it('validates ISBN-10 including formatting',()=>{expect(isValidIsbn10('0-306-40615-2')).toBe(true);expect(isValidIsbn10('0306406153')).toBe(false)});
  it('validates ISBN-13',()=>{expect(isValidIsbn13('978-0-306-40615-7')).toBe(true);expect(isValidIsbn13('9780306406158')).toBe(false)});
});
it('calculates next page safely',()=>expect(nextPage(81,97)).toBe(98));
it('counts words',()=>expect(wordCount('One two\nthree.')).toBe(3));

it('tracks the 15-minute reading goal',()=>{const start='2026-09-03T12:00:00.000Z';expect(elapsedSecondsSince(start,new Date('2026-09-03T12:15:01.000Z').getTime())).toBe(901);expect(readingGoalReached(899)).toBe(false);expect(readingGoalReached(900)).toBe(true)});
