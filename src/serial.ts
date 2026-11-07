// Each caller gets its own lock; rejection never poisons later operations.
export function createSerialExecutor() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
}
