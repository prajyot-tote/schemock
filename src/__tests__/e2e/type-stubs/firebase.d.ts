/**
 * Type stubs for Firebase
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual Firebase packages.
 */

declare module 'firebase/app' {
  export interface FirebaseApp {
    name: string;
    options: FirebaseOptions;
  }

  export interface FirebaseOptions {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  }

  export function initializeApp(options: FirebaseOptions, name?: string): FirebaseApp;
  export function getApp(name?: string): FirebaseApp;
  export function getApps(): FirebaseApp[];
}

declare module 'firebase/firestore' {
  export interface Firestore {}

  export interface DocumentReference<T = Record<string, unknown>> {
    id: string;
    path: string;
  }

  export interface DocumentSnapshot<T = Record<string, unknown>> {
    id: string;
    exists(): boolean;
    data(): T | undefined;
    ref: DocumentReference<T>;
  }

  export interface QueryDocumentSnapshot<T = Record<string, unknown>> extends DocumentSnapshot<T> {
    data(): T;
  }

  export interface QuerySnapshot<T = Record<string, unknown>> {
    docs: QueryDocumentSnapshot<T>[];
    empty: boolean;
    size: number;
  }

  export interface CollectionReference<T = Record<string, unknown>> {}
  export interface Query<T = Record<string, unknown>> {}
  export interface QueryConstraint {}

  export function getFirestore(app?: unknown): Firestore;
  export function collection(firestore: Firestore, path: string, ...pathSegments: string[]): CollectionReference;
  export function doc(firestore: Firestore, path: string, ...pathSegments: string[]): DocumentReference;
  export function doc(reference: CollectionReference, path?: string, ...pathSegments: string[]): DocumentReference;
  export function getDoc<T>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  export function getDocs<T>(query: Query<T> | CollectionReference<T>): Promise<QuerySnapshot<T>>;
  export function addDoc<T extends Record<string, unknown>>(reference: CollectionReference<T>, data: T): Promise<DocumentReference<T>>;
  export function setDoc<T extends Record<string, unknown>>(reference: DocumentReference<T>, data: T, options?: { merge?: boolean }): Promise<void>;
  export function updateDoc(reference: DocumentReference, data: Record<string, unknown>): Promise<void>;
  export function deleteDoc(reference: DocumentReference): Promise<void>;
  export function query<T>(query: Query<T> | CollectionReference<T>, ...queryConstraints: QueryConstraint[]): Query<T>;
  export function where(fieldPath: string, opStr: string, value: unknown): QueryConstraint;
  export function orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): QueryConstraint;
  export function limit(limit: number): QueryConstraint;
  export function startAfter(...fieldValues: unknown[]): QueryConstraint;
}

declare module 'firebase/auth' {
  export interface Auth {}
  export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
  }
  export interface UserCredential {
    user: User;
  }

  export function getAuth(app?: unknown): Auth;
  export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
  export function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
  export function signOut(auth: Auth): Promise<void>;
  export function onAuthStateChanged(auth: Auth, callback: (user: User | null) => void): () => void;
}

declare module 'firebase-admin/app' {
  export interface App {}
  export interface ServiceAccount {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
  }
  export interface Credential {}

  export function initializeApp(options?: { credential?: Credential }): App;
  export function getApps(): App[];
  export function cert(serviceAccount: ServiceAccount): Credential;
}

declare module 'firebase-admin/firestore' {
  export interface Firestore {
    collection(path: string): CollectionReference;
  }

  export interface CollectionReference {
    doc(id?: string): DocumentReference;
    add(data: unknown): Promise<DocumentReference>;
    get(): Promise<QuerySnapshot>;
    limit(limit: number): CollectionReference;
    offset(offset: number): CollectionReference;
    where(field: string, op: string, value: unknown): CollectionReference;
    orderBy(field: string, direction?: 'asc' | 'desc'): CollectionReference;
  }

  export interface DocumentReference {
    id: string;
    get(): Promise<DocumentSnapshot>;
    set(data: unknown): Promise<void>;
    update(data: unknown): Promise<void>;
    delete(): Promise<void>;
  }

  export interface DocumentSnapshot {
    id: string;
    exists: boolean;
    data(): unknown;
  }

  export interface QuerySnapshot {
    docs: DocumentSnapshot[];
    empty: boolean;
    size: number;
  }

  export function getFirestore(): Firestore;
}
