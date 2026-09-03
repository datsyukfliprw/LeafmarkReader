import type { ReadingSkill, WritingSkill } from '@leafmark/schemas';

export type EvidenceEntry = {
  id: string; skill: string; skillDescription:string; gradeRange: string; evidenceSource: string; evidenceUrl: string;
  instructionalMethod: string; appImplementation:string; prerequisites: string[]; difficultyProgression: string[];
  allowedAiBehavior: string[]; prohibitedAiBehavior: string[]; measurementMethod: string; successCriteria: string;
};

const readingEvidence = 'U.S. Department of Education, Institute of Education Sciences, What Works Clearinghouse. Improving Reading Comprehension in Kindergarten Through 3rd Grade (2010).';
const readingUrl = 'https://ies.ed.gov/ncee/wwc/PracticeGuide/14';
const writingEvidence = 'U.S. Department of Education, Institute of Education Sciences, What Works Clearinghouse. Teaching Elementary School Students to Be Effective Writers (2012; revised 2018).';
const writingUrl = 'https://ies.ed.gov/ncee/wwc/PracticeGuide/17';

const retrievalEvidence = 'U.S. Department of Education, Institute of Education Sciences, What Works Clearinghouse. Organizing Instruction and Study to Improve Student Learning (2007).';
const retrievalUrl = 'https://ies.ed.gov/ncee/wwc/PracticeGuide/1';
const foundationalEvidence = 'U.S. Department of Education, Institute of Education Sciences, What Works Clearinghouse. Foundational Skills to Support Reading for Understanding in Kindergarten Through 3rd Grade (2016; revised 2019).';
const foundationalUrl = 'https://ies.ed.gov/ncee/wwc/PracticeGuide/21';

const skillDescriptions:Record<string,string>={
  recall:'Remember and retell important information after reading without being given the answer.',sequencing:'Put events or ideas in a meaningful order and explain how they connect.',inference:'Combine clues from the reading with reasoning to figure out something not stated directly.',prediction:'Anticipate what may happen next using information already read.',character_motivation:'Explain why a character may act, choose, or feel in a particular way.',cause_effect:'Explain how one event or condition leads to another.',main_idea:'Identify the most important idea or event in a section of reading.',supporting_details:'Choose specific details that strengthen or explain a larger idea.',problem_solution:'Identify a problem and how a character or text responds to it.',text_evidence:'Use a concrete detail from reading to support an interpretation.',vocabulary_context:'Use surrounding meaning to reason about an unfamiliar word or phrase.',comparison:'Explain a meaningful similarity or difference.',elaboration:'Add useful detail so writing communicates more fully.',organization:'Arrange ideas in an order a reader can follow.',sentence_clarity:'Shape sentences so the intended meaning is easy to understand.',evidence:'Use a story detail to support a written idea.',revision:'Reread and purposefully improve one’s own writing.',conventions:'Use capitalization, punctuation, spelling, and grammar to make meaning readable.'
};

const read = (id:string, skill:ReadingSkill, method:string, success:string): EvidenceEntry => ({
  id, skill, skillDescription:skillDescriptions[skill]??skill, gradeRange:'K–3 (application targets Grade 3)', evidenceSource:readingEvidence, evidenceUrl:readingUrl,
  instructionalMethod:method, appImplementation:'The child first recalls independently. The pedagogy engine then selects this skill and difficulty; the model may phrase one constrained question, and Leafmark stores the child’s response as a repeated observation over time.', prerequisites:['Student has completed an initial unguided recall attempt'],
  difficultyProgression:['Concrete event or sequence','Explain relationship or motivation','Support interpretation with a specific detail'],
  allowedAiBehavior:['Phrase one concise question after the pedagogy engine selects the skill','Ask at most one evidence-focused follow-up'],
  prohibitedAiBehavior:['Reveal an answer before an attempt','Invent canonical book content','Choose the instructional skill independently'],
  measurementMethod:'Repeated rubric-based observations from the child’s own responses over time.', successCriteria:success
});
const write = (id:string, skill:WritingSkill, method:string, success:string): EvidenceEntry => ({
  id, skill, skillDescription:skillDescriptions[skill]??skill, gradeRange:'Grades 1–6 (application targets Grade 3)', evidenceSource:writingEvidence, evidenceUrl:writingUrl,
  instructionalMethod:method, appImplementation:'After the child produces original writing, the pedagogy engine selects one writing target. Leafmark gives one constrained revision challenge, preserves the original, and stores what the child changes.', prerequisites:['Child has produced original writing'],
  difficultyProgression:['Notice one improvement opportunity','Revise one focused feature','Apply the feature more independently across sessions'],
  allowedAiBehavior:['Give one focused revision challenge','Refer to the child’s own words without supplying replacement prose'],
  prohibitedAiBehavior:['Rewrite the response','Correct every error at once','Replace the child’s voice'],
  measurementMethod:'Compare original and revised writing plus repeated independent use across later sessions.', successCriteria:success
});

export const evidenceRegistry: EvidenceEntry[] = [
  {...read('READ.RECALL.01','recall','Use active retrieval immediately after reading before prompts or hints.','Recalls central events or ideas with decreasing support.'),evidenceSource:retrievalEvidence,evidenceUrl:retrievalUrl,appImplementation:'Immediately after the reading location is saved, Leafmark asks the child to tell what happened before any AI question, hint, or book-specific content is shown.'},
  read('READ.SEQUENCE.01','sequencing','Ask the student to order or connect important events using text structure.','Explains a sensible event sequence and relationships.'),
  read('READ.INFERENCE.01','inference','Ask the student to combine what happened with what they already know, then support the inference.','Makes a plausible inference and can point to supporting story information.'),
  read('READ.PREDICTION.01','prediction','Ask for a prediction grounded in the portion already read.','Makes a plausible prediction tied to existing story evidence.'),
  read('READ.CHARACTER_MOTIVATION.01','character_motivation','Use focused discussion about why a character acted or felt as they did.','Explains motivation using events the child recalls.'),
  read('READ.CAUSE_EFFECT.01','cause_effect','Prompt attention to causal relationships in the text.','Connects a cause with its effect accurately.'),
  read('READ.MAIN_IDEA.01','main_idea','Prompt the student to identify the most important idea or event and relevant support.','Names a central idea and at least one supporting detail.'),
  read('READ.SUPPORTING_DETAILS.01','supporting_details','Ask for specific details that support a recalled idea.','Provides relevant details rather than unrelated facts.'),
  read('READ.PROBLEM_SOLUTION.01','problem_solution','Use text structure to identify a problem and how characters respond.','Identifies the problem and a response or solution.'),
  read('READ.TEXT_EVIDENCE.01','text_evidence','Ask the student to support an interpretation with a concrete detail from today’s reading.','Supports claims with relevant details from the read portion.'),
  {...read('READ.VOCAB_CONTEXT.01','vocabulary_context','Use context and surrounding meaning to reason about an unfamiliar word the child mentions.','Uses context to explain likely meaning without fabricated quotations.'),evidenceSource:foundationalEvidence,evidenceUrl:foundationalUrl},
  read('READ.COMPARISON.01','comparison','Ask the student to compare two characters, events, ideas, or moments they mentioned.','States a meaningful similarity or difference with support.'),
  write('WRITE.ELABORATION.01','elaboration','Teach revision as part of the writing process by adding one useful detail.','Adds relevant detail that makes meaning clearer or more vivid.'),
  write('WRITE.ORGANIZATION.01','organization','Use a focused revision to improve logical order.','Orders ideas so the reader can follow the explanation.'),
  write('WRITE.CLARITY.01','sentence_clarity','Focus on one sentence-level clarity improvement while preserving authorship.','Clarifies meaning without the system rewriting the sentence.'),
  write('WRITE.SUPPORTING_DETAILS.01','supporting_details','Prompt the child to add a detail that supports the main point.','Adds a relevant supporting detail.'),
  write('WRITE.EVIDENCE.01','evidence','Prompt use of a concrete story detail to support an idea.','Connects a claim to a relevant remembered detail.'),
  write('WRITE.REVISION.01','revision','Teach that writers reread and change their own work for a purpose.','Makes a purposeful change after a focused prompt.'),
  write('WRITE.CONVENTIONS.01','conventions','Address one high-impact convention at a time after meaning is established.','Corrects the targeted convention with decreasing support.')
];

export type SkillObservation = { skill: ReadingSkill; level: 'developing'|'practicing'|'consistent'|'independent'; observedAt: string };
const readingCycle: ReadingSkill[] = ['recall','sequencing','inference','character_motivation','cause_effect','main_idea','supporting_details','text_evidence','prediction','problem_solution','comparison'];
export function selectReadingSkill(observations: SkillObservation[], sessionCount: number): { skill: ReadingSkill; difficulty:1|2|3; evidence:EvidenceEntry } {
  const grouped = new Map<ReadingSkill, SkillObservation[]>();
  for (const skill of readingCycle) grouped.set(skill, []);
  for (const observation of observations) grouped.get(observation.skill)?.push(observation);
  const levelRank = { developing:0, practicing:1, consistent:2, independent:3 } as const;
  const scored = readingCycle.map((skill,index)=>{
    const list=grouped.get(skill)!; const latest=list.at(-1);
    const score=list.length*4 + (latest?levelRank[latest.level]:0) + (index===sessionCount%readingCycle.length ? -1 : 0);
    return {skill,list,latest,score,index};
  }).sort((a,b)=>a.score-b.score||a.index-b.index);
  const chosen=scored[0]!; const level=chosen.latest?.level;
  const difficulty:1|2|3 = level === 'independent' ? 3 : level === 'consistent' ? 2 : 1;
  const evidence = evidenceRegistry.find(e => e.skill === chosen.skill && e.id.startsWith('READ.'))!;
  return { skill: chosen.skill, difficulty, evidence };
}
export function selectWritingSkill(text:string): {skill:WritingSkill; evidence:EvidenceEntry} {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const sentences = text.split(/[.!?]+/).filter(s=>s.trim()).length;
  const skill:WritingSkill = words < 20 ? 'elaboration' : sentences <= 1 && words > 28 ? 'sentence_clarity' : !/because|for example|when|so that|this shows/i.test(text) ? 'supporting_details' : 'revision';
  return { skill, evidence:evidenceRegistry.find(e=>e.skill===skill && e.id.startsWith('WRITE.'))! };
}
export function deterministicQuestion(skill:ReadingSkill, difficulty:number) {
  const q:Record<ReadingSkill,string> = {
    recall:'What is the most important thing that happened in what you read today?',
    sequencing:'What happened first, and what happened because of it?',
    inference:'What is something you can figure out even though the book may not say it directly?',
    prediction:'What do you think may happen next, and what from today’s reading makes you think that?',
    character_motivation:'Why do you think a character made one of the choices you remembered?',
    cause_effect:'What caused one important event you remembered to happen?',
    main_idea:'What was the biggest idea or most important event in today’s reading?',
    supporting_details:'What detail from today’s reading best supports what you remembered?',
    problem_solution:'What problem did a character face, and what did they do about it?',
    text_evidence:'What happened in today’s reading that supports one of your ideas about the story?',
    vocabulary_context:'Was there a word or phrase whose meaning you figured out from what was happening around it? Explain.',
    comparison:'How were two characters, events, or moments you read about alike or different?'
  };
  return { skill, difficulty:Math.max(1,Math.min(3,difficulty)), question:q[skill], requiresTextEvidence:['inference','prediction','character_motivation','text_evidence','comparison'].includes(skill) };
}
export function deterministicRevision(skill:WritingSkill) {
  const c:Record<WritingSkill,string> = {
    elaboration:'Choose one idea you wrote and add one useful detail so a reader can picture or understand it better.',
    organization:'Reread your writing. Move or change one part so the ideas happen in an order that is easier to follow.',
    sentence_clarity:'Find one sentence that feels crowded or hard to follow. Change it so your meaning is clearer.',
    supporting_details:'Add one specific detail from what you read that supports the point you are making.',
    evidence:'Add one story detail that helps prove why your idea makes sense.',
    revision:'Reread your response and make one change that makes your meaning stronger for a reader.',
    conventions:'Choose one sentence and check its ending punctuation and capital letters. Fix only what needs fixing.'
  };
  return {skill,challenge:c[skill]};
}
