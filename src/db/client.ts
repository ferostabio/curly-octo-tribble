// Development-only local confirmation adapter; cleared on reload.
const confirmations = new Map<string, number>();
export const db = {
  async confirm(worker: string, id: string, timestamp: number) {
    if (!__DEV__) throw new Error('Mock database is development-only');
    confirmations.set(JSON.stringify([worker, id]), timestamp);
  },
};
