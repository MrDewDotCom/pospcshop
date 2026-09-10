import { describe, expect, it } from 'vitest';
import { CATEGORY_KINDS } from '../enums';
import { SPEC_DEFINITIONS, formatSpecs, parseSpecs, specSummary } from './index';

describe('spec definitions', () => {
  it('have unique keys per kind', () => {
    for (const kind of CATEGORY_KINDS) {
      const keys = SPEC_DEFINITIONS[kind].map((f) => f.key);
      expect(new Set(keys).size, kind).toBe(keys.length);
    }
  });

  it('define the fields the compatibility rules need', () => {
    const compatKeys = (kind: keyof typeof SPEC_DEFINITIONS) =>
      SPEC_DEFINITIONS[kind].filter((f) => f.compat).map((f) => f.key);
    expect(compatKeys('cpu')).toEqual(expect.arrayContaining(['socket', 'tdpWatt']));
    expect(compatKeys('mainboard')).toEqual(
      expect.arrayContaining(['socket', 'ramType', 'formFactor']),
    );
    expect(compatKeys('psu')).toContain('psuWatt');
    expect(compatKeys('gpu')).toContain('gpuPowerWatt');
  });
});

describe('parseSpecs', () => {
  it('accepts valid specs, drops empty values and unknown keys', () => {
    const result = parseSpecs('cpu', {
      socket: 'AM5',
      cores: 6,
      tdpWatt: 65,
      memoryTypes: ['DDR5', 'DDR5'],
      integratedGraphics: true,
      chipset: '',
      notACpuField: 'x',
    });
    expect(result).toEqual({
      ok: true,
      specs: {
        socket: 'AM5',
        cores: 6,
        tdpWatt: 65,
        memoryTypes: ['DDR5'],
        integratedGraphics: true,
      },
    });
  });

  it('reports invalid values with Thai messages and paths', () => {
    const result = parseSpecs('mainboard', { socket: 'AM3', ramSlots: -2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.path)).toEqual(['specs.socket', 'specs.ramSlots']);
      expect(result.errors[0]!.message).toContain('ซ็อกเก็ต');
    }
  });

  it('accepts anything empty for kinds without spec fields', () => {
    expect(parseSpecs('accessory', { color: 'black' })).toEqual({ ok: true, specs: {} });
  });
});

describe('formatSpecs', () => {
  it('formats values with units in definition order', () => {
    const specs = { tdpWatt: 65, socket: 'AM5', integratedGraphics: false, memoryTypes: ['DDR5'] };
    expect(formatSpecs('cpu', specs)).toEqual([
      { key: 'socket', label: 'ซ็อกเก็ต', value: 'AM5' },
      { key: 'tdpWatt', label: 'TDP', value: '65 W' },
      { key: 'memoryTypes', label: 'แรมที่รองรับ', value: 'DDR5' },
      { key: 'integratedGraphics', label: 'มีกราฟิกในตัว', value: 'ไม่มี' },
    ]);
    expect(specSummary('cpu', specs, 2)).toBe('ซ็อกเก็ต AM5 · TDP 65 W');
  });
});
