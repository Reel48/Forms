/**
 * Utility functions for handling company logos
 * Supports light and dark variants based on background context
 */

export type LogoVariant = 'light' | 'dark';

/**
 * Get the appropriate logo path based on the background context
 * @param variant - 'light' for dark backgrounds, 'dark' for light backgrounds
 * @returns Path to the logo image
 */
export function getLogoPath(variant: LogoVariant = 'light'): string {
  const logoPath = `/logo-${variant}.png`;
  return logoPath;
}

/**
 * Get logo path for dark backgrounds (use light logo)
 */
export function getLogoForDarkBackground(): string {
  return getLogoPath('light');
}

/**
 * Get logo path for light backgrounds (use dark logo)
 */
export function getLogoForLightBackground(): string {
  return getLogoPath('dark');
}

