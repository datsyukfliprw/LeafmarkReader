import { describe,it,expect } from 'vitest';
import { deterministicQuestion, deterministicRevision, evidenceRegistry, selectReadingSkill } from './index';
describe('pedagogy engine',()=>{
 it('traces every strategy to evidence',()=>{expect(evidenceRegistry.length).toBeGreaterThan(10);expect(evidenceRegistry.every(e=>e.evidenceUrl.startsWith('https://ies.ed.gov/'))).toBe(true)});
 it('selects practice conservatively',()=>{const r=selectReadingSkill([],0);expect(r.skill).toBe('recall');expect(r.difficulty).toBe(1)});
 it('never includes an answer in deterministic question',()=>{expect(deterministicQuestion('inference',1).question).not.toMatch(/answer is/i)});
 it('revision prompt asks child to act',()=>expect(deterministicRevision('elaboration').challenge).toMatch(/add/i));
});
