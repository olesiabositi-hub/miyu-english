/**
 * TypeScript mirror of schemas/lesson.schema.json — MIYU English Lesson Contract v1.0.0.
 * The schema is owned jointly with the content team (Codex). Do not add fields here
 * without a versioned schema change on both sides.
 */
export type Level = 'B2' | 'B2+' | 'C1';
export type LessonStatus = 'draft' | 'review' | 'approved' | 'published';
export type SectionType = 'intro' | 'reading' | 'listening' | 'grammar' | 'vocabulary' | 'pronunciation' | 'speaking' | 'writing' | 'mediation' | 'reflection' | 'review' | 'other';
export type ResponseType = 'single_choice' | 'multiple_choice' | 'short_text' | 'long_text' | 'audio_recording' | 'ordering' | 'matching' | 'gap_fill' | 'self_reflection';
export type ScoringMode = 'auto' | 'rubric' | 'manual' | 'formative';

export interface EvidenceSpan { id: string; text: string; startSeconds?: number; endSeconds?: number }
export interface Section { id: string; type: SectionType; title: string; content: string; assetRefs?: string[]; transcript?: string; evidenceSpans?: EvidenceSpan[] }
export interface Option { id: string; text: string }
export interface Scoring { mode: ScoringMode; maxPoints: number; correctOptionIds?: string[]; acceptedAnswers?: string[]; rubric?: string; evidenceSpanIds?: string[] }
export interface Task { id: string; type: string; sectionId?: string; prompt: string; responseType: ResponseType; options?: Option[]; scoring: Scoring; dependencies: string[]; feedback?: string; tutorRules?: string[] }
export interface Review { retrievalPrompts: string[]; delayedTransfer: string }
export interface Quality { editorialApproved: boolean; answerKeyVerified: boolean; audioReviewed: boolean; notes: string[] }

export interface Lesson {
  schemaVersion: '1.0.0';
  id: string;
  moduleId: string;
  sequence: number;
  title: string;
  level: Level;
  status: LessonStatus;
  language: 'en';
  durationMinutes: number;
  outcomes: string[];
  cefrScale?: string;
  lexicalChunks: string[];
  grammar: string[];
  sections: Section[];
  tasks: Task[];
  review: Review;
  quality: Quality;
}

/**
 * What the browser receives. Built from a Lesson at build time (build/lessons-plugin.ts):
 *  - answer keys are replaced by salted SHA-256 hashes (no plain keys in page source),
 *  - tutorRules and quality.notes are removed (tutor-side / editorial only),
 *  - assetRefs are resolved to URLs, or dropped when the file does not exist.
 */
export interface PublicScoring { mode: ScoringMode; maxPoints: number; keyHashes?: string[]; keyCount?: number; rubric?: string; evidenceSpanIds?: string[] }
export interface PublicTask extends Omit<Task, 'scoring' | 'tutorRules'> { scoring: PublicScoring }
export interface PublicSection extends Omit<Section, 'assetRefs'> { audio?: string[]; images?: string[]; missingAssets?: number }
export interface PublicLesson extends Omit<Lesson, 'tasks' | 'sections' | 'quality'> {
  sections: PublicSection[];
  tasks: PublicTask[];
  quality: Omit<Quality, 'notes'>;
  /** true for the interface demo fixture; never real course content */
  demo?: boolean;
}

/** Publishing gate from the contract: approved/published AND every QA flag true. */
export const isPublishable = (l: Pick<Lesson, 'status' | 'quality'>) =>
  (l.status === 'approved' || l.status === 'published') && l.quality.editorialApproved && l.quality.answerKeyVerified && l.quality.audioReviewed;
