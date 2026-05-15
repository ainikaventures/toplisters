import type { Job } from "@/lib/generated/prisma/client";

/**
 * Common adapter interface for "post a job to platform X." Mirrors the
 * `JobSource` plugin pattern (lib/sources) — adding a new platform is
 * one new file + env vars, no scheduler / runner changes.
 */
export interface SocialPoster {
  /** Stable identifier persisted in `social_posts.platform`. */
  readonly platform: string;
  /** Human-readable label for logs and the admin dashboard. */
  readonly label: string;
  /** True when env vars (tokens / page id / channel id) are present. */
  enabled(): boolean;
  /** Post the job. Throws on failure; the runner records the error. */
  post(job: Job): Promise<SocialPostResult>;
  /**
   * Max posts/day for this platform. Used by the runner's rate cap.
   * Twitter free tier ~ 16/day → keep this well under to leave headroom
   * for manual posts. Telegram is essentially unlimited but spammy >5/day.
   */
  dailyCap(): number;
}

export interface SocialPostResult {
  /** Platform-side post id (Graph API id, tweet id, message id). */
  externalId: string;
  /** Direct URL to the post when the platform exposes one. */
  externalUrl: string | null;
}

/**
 * Shared post composition. Each adapter formats this into its own
 * length/markdown constraints, but the inputs are platform-agnostic so
 * the upstream curator only thinks about the job, not the platform.
 */
export interface PostContent {
  /** Up to ~240 chars — fits Twitter even with the URL appended. */
  short: string;
  /** Multi-paragraph version for Facebook + Telegram (no length cap in practice). */
  long: string;
  /** Public job URL. Append at end. */
  url: string;
  /** Lowercase, no # — adapters add the # prefix per platform convention. */
  hashtags: string[];
}
