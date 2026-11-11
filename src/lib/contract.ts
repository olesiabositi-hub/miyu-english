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

/* ------------------------------------------------------------------------------------------
 * Internal, course-agnostic lesson model used by every renderer component.
 * Each lesson contract version has an adapter (build/adapters/) that maps it into this shape,
 * so a future contract (e.g. for Greek A0→A2) needs an adapter, not a new renderer.
 * ------------------------------------------------------------------------------------------ */

/**
 * What the browser receives. Built from a Lesson at build time (build/lessons-plugin.ts):
 *  - answer keys are replaced by salted SHA-256 hashes (no plain keys in page source),
 *  - tutorRules and quality.notes are removed (tutor-side / editorial only),
 *  - assetRefs are resolved to URLs, or dropped when the file does not exist.
 */
export interface PublicScoring {
  mode: ScoringMode;
  maxPoints: number;
  /** salted hashes of exact keys (choice / ordering / auto short text / full-set gap fill) */
  keyHashes?: string[];
  keyCount?: number;
  /** gap_fill with one accepted answer per blank: hashes per blank (index = blank) */
  partHashes?: string[][];
  /** matching: hashes of correct "item-option" pairs */
  pairHashes?: string[];
  /** plain model answers, shown only after submission (owner decision 0005: keys may be visible in the browser) */
  modelAnswers?: string[];
  rubric?: string;
  evidenceSpanIds?: string[];
}
/** Site-side presentation settings for one task (content/courses/<id>/lesson-ui/<lesson>.json). */
export interface TaskUi {
  justification?: { label?: string };
  speaking?: {
    followUpFromTutorRules?: boolean;
    startWithinSeconds?: number;
    minSeconds?: number;
    maxSeconds?: number;
    segments?: { label: string; targetSeconds?: number }[];
  };
}
export interface PublicTask extends Omit<Task, 'scoring' | 'tutorRules'> {
  scoring: PublicScoring;
  /** matching: the left-hand items (key "1", label "what drives me") */
  matchItems?: { key: string; label: string }[];
  /** unseen follow-up questions for spontaneous speaking, extracted at build time */
  followUpQuestions?: string[];
  ui?: TaskUi;
}
export interface PublicSection extends Omit<Section, 'assetRefs'> { audio?: string[]; images?: string[]; missingAssets?: number }
export interface PublicLesson extends Omit<Lesson, 'tasks' | 'sections' | 'quality' | 'level' | 'language' | 'schemaVersion'> {
  courseId: string;
  schemaVersion: string;
  /** CEFR (or course-scale) level label as given by the course content */
  level: string;
  /** BCP 47 language of the learning content */
  language: string;
  sections: PublicSection[];
  tasks: PublicTask[];
  quality: Omit<Quality, 'notes'>;
  /** true for the interface demo fixture; never real course content */
  demo?: boolean;
  /** draft lesson released by the owner as a PILOT (course.json → pilotLessons); not methodologically approved */
  pilot?: boolean;
}

/** Publishing gate from the contract: approved/published AND every QA flag true. */
export const isPublishable = (l: Pick<Lesson, 'status' | 'quality'>) =>
  (l.status === 'approved' || l.status === 'published') && l.quality.editorialApproved && l.quality.answerKeyVerified && l.quality.audioReviewed;

/* ---------------------------------- Course configuration ---------------------------------- */
export type FeatureState = 'available' | 'planned' | 'off';
export interface CourseModule { id: string; number: number; title: string; days?: string; skills?: string[]; lessons: { id: string; number: number; title: string }[] }
export interface CourseConfig {
  id: string;
  title: string;
  tagline?: string;
  targetLanguage: { code: string; name: string; script: string; dir: 'ltr' | 'rtl' };
  uiLanguage: string;
  explanationLanguages?: string[];
  levels: { from: string; to: string; scale: string[]; framework?: string };
  totalLessons: number;
  contract: { version: string; schema: string; lessonsDir: string; assetsDir: string; lessonIdPattern: string };
  theme: string;
  answerMatching: { caseSensitive: boolean; ignoreDiacritics: boolean; ignoreTrailingPunctuation: boolean };
  input?: { specialCharacters?: string[] };
  features?: Record<string, FeatureState>;
  practice?: { quickChallenges?: { prompt: string; seconds?: number }[] };
  /** Owner-approved draft lessons playable as PILOT (decision 0005). */
  pilotLessons?: string[];
  modules: CourseModule[];
}
/** Course as shipped to the browser: config + its published lessons (+ optional interface demo). */
export interface PublicCourse { config: Omit<CourseConfig, 'contract'> & { contractVersion: string }; lessons: PublicLesson[]; demo: PublicLesson | null }
export interface SiteConfig { defaultCourse: string; courses: string[] }
