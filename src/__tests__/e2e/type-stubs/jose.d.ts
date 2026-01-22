/**
 * Type stubs for jose (JSON Object Signing and Encryption)
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual jose package.
 */

declare module 'jose' {
  export interface JWTPayload {
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
    [key: string]: unknown;
  }

  export interface JWTVerifyResult {
    payload: JWTPayload;
    protectedHeader: {
      alg: string;
      typ?: string;
      [key: string]: unknown;
    };
  }

  export interface JWTHeaderParameters {
    alg?: string;
    typ?: string;
    [key: string]: unknown;
  }

  export interface SignJWT {
    setProtectedHeader(header: JWTHeaderParameters): this;
    setIssuedAt(iat?: number): this;
    setExpirationTime(exp: number | string): this;
    setNotBefore(nbf: number | string): this;
    setSubject(sub: string): this;
    setIssuer(iss: string): this;
    setAudience(aud: string | string[]): this;
    setJti(jti: string): this;
    sign(key: KeyLike | Uint8Array): Promise<string>;
  }

  export interface KeyLike {
    type: string;
  }

  export function jwtVerify(
    jwt: string | Uint8Array,
    key: KeyLike | Uint8Array,
    options?: {
      algorithms?: string[];
      audience?: string | string[];
      clockTolerance?: number | string;
      issuer?: string | string[];
      maxTokenAge?: number | string;
      subject?: string;
      typ?: string;
    }
  ): Promise<JWTVerifyResult>;

  export function importSPKI(spki: string, alg: string, options?: { extractable?: boolean }): Promise<KeyLike>;
  export function importPKCS8(pkcs8: string, alg: string, options?: { extractable?: boolean }): Promise<KeyLike>;
  export function importJWK(jwk: Record<string, unknown>, alg?: string, options?: { extractable?: boolean }): Promise<KeyLike>;

  export function decodeJwt(jwt: string): JWTPayload;
  export function decodeProtectedHeader(jwt: string): JWTHeaderParameters;

  export class SignJWT implements SignJWT {
    constructor(payload: JWTPayload);
  }
}
