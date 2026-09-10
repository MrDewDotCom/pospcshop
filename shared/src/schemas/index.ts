export * from './auth';
export * from './shop';
export * from './setup';

/** Shape of every API error response. */
export interface ApiErrorBody {
  error: {
    code: string;
    /** Thai, safe to show to the user. */
    message: string;
    details?: unknown;
  };
}
