// Spec fields per category kind. One definition drives the product form, server-side validation,
// spec summaries (lists, posts), and the Phase 3 compatibility rules (fields marked `compat`).
// Keys are English and stable: compatibility rules and saved products depend on them.

import type { CategoryKind } from '../enums';

export interface SpecOption {
  value: string;
  label: string;
}

interface BaseField {
  key: string;
  label: string;
  /** Used by a compatibility rule (Phase 3). Shown with a hint in the form. */
  compat?: boolean;
}

export type SpecField =
  | (BaseField & { type: 'text'; placeholder?: string })
  | (BaseField & { type: 'number'; unit?: string; step?: number; max?: number })
  | (BaseField & { type: 'select'; options: SpecOption[] })
  | (BaseField & { type: 'multiselect'; options: SpecOption[] })
  | (BaseField & { type: 'boolean' });

const opts = (...values: string[]): SpecOption[] =>
  values.map((value) => ({ value, label: value }));

export const CPU_SOCKETS = opts('AM4', 'AM5', 'LGA1200', 'LGA1700', 'LGA1851');
export const RAM_TYPES = opts('DDR4', 'DDR5');
export const BOARD_FORM_FACTORS = opts('E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX');
const PSU_FORM_FACTORS = opts('ATX', 'SFX', 'SFX-L');

export const SPEC_DEFINITIONS: Record<CategoryKind, SpecField[]> = {
  cpu: [
    { key: 'socket', label: 'ซ็อกเก็ต', type: 'select', options: CPU_SOCKETS, compat: true },
    { key: 'cores', label: 'จำนวนคอร์', type: 'number', max: 256 },
    { key: 'threads', label: 'จำนวนเธรด', type: 'number', max: 512 },
    {
      key: 'baseClockGhz',
      label: 'ความเร็วพื้นฐาน',
      type: 'number',
      unit: 'GHz',
      step: 0.1,
      max: 10,
    },
    {
      key: 'boostClockGhz',
      label: 'ความเร็วสูงสุด',
      type: 'number',
      unit: 'GHz',
      step: 0.1,
      max: 10,
    },
    { key: 'tdpWatt', label: 'TDP', type: 'number', unit: 'W', max: 1000, compat: true },
    {
      key: 'memoryTypes',
      label: 'แรมที่รองรับ',
      type: 'multiselect',
      options: RAM_TYPES,
      compat: true,
    },
    { key: 'integratedGraphics', label: 'มีกราฟิกในตัว', type: 'boolean' },
  ],
  mainboard: [
    { key: 'socket', label: 'ซ็อกเก็ต', type: 'select', options: CPU_SOCKETS, compat: true },
    { key: 'chipset', label: 'ชิปเซ็ต', type: 'text', placeholder: 'เช่น B650, B760' },
    {
      key: 'formFactor',
      label: 'ขนาดบอร์ด',
      type: 'select',
      options: BOARD_FORM_FACTORS,
      compat: true,
    },
    { key: 'ramType', label: 'ชนิดแรม', type: 'select', options: RAM_TYPES, compat: true },
    { key: 'ramSlots', label: 'จำนวนช่องแรม', type: 'number', max: 16 },
    { key: 'maxRamGb', label: 'แรมสูงสุด', type: 'number', unit: 'GB', max: 4096 },
    { key: 'm2Slots', label: 'จำนวนช่อง M.2', type: 'number', max: 16 },
    { key: 'wifi', label: 'มี Wi-Fi ในตัว', type: 'boolean' },
  ],
  ram: [
    { key: 'ramType', label: 'ชนิดแรม', type: 'select', options: RAM_TYPES, compat: true },
    { key: 'capacityGb', label: 'ความจุรวม', type: 'number', unit: 'GB', max: 1024 },
    { key: 'modules', label: 'จำนวนแถว', type: 'number', max: 16 },
    { key: 'speedMhz', label: 'ความเร็ว', type: 'number', unit: 'MHz', max: 20000 },
    { key: 'rgb', label: 'มีไฟ RGB', type: 'boolean' },
  ],
  gpu: [
    { key: 'chipset', label: 'ชิปการ์ดจอ', type: 'text', placeholder: 'เช่น RTX 4060, RX 7600' },
    { key: 'vramGb', label: 'หน่วยความจำ', type: 'number', unit: 'GB', max: 128 },
    {
      key: 'gpuPowerWatt',
      label: 'กินไฟ (TBP)',
      type: 'number',
      unit: 'W',
      max: 2000,
      compat: true,
    },
    { key: 'lengthMm', label: 'ความยาวการ์ด', type: 'number', unit: 'mm', max: 500, compat: true },
    { key: 'recommendedPsuWatt', label: 'PSU แนะนำ', type: 'number', unit: 'W', max: 3000 },
    { key: 'powerConnectors', label: 'หัวไฟเลี้ยง', type: 'text', placeholder: 'เช่น 1x 8-pin' },
  ],
  storage: [
    {
      key: 'storageType',
      label: 'ชนิด',
      type: 'select',
      options: opts('NVMe SSD', 'SATA SSD', 'HDD'),
    },
    { key: 'formFactor', label: 'ขนาด', type: 'select', options: opts('M.2 2280', '2.5"', '3.5"') },
    { key: 'capacityGb', label: 'ความจุ', type: 'number', unit: 'GB', max: 100000 },
    { key: 'readMbps', label: 'อ่านสูงสุด', type: 'number', unit: 'MB/s', max: 20000 },
    { key: 'writeMbps', label: 'เขียนสูงสุด', type: 'number', unit: 'MB/s', max: 20000 },
  ],
  psu: [
    { key: 'psuWatt', label: 'กำลังไฟ', type: 'number', unit: 'W', max: 3000, compat: true },
    {
      key: 'efficiency',
      label: 'มาตรฐาน 80 Plus',
      type: 'select',
      options: opts(
        'ไม่มี',
        '80+ White',
        '80+ Bronze',
        '80+ Silver',
        '80+ Gold',
        '80+ Platinum',
        '80+ Titanium',
      ),
    },
    {
      key: 'modular',
      label: 'สายถอดได้',
      type: 'select',
      options: opts('ถอดได้ทั้งหมด', 'ถอดได้บางส่วน', 'ถอดไม่ได้'),
    },
    { key: 'formFactor', label: 'ขนาด', type: 'select', options: PSU_FORM_FACTORS, compat: true },
  ],
  case: [
    {
      key: 'supportedFormFactors',
      label: 'บอร์ดที่ใส่ได้',
      type: 'multiselect',
      options: BOARD_FORM_FACTORS,
      compat: true,
    },
    {
      key: 'maxGpuLengthMm',
      label: 'การ์ดจอยาวสุด',
      type: 'number',
      unit: 'mm',
      max: 600,
      compat: true,
    },
    {
      key: 'maxCoolerHeightMm',
      label: 'ซิงก์สูงสุด',
      type: 'number',
      unit: 'mm',
      max: 300,
      compat: true,
    },
    {
      key: 'psuFormFactor',
      label: 'ขนาด PSU',
      type: 'select',
      options: PSU_FORM_FACTORS,
      compat: true,
    },
    { key: 'includedFans', label: 'พัดลมที่ให้มา', type: 'number', max: 20 },
  ],
  cooler: [
    { key: 'coolerType', label: 'ชนิด', type: 'select', options: opts('ลม (Air)', 'น้ำปิด (AIO)') },
    {
      key: 'supportedSockets',
      label: 'ซ็อกเก็ตที่รองรับ',
      type: 'multiselect',
      options: CPU_SOCKETS,
      compat: true,
    },
    { key: 'heightMm', label: 'ความสูงซิงก์', type: 'number', unit: 'mm', max: 300, compat: true },
    {
      key: 'radiatorMm',
      label: 'ขนาดหม้อน้ำ',
      type: 'select',
      options: opts('120', '240', '280', '360', '420'),
    },
    { key: 'tdpRatingWatt', label: 'รองรับ TDP', type: 'number', unit: 'W', max: 1000 },
  ],
  monitor: [
    { key: 'sizeInch', label: 'ขนาดจอ', type: 'number', unit: 'นิ้ว', step: 0.1, max: 100 },
    {
      key: 'resolution',
      label: 'ความละเอียด',
      type: 'select',
      options: opts('1920x1080', '2560x1440', '3440x1440', '3840x2160'),
    },
    { key: 'refreshHz', label: 'รีเฟรชเรต', type: 'number', unit: 'Hz', max: 1000 },
    { key: 'panel', label: 'ชนิดพาเนล', type: 'select', options: opts('IPS', 'VA', 'TN', 'OLED') },
    { key: 'responseMs', label: 'Response time', type: 'number', unit: 'ms', step: 0.1, max: 100 },
  ],
  accessory: [],
  service: [],
  other: [],
};

export function specFieldsFor(kind: CategoryKind): SpecField[] {
  return SPEC_DEFINITIONS[kind];
}
