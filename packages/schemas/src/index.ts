import { z } from 'zod';

export const ReadingSkillSchema = z.enum(['recall','sequencing','inference','prediction','character_motivation','cause_effect','main_idea','supporting_details','problem_solution','text_evidence','vocabulary_context','comparison']);
export type ReadingSkill = z.infer<typeof ReadingSkillSchema>;
export const WritingSkillSchema = z.enum(['elaboration','organization','sentence_clarity','supporting_details','evidence','revision','conventions']);
export type WritingSkill = z.infer<typeof WritingSkillSchema>;

export const QuestionResultSchema = z.object({
  skill: ReadingSkillSchema,
  question: z.string().min(8).max(240),
  difficulty: z.number().int().min(1).max(3),
  requiresTextEvidence: z.boolean()
});
export type QuestionResult = z.infer<typeof QuestionResultSchema>;

export const EvaluationResultSchema = z.object({
  demonstrated: z.enum(['developing','practicing','consistent','independent']),
  confidence: z.enum(['low','medium','high']),
  evidencePresent: z.boolean(),
  observations: z.array(z.string().max(160)).max(3)
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const RevisionResultSchema = z.object({
  skill: WritingSkillSchema,
  challenge: z.string().min(8).max(220)
});
export type RevisionResult = z.infer<typeof RevisionResultSchema>;

export const ParentSummarySchema = z.object({
  summary: z.string().min(20).max(700),
  strengths: z.array(z.string().max(180)).max(3),
  nextSteps: z.array(z.string().max(180)).max(3)
});
export type ParentSummary = z.infer<typeof ParentSummarySchema>;
