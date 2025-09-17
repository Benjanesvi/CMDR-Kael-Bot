// src/storage.ts
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del?(key: string): Promise<void>;
}
