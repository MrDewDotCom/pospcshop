import path from 'node:path';
import { startServer } from './app';

// Replaced with true by the production build (scripts/build.mjs).
declare const __PRODUCTION__: boolean | undefined;
const isProduction = typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__;

const port = Number(process.env.PORT ?? 3300);

// The bundle lives in server/dist/, so the built web app is at ../../web/dist.
const webDistDir = isProduction ? path.resolve(import.meta.dirname, '../../web/dist') : null;

try {
  await startServer({ port, webDistDir, logger: true });
} catch (error) {
  console.error(error);
  process.exit(1);
}
