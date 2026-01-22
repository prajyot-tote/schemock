/**
 * Type stubs for msw v2 (Mock Service Worker)
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual msw package.
 */

declare module 'msw' {
  export interface DefaultBodyType {}

  // MSW v2 uses native Request/Response
  export type StrictRequest<T = DefaultBodyType> = Request & {
    json(): Promise<T>;
  };

  // Handler info passed to resolvers
  export interface HttpRequestResolverExtras<TParams = Record<string, string>> {
    request: Request;
    params: TParams;
    cookies: Record<string, string>;
  }

  // Response resolver function signature for MSW v2
  export type HttpResponseResolver<
    TParams = Record<string, string | readonly string[]>,
    TRequestBody = DefaultBodyType,
    TResponseBody = DefaultBodyType
  > = (info: HttpRequestResolverExtras<TParams>) =>
    Response | Promise<Response> | void | Promise<void>;

  // Request handler returned by http.get(), etc.
  export interface RequestHandler {
    info: {
      method: string;
      path: string;
    };
    test(req: Request): boolean;
  }

  // The http namespace for MSW v2
  export const http: {
    get<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    post<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    put<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    patch<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    delete<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    options<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    head<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
    all<TParams = Record<string, string>>(
      path: string | RegExp,
      resolver: HttpResponseResolver<TParams>
    ): RequestHandler;
  };

  // HttpResponse class for MSW v2
  export class HttpResponse extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit);
    static json<T>(body: T, init?: ResponseInit): HttpResponse;
    static text(body: string, init?: ResponseInit): HttpResponse;
    static xml(body: string, init?: ResponseInit): HttpResponse;
    static html(body: string, init?: ResponseInit): HttpResponse;
    static arrayBuffer(body: ArrayBuffer, init?: ResponseInit): HttpResponse;
    static formData(body: FormData, init?: ResponseInit): HttpResponse;
  }

  export interface SetupServerApi {
    listen(options?: { onUnhandledRequest?: 'bypass' | 'error' | 'warn' }): void;
    close(): void;
    resetHandlers(...handlers: RequestHandler[]): void;
    use(...handlers: RequestHandler[]): void;
  }

  export interface SetupWorkerApi {
    start(options?: { onUnhandledRequest?: 'bypass' | 'error' | 'warn' }): Promise<void>;
    stop(): void;
    resetHandlers(...handlers: RequestHandler[]): void;
    use(...handlers: RequestHandler[]): void;
  }
}

declare module 'msw/node' {
  import type { RequestHandler, SetupServerApi } from 'msw';
  export function setupServer(...handlers: RequestHandler[]): SetupServerApi;
}

declare module 'msw/browser' {
  import type { RequestHandler, SetupWorkerApi } from 'msw';
  export function setupWorker(...handlers: RequestHandler[]): SetupWorkerApi;
}
