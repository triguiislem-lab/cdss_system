declare module 'pg' {
  export class Client {
    constructor(config: Record<string, unknown>);
    connect(): Promise<void>;
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
