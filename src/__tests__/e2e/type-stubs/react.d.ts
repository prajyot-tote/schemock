/**
 * Type stubs for React
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual React package.
 */

declare module 'react' {
  export type ReactNode =
    | string
    | number
    | boolean
    | null
    | undefined
    | ReactElement
    | ReactNode[]
    | ReactPortal;

  export interface ReactPortal {
    key: string | null;
    children: ReactNode;
  }

  export interface ReactElement<
    P = unknown,
    T extends string | JSXElementConstructor<unknown> = string | JSXElementConstructor<unknown>
  > {
    type: T;
    props: P;
    key: string | null;
  }

  export type JSXElementConstructor<P> =
    | ((props: P) => ReactElement | null)
    | (new (props: P) => Component<P>);

  export interface FunctionComponent<P = {}> {
    (props: P, context?: unknown): ReactElement<unknown, unknown> | null;
    propTypes?: unknown;
    contextTypes?: unknown;
    defaultProps?: Partial<P>;
    displayName?: string;
  }

  export type FC<P = {}> = FunctionComponent<P>;

  export interface PropsWithChildren<P = unknown> {
    children?: ReactNode;
  }

  export abstract class Component<P = {}, S = {}> {
    constructor(props: P);
    props: Readonly<P>;
    state: Readonly<S>;
    setState(
      state: Partial<S> | ((prevState: S, props: P) => Partial<S>),
      callback?: () => void
    ): void;
    render(): ReactNode;
  }

  export interface ProviderProps<T> {
    value: T;
    children?: ReactNode;
  }

  export interface ConsumerProps<T> {
    children: (value: T) => ReactNode;
  }

  // Provider component that returns JSX.Element for proper JSX usage
  export interface ExoticComponent<P = {}> {
    (props: P): ReactElement | null;
    readonly $$typeof: symbol;
  }

  export interface ProviderExoticComponent<P> {
    (props: P): ReactElement | null;
    readonly $$typeof: symbol;
    propTypes?: unknown;
  }

  export type ComponentType<P = {}> = FunctionComponent<P> | ComponentClass<P>;

  // Provider type that works as a JSX component
  // Use any return type to satisfy JSX requirements
  export interface ProviderComponent<T> {
    (props: ProviderProps<T>): any;
  }

  export interface Context<T> {
    Provider: ProviderComponent<T>;
    Consumer: FunctionComponent<ConsumerProps<T>>;
    displayName?: string;
  }

  export interface ComponentClass<P = {}> {
    new (props: P): Component<P>;
    displayName?: string;
  }

  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useState<T>(
    initialState: T | (() => T)
  ): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[]
  ): void;
  export function useCallback<T extends (...args: unknown[]) => unknown>(
    callback: T,
    deps: readonly unknown[]
  ): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initialValue: T): { current: T };
  export function useReducer<S, A>(
    reducer: (state: S, action: A) => S,
    initialState: S
  ): [S, (action: A) => void];
  export function useImperativeHandle<T>(
    ref: { current: T | null } | ((instance: T | null) => void) | null,
    createHandle: () => T,
    deps?: readonly unknown[]
  ): void;
  export function useLayoutEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[]
  ): void;
  export function useDebugValue<T>(value: T, format?: (value: T) => unknown): void;
  export function forwardRef<T, P = {}>(
    render: (props: P, ref: { current: T | null }) => ReactElement | null
  ): ForwardRefExoticComponent<P & { ref?: { current: T | null } }>;

  export interface ForwardRefExoticComponent<P> {
    (props: P): ReactElement | null;
    displayName?: string;
  }

  export function memo<P>(
    component: FunctionComponent<P>,
    propsAreEqual?: (prevProps: P, nextProps: P) => boolean
  ): FunctionComponent<P>;

  export function lazy<T extends ComponentType<unknown>>(
    factory: () => Promise<{ default: T }>
  ): T;

  export interface SuspenseProps {
    children?: ReactNode;
    fallback?: ReactNode;
  }

  export function Suspense(props: SuspenseProps): ReactElement;

  // JSX namespace - exported as both namespace and type
  export namespace JSX {
    export interface Element extends ReactElement<unknown, string | JSXElementConstructor<unknown>> {}
    export interface ElementClass extends Component<unknown> {
      render(): ReactNode;
    }
    export interface IntrinsicElements {
      [elemName: string]: unknown;
    }
    export interface ElementAttributesProperty {
      props: {};
    }
    export interface ElementChildrenAttribute {
      children: {};
    }
  }

  // Also export JSX as a type for `import type { JSX }`
  export type { JSX };
}
