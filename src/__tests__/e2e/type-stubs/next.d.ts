/**
 * Type stubs for Next.js
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual Next.js package.
 */

declare module 'next/server' {
  export class NextRequest {
    url: string;
    method: string;
    headers: Headers;
    nextUrl: {
      pathname: string;
      searchParams: URLSearchParams;
    };
    json(): Promise<unknown>;
    text(): Promise<string>;
    clone(): NextRequest;
  }

  export class NextResponse {
    static json(body: unknown, init?: ResponseInit): NextResponse;
    static next(init?: { headers?: HeadersInit }): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static rewrite(destination: string | URL): NextResponse;

    headers: Headers;
    status: number;
    statusText: string;

    json(): Promise<unknown>;
    text(): Promise<string>;
  }

  export interface MiddlewareConfig {
    matcher?: string | string[];
  }
}

declare module 'next/headers' {
  export function headers(): Headers;
  export function cookies(): {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options?: unknown): void;
    delete(name: string): void;
  };
}
