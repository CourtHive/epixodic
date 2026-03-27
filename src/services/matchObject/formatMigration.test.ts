import { describe, it, expect } from 'vitest';
import {
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
} from './formatMigration';

const SET3 = 'SET3-S:6/TB7';
const SET5 = 'SET5-S:6/TB7';
const SET3_NOAD = 'SET3-S:6NOAD/TB7-F:TB10';
const SET5_LONG = 'SET5-S:6/TB7-F:6';
const LEGACY_3 = '3_6a_7';
const LEGACY_5 = '5_6a_7';

describe('Format Migration', () => {
  describe('migrateFormat()', () => {
    it('should migrate all legacy match formats', () => {
      expect(migrateFormat(LEGACY_3)).toBe(SET3);
      expect(migrateFormat(LEGACY_5)).toBe(SET5);
      expect(migrateFormat('3_6n_10')).toBe(SET3_NOAD);
      expect(migrateFormat('5_6a_7_long')).toBe(SET5_LONG);
      expect(migrateFormat('1_8a_7')).toBe('SET1-S:8/TB7');
    });

    it('should pass through Factory formats unchanged', () => {
      expect(migrateFormat(SET3)).toBe(SET3);
      expect(migrateFormat(SET5_LONG)).toBe(SET5_LONG);
    });

    it('should handle unknown formats', () => {
      const result = migrateFormat('unknown');
      expect(result).toBe('unknown'); // Falls back to original
    });
  });

  describe('isLegacyFormat() and isFactoryFormat()', () => {
    it('should identify legacy formats', () => {
      expect(isLegacyFormat(LEGACY_3)).toBe(true);
      expect(isLegacyFormat(LEGACY_5)).toBe(true);
      expect(isLegacyFormat(SET3)).toBe(false);
    });

    it('should identify Factory formats', () => {
      expect(isFactoryFormat(SET3)).toBe(true);
      expect(isFactoryFormat(SET5_LONG)).toBe(true);
      expect(isFactoryFormat('T120P')).toBe(true);
      expect(isFactoryFormat(LEGACY_3)).toBe(false);
    });
  });

  describe('migrateMatchData()', () => {
    it('should migrate format in match data', () => {
      const legacy = { format: LEGACY_3, score: '6-4, 6-3' };
      const migrated = migrateMatchData(legacy);
      
      expect(migrated.format).toBe(SET3);
      expect(migrated.score).toBe('6-4, 6-3');
      expect(migrated._migrated).toBeDefined();
      expect(migrated._migrated.from).toBe(LEGACY_3);
      expect(migrated._migrated.to).toBe(SET3);
    });

    it('should migrate format in nested metadata', () => {
      const legacy = {
        metadata: { format: LEGACY_5, players: ['A', 'B'] },
        score: '6-4, 6-3, 6-2',
      };
      const migrated = migrateMatchData(legacy);
      
      expect(migrated.metadata.format).toBe(SET5);
    });

    it('should not modify already-migrated data', () => {
      const factory = { format: SET3, score: '6-4, 6-3' };
      const migrated = migrateMatchData(factory);
      
      expect(migrated.format).toBe(SET3);
      expect(migrated._migrated).toBeUndefined();
    });
  });

  describe('migrateBatch()', () => {
    it('should migrate array of format codes', () => {
      const legacy = [LEGACY_3, LEGACY_5, '3_6n_10'];
      const migrated = migrateBatch(legacy);
      
      expect(migrated).toEqual([
        SET3,
        SET5,
        SET3_NOAD,
      ]);
    });

    it('should handle mixed legacy and factory codes', () => {
      const mixed = [LEGACY_3, SET5, '3_6n_10'];
      const migrated = migrateBatch(mixed);
      
      expect(migrated).toEqual([
        SET3,
        SET5,
        SET3_NOAD,
      ]);
    });
  });

  describe('getFormatName()', () => {
    it('should return human-readable names for Factory codes', () => {
      expect(getFormatName(SET3)).toBe('Standard Best of 3');
      expect(getFormatName(SET5)).toBe('Best of 5 (US Open)');
      expect(getFormatName(SET5_LONG)).toBe('Best of 5 (Long Final Set)');
    });

    it('should migrate legacy codes and return names', () => {
      expect(getFormatName(LEGACY_3)).toBe('Standard Best of 3');
      expect(getFormatName(LEGACY_5)).toBe('Best of 5 (US Open)');
    });

    it('should return code itself if no name found', () => {
      expect(getFormatName('unknown')).toBe('unknown');
    });
  });

  describe('getAvailableFormats()', () => {
    it('should return array of format objects', () => {
      const formats = getAvailableFormats();
      
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      expect(formats[0]).toHaveProperty('code');
      expect(formats[0]).toHaveProperty('name');
      expect(formats[0]).toHaveProperty('category');
    });

    it('should only include Factory format codes', () => {
      const formats = getAvailableFormats();
      
      formats.forEach((format) => {
        expect(isFactoryFormat(format.code)).toBe(true);
      });
    });
  });

  describe('isValidFormatCode()', () => {
    it('should accept valid Factory codes', () => {
      expect(isValidFormatCode(SET3)).toBe(true);
      expect(isValidFormatCode(SET5_LONG)).toBe(true);
    });

    it('should accept valid legacy codes', () => {
      expect(isValidFormatCode(LEGACY_3)).toBe(true);
      expect(isValidFormatCode(LEGACY_5)).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(isValidFormatCode('invalid')).toBe(false);
      expect(isValidFormatCode('')).toBe(false);
    });
  });

  describe('getMigrationStats()', () => {
    it('should calculate migration statistics', () => {
      const matches = [
        { format: LEGACY_3 },
        { format: LEGACY_5 },
        { format: SET3 },
        { format: '3_6n_10' },
      ];

      const stats = getMigrationStats(matches);

      expect(stats.total).toBe(4);
      expect(stats.needsMigration).toBe(3); // 3 legacy
      expect(stats.alreadyMigrated).toBe(1); // 1 factory
      expect(stats.byFormat[LEGACY_3]).toBe(1);
      expect(stats.byFormat[SET3]).toBe(1);
    });

    it('should handle empty array', () => {
      const stats = getMigrationStats([]);
      
      expect(stats.total).toBe(0);
      expect(stats.needsMigration).toBe(0);
      expect(stats.alreadyMigrated).toBe(0);
    });
  });

  describe('Format mappings', () => {
    it('should have bidirectional mapping for all formats', () => {
      Object.entries(LEGACY_TO_FACTORY).forEach(([_legacy, factory]) => {
        expect(factory).toBeTruthy();
        expect(isFactoryFormat(factory)).toBe(true);
        
        // Check reverse mapping exists (note: some factory codes may map to multiple legacy codes)
        expect(FACTORY_TO_LEGACY[factory]).toBeTruthy();
      });
    });

    it('should have all expected match formats', () => {
      const expectedFormats = [
        LEGACY_3,
        '3_6n_7',
        '3_4n_10',
        '1_4n_7',
        '3_6n_10',
        LEGACY_5,
        '5_6a_7_long',
        '3_6a_7_long',
        '1_8a_7',
        '1_8n_7',
        '1_6a_7',
      ];

      expectedFormats.forEach((format) => {
        expect(LEGACY_TO_FACTORY[format]).toBeDefined();
      });
    });
  });
});
