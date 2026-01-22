/**
 * Type stubs for express
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual express package in the temp directory.
 */

declare module 'express' {
  export interface Request {
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    path: string;
    method: string;
    originalUrl: string;
    ip?: string;
    user?: unknown;
    context?: unknown;
  }

  export interface Response {
    status(code: number): Response;
    json(data: unknown): Response;
    send(data?: unknown): Response;
    setHeader(name: string, value: string | number): Response;
    on(event: string, callback: () => void): void;
    statusCode: number;
  }

  export type NextFunction = (error?: unknown) => void;

  export type RequestHandler =
    | ((req: Request, res: Response, next: NextFunction) => void | Promise<void>)
    | ((err: Error, req: Request, res: Response, next: NextFunction) => void);

  export interface ErrorRequestHandler {
    (err: Error, req: Request, res: Response, next: NextFunction): void;
  }

  export interface Router {
    use(...handlers: (RequestHandler | ErrorRequestHandler)[]): Router;
    get(path: string, ...handlers: RequestHandler[]): Router;
    post(path: string, ...handlers: RequestHandler[]): Router;
    put(path: string, ...handlers: RequestHandler[]): Router;
    patch(path: string, ...handlers: RequestHandler[]): Router;
    delete(path: string, ...handlers: RequestHandler[]): Router;
  }

  export function Router(): Router;
  export function json(options?: { limit?: string | number; strict?: boolean }): RequestHandler;
  export function urlencoded(options?: { extended?: boolean; limit?: string | number }): RequestHandler;
  export function raw(options?: { type?: string | string[]; limit?: string | number }): RequestHandler;
  export function text(options?: { type?: string | string[]; limit?: string | number }): RequestHandler;
}
