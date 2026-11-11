declare module 'virtual:miyu-courses' {
  import type { PublicCourse, SiteConfig } from './lib/contract';
  export const site: SiteConfig;
  export const courses: PublicCourse[];
  export const includesDrafts: boolean;
}
