const tails = new Map<string, Promise<void>>();

/** Serialize asynchronous work for one key inside this single Node process. */
export async function withKeyedMutex<T>(key: string, operation: () => Promise<T>): Promise<T> {
   const previous = tails.get(key) || Promise.resolve();
   let release!: () => void;
   const current = new Promise<void>((resolve) => { release = resolve; });
   tails.set(key, current);
   await previous;
   try {
      return await operation();
   } finally {
      release();
      if (tails.get(key) === current) tails.delete(key);
   }
}
