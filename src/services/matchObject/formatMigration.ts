// Format Migration Helper
// Converts legacy UMO format codes to Factory matchUpFormatCode standards

// Legacy UMO import removed - LEGACY_TO_FACTORY mapping table covers all cases

/**
 * Complete mapping of legacy UMO format codes to Factory format codes
 * 
 * This allows for clean break from legacy codes while maintaining
 * backward compatibility for stored match data.
 */
export const LEGACY_TO_FACTORY: Record<string, string> = {
  // Match formats (11 total)
  '3_6a_7': 'SET3-S:6/TB7',              // Standard Best of 3
  '3_6n_7': 'SET3-S:6NOAD/TB7',          // Best of 3, No-Ad
  '3_4n_10': 'SET3-S:4NOAD/TB7-F:TB10',  // Best of 3, Short sets, Supertiebreak
  '1_4n_7': 'SET1-S:4NOAD/TB7@3',        // Single short set (Under 10 Qualifying)
  '3_6n_10': 'SET3-S:6NOAD/TB7-F:TB10',  // Best of 3, No-Ad, Supertiebreak
  '5_6a_7': 'SET5-S:6/TB7',              // Best of 5 (US Open Men)
  '5_6a_7_long': 'SET5-S:6/TB7-F:6',     // Best of 5, Long final set (Wimbledon classic)
  '3_6a_7_long': 'SET3-S:6/TB7-F:6',     // Best of 3, Long final set
  '1_8a_7': 'SET1-S:8/TB7',              // 8-game pro set
  '1_8n_7': 'SET1-S:8NOAD/TB7',          // 8-game pro set, No-Ad
  '1_6a_7': 'SET1-S:6NOAD/TB7',          // 6-game college doubles set

  // Set formats (9 total) - these might not be directly used in tennisvisuals-mobile
  // but including for completeness
  'AdSetsTo6tb7': 'S:6/TB7',
  'NoAdSetsTo6tb7': 'S:6NOAD/TB7',
  'NoAdSetsTo4tb7': 'S:4NOAD/TB7@3',
  'longSetTo6by2': 'S:6',
  'supertiebreak': 'S:TB10',
  'pro10a12': 'S:10NOAD/TB12',
  'pro8a7': 'S:8/TB7',
  'NoAdPro8a7': 'S:8NOAD/TB7',
  // Note: college6a7 also maps to S:6NOAD/TB7 (same as NoAdSetsTo6tb7)
  // but we use NoAdSetsTo6tb7 as the primary legacy code for reverse mapping
  'college6a7': 'S:6NOAD/TB7',
};

/**
 * Reverse mapping: Factory → Legacy
 * Generated from LEGACY_TO_FACTORY for backward compatibility
 */
export const FACTORY_TO_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_TO_FACTORY).map(([legacy, factory]) => [factory, legacy])
);

/**
 * Human-readable format names for UI display
 */
export const FORMAT_NAMES: Record<string, string> = {
  'SET3-S:6/TB7': 'Standard Best of 3',
  'SET3-S:6NOAD/TB7': 'Best of 3 (No-Ad)',
  'SET3-S:4NOAD/TB7-F:TB10': 'Fast4 with Supertiebreak',
  'SET1-S:4NOAD/TB7@3': 'Short Set (Under 10)',
  'SET3-S:6NOAD/TB7-F:TB10': 'Best of 3 with Final Set Tiebreak',
  'SET5-S:6/TB7': 'Best of 5 (US Open)',
  'SET5-S:6/TB7-F:6': 'Best of 5 (Long Final Set)',
  'SET3-S:6/TB7-F:6': 'Best of 3 (Long Final Set)',
  'SET1-S:8/TB7': '8-Game Pro Set',
  'SET1-S:8NOAD/TB7': '8-Game Pro Set (No-Ad)',
  'SET1-S:6NOAD/TB7': '6-Game College Set',
};

/**
 * Check if a format code is a legacy format
 */
export function isLegacyFormat(code: string): boolean {
  return code in LEGACY_TO_FACTORY;
}

/**
 * Check if a format code is a Factory format
 */
export function isFactoryFormat(code: string): boolean {
  return code.startsWith('SET') || code.startsWith('S:') || code.startsWith('T');
}

/**
 * Migrate a legacy format code to Factory format code
 * 
 * @param legacyCode - Legacy UMO format code (e.g., '3_6a_7')
 * @returns Factory format code (e.g., 'SET3-S:6/TB7')
 */
export function migrateFormat(legacyCode: string): string {
  // If already Factory format, return as-is
  if (isFactoryFormat(legacyCode)) {
    return legacyCode;
  }

  // Use mapping table first
  if (legacyCode in LEGACY_TO_FACTORY) {
    return LEGACY_TO_FACTORY[legacyCode];
  }

  // If all else fails, return original (will be caught in validation)
  console.warn(`Unable to migrate format code: ${legacyCode}`);
  return legacyCode;
}

/**
 * Get human-readable name for a format code
 * 
 * @param code - Format code (legacy or Factory)
 * @returns Human-readable format name
 */
export function getFormatName(code: string): string {
  // Try Factory code first
  if (code in FORMAT_NAMES) {
    return FORMAT_NAMES[code];
  }

  // Try migrating from legacy
  if (isLegacyFormat(code)) {
    const factoryCode = migrateFormat(code);
    return FORMAT_NAMES[factoryCode] || code;
  }

  // Return code as fallback
  return code;
}

/**
 * Migrate stored match data from legacy to Factory formats
 * 
 * This function handles:
 * - Format code in match metadata
 * - Nested format references
 * - Backwards compatibility
 * 
 * @param matchData - Stored match data object
 * @returns Migrated match data
 */
export function migrateMatchData(matchData: any): any {
  if (!matchData) return matchData;

  // Clone to avoid mutating original
  const migrated = { ...matchData };

  // Migrate top-level format code
  if (migrated.format && typeof migrated.format === 'string') {
    migrated.format = migrateFormat(migrated.format);
  }

  // Migrate format in metadata
  if (migrated.metadata?.format) {
    migrated.metadata.format = migrateFormat(migrated.metadata.format);
  }

  // Migrate format in match settings
  if (migrated.settings?.format) {
    migrated.settings.format = migrateFormat(migrated.settings.format);
  }

  // Add migration flag for tracking
  if (matchData.format !== migrated.format) {
    migrated._migrated = {
      from: matchData.format,
      to: migrated.format,
      timestamp: new Date().toISOString(),
    };
  }

  return migrated;
}

/**
 * Get all available format codes for dropdowns/selectors
 * Returns Factory format codes with human-readable names
 */
export function getAvailableFormats(): Array<{ code: string; name: string; category: string }> {
  return [
    // Standard formats
    { code: 'SET3-S:6/TB7', name: 'Standard Best of 3', category: 'Standard' },
    { code: 'SET5-S:6/TB7', name: 'Best of 5 (US Open)', category: 'Standard' },

    // No-Ad formats
    { code: 'SET3-S:6NOAD/TB7', name: 'Best of 3 (No-Ad)', category: 'No-Ad' },
    { code: 'SET3-S:6NOAD/TB7-F:TB10', name: 'Best of 3 with Final Set Tiebreak', category: 'No-Ad' },

    // Fast4 / Short formats
    { code: 'SET3-S:4NOAD/TB7-F:TB10', name: 'Fast4 with Supertiebreak', category: 'Fast4' },
    { code: 'SET1-S:4NOAD/TB7@3', name: 'Short Set (Under 10)', category: 'Fast4' },

    // Long final set formats
    { code: 'SET5-S:6/TB7-F:6', name: 'Best of 5 (Long Final Set)', category: 'Grand Slam' },
    { code: 'SET3-S:6/TB7-F:6', name: 'Best of 3 (Long Final Set)', category: 'Grand Slam' },

    // Pro sets
    { code: 'SET1-S:8/TB7', name: '8-Game Pro Set', category: 'Pro Set' },
    { code: 'SET1-S:8NOAD/TB7', name: '8-Game Pro Set (No-Ad)', category: 'Pro Set' },
    { code: 'SET1-S:6NOAD/TB7', name: '6-Game College Set', category: 'College' },
  ];
}

/**
 * Validate that a format code is recognized
 * 
 * @param code - Format code to validate
 * @returns true if valid Factory or legacy code
 */
export function isValidFormatCode(code: string): boolean {
  if (!code) return false;

  // Check if Factory format
  if (isFactoryFormat(code)) {
    return true;
  }

  return isLegacyFormat(code);
}

/**
 * Batch migrate multiple format codes
 * Useful for migrating collections or arrays
 * 
 * @param codes - Array of format codes
 * @returns Array of migrated Factory codes
 */
export function migrateBatch(codes: string[]): string[] {
  return codes.map(migrateFormat);
}

/**
 * Get migration statistics for reporting
 * 
 * @param matchDataArray - Array of match data objects
 * @returns Migration statistics
 */
export function getMigrationStats(matchDataArray: any[]): {
  total: number;
  needsMigration: number;
  alreadyMigrated: number;
  byFormat: Record<string, number>;
} {
  const stats = {
    total: matchDataArray.length,
    needsMigration: 0,
    alreadyMigrated: 0,
    byFormat: {} as Record<string, number>,
  };

  matchDataArray.forEach((match) => {
    const format = match?.format || match?.metadata?.format;
    if (!format) return;

    // Count by format
    stats.byFormat[format] = (stats.byFormat[format] || 0) + 1;

    // Check if needs migration
    if (isLegacyFormat(format)) {
      stats.needsMigration++;
    } else if (isFactoryFormat(format)) {
      stats.alreadyMigrated++;
    }
  });

  return stats;
}

/**
 * Export format information for external use
 */
export const formatMigration = {
  migrateFormat,
  migrateMatchData,
  migrateBatch,
  getFormatName,
  getAvailableFormats,
  isValidFormatCode,
  isLegacyFormat,
  isFactoryFormat,
  getMigrationStats,
  LEGACY_TO_FACTORY,
  FACTORY_TO_LEGACY,
  FORMAT_NAMES,
};

export default formatMigration;
