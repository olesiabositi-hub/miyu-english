declare module 'virtual:miyu-lessons' {
  import type { PublicLesson } from './lib/contract';
  export const lessons: PublicLesson[];
  export const demo: PublicLesson | null;
  export const includesDrafts: boolean;
}
