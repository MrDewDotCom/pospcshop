// Sample ("demo") data created by the first-run wizard (PLAN.md Q10). The shop can clear it again as
// long as it hasn't been used: see POST /api/seed/clear.

export interface SampleDataCounts {
  products: number;
  suppliers: number;
  tags: number;
  goodsReceipts: number;
}

export interface SampleDataStatus extends SampleDataCounts {
  hasSampleData: boolean;
  /** False when there is nothing to clear, or when the sample data has been used (see blockedReason). */
  canClear: boolean;
  /** Thai explanation of why clearing is not possible; null when it is. */
  blockedReason: string | null;
}

export interface ClearSampleDataResult {
  /** How many rows were removed. */
  cleared: SampleDataCounts;
  /**
   * Sample tags and suppliers that the shop had also used for its own data: they are kept and are no
   * longer treated as sample data.
   */
  kept: { tags: number; suppliers: number };
  status: SampleDataStatus;
}
