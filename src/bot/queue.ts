const MAX_CONCURRENT = 3;
const USER_COOLDOWN = 3000;
const QUEUE_TIMEOUT = 15000;

let activeCount = 0;

interface QueueEntry<T = unknown> {
  task: () => Promise<T | null>;
  resolve: (value: T | null) => void;
  reject: (reason: unknown) => void;
  addedAt: number;
}

const queue: QueueEntry[] = [];
const userLastReply = new Map<string, number>();

export function canUserRequest(userId: string): boolean {
  const last = userLastReply.get(userId);
  if (!last) return true;
  return Date.now() - last >= USER_COOLDOWN;
}

export function markUserRequest(userId: string): void {
  userLastReply.set(userId, Date.now());
}

export function enqueue<T = string>(task: () => Promise<T | null>): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    queue.push({ task, resolve: resolve as (value: unknown | null) => void, reject, addedAt: Date.now() });
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (activeCount >= MAX_CONCURRENT || queue.length === 0) return;

  const entry = queue.shift()!;

  if (Date.now() - entry.addedAt > QUEUE_TIMEOUT) {
    entry.resolve(null);
    processQueue();
    return;
  }

  activeCount++;

  try {
    const result = await entry.task();
    entry.resolve(result);
  } catch (err) {
    entry.reject(err);
  } finally {
    activeCount--;
    processQueue();
  }
}

export function getQueueStats() {
  return {
    activeCount,
    queueLength: queue.length,
    maxConcurrent: MAX_CONCURRENT,
  };
}
