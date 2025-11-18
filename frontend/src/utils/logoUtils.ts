/**
 * Utility functions for handling company logos
 * Supports light and dark variants based on background context
 */

export type LogoVariant = 'light' | 'dark';

/**
 * Get the appropriate logo path based on the background context
 * @param variant - 'light' for dark backgrounds, 'dark' for light backgrounds
 * @param fallback - Optional fallback logo path if variant doesn't exist
 * @returns Path to the logo image
 */
export function getLogoPath(variant: LogoVariant = 'light', fallback?: string): string {
  const logoPath = `/logo-${variant}.png`;
  
  // If fallback is provided and we want to check if logo exists, we could do that here
  // For now, we'll just return the path and let the img onError handle missing files
  return logoPath;
}

/**
 * Get logo path for dark backgrounds (use light logo)
 */
export function getLogoForDarkBackground(fallback?: string): string {
  return getLogoPath('light', fallback);
}

/**
 * Get logo path for light backgrounds (use dark logo)
 */
export function getLogoForLightBackground(fallback?: string): string {
  return getLogoPath('dark', fallback);
}

