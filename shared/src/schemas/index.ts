export * from './common';
export * from './auth';
export * from './shop';
export * from './setup';
export * from './users';
export * from './settings';
export * from './files';
export * from './categories';
export * from './tags';
export * from './products';
export * from './suppliers';
export * from './goodsReceipts';
export * from './stock';
export * from './backups';

/** Shape of every API error response. */
export interface ApiErrorBody {
  error: {
    code: string;
    /** Thai, safe to show to the user. */
    message: string;
    details?: unknown;
  };
}
