// Code shared by the server and the web client: schemas, business math, permissions, constants.
// Consumed as TypeScript source (no build step).

export * from './money';
export * from './pricing';
export * from './datetime';
export * from './enums';
export * from './permissions';
export * from './schemas';
export * from './audit';

export const APP_NAME = 'PC Shop Manager';
export const APP_VERSION = '0.1.0';

/** Standard Thai rendering test string (stacked vowels and tone marks). Use it in every export path. */
export const THAI_RENDER_TEST = 'ผู้ใหญ่ น้ำแข็ง ที่นี่ ฟรี!';
