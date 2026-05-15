import { facebook } from "./facebook";
import { telegram } from "./telegram";
import { twitter } from "./twitter";
import type { SocialPoster } from "./types";

/**
 * Registry of all social platform adapters. Order matters: this is the
 * sequence the runner iterates in, so platforms higher up post first
 * during a single tick.
 */
export const SOCIAL_PLATFORMS: SocialPoster[] = [facebook, telegram, twitter];

export function enabledPlatforms(): SocialPoster[] {
  return SOCIAL_PLATFORMS.filter((p) => p.enabled());
}

export function platformByName(name: string): SocialPoster | undefined {
  return SOCIAL_PLATFORMS.find((p) => p.platform === name);
}

export type { SocialPoster, SocialPostResult, PostContent } from "./types";
