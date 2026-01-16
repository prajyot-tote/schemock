/**
 * Type stubs for @faker-js/faker
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual @faker-js/faker package in the temp directory.
 */

declare module '@faker-js/faker' {
  interface StringModule {
    uuid(): string;
    alphanumeric(length?: number | { length?: number | { min?: number; max?: number } }): string;
  }

  interface InternetModule {
    email(): string;
    url(): string;
    username(): string;
    password(): string;
    avatar(): string;
  }

  interface PersonModule {
    fullName(): string;
    firstName(): string;
    lastName(): string;
    jobTitle(): string;
  }

  interface LoremModule {
    word(): string;
    words(count?: number): string;
    sentence(options?: { min?: number; max?: number }): string;
    paragraph(): string;
    paragraphs(count?: number): string;
    text(): string;
  }

  interface DateModule {
    past(options?: { years?: number; refDate?: Date }): Date;
    future(options?: { years?: number; refDate?: Date }): Date;
    recent(options?: { days?: number; refDate?: Date }): Date;
    birthdate(options?: { min?: number; max?: number; mode?: 'age' | 'year'; refDate?: Date }): Date;
  }

  interface NumberModule {
    int(options?: { min?: number; max?: number }): number;
    float(options?: { min?: number; max?: number; fractionDigits?: number }): number;
  }

  interface DatatypeModule {
    boolean(): boolean;
  }

  interface ImageModule {
    url(): string;
    avatar(): string;
  }

  interface LocationModule {
    city(): string;
    country(): string;
    streetAddress(): string;
    zipCode(): string;
    latitude(): number;
    longitude(): number;
  }

  interface CommerceModule {
    price(): string;
    productName(): string;
    department(): string;
  }

  interface CompanyModule {
    name(): string;
    catchPhrase(): string;
  }

  interface ColorModule {
    rgb(): string;
    human(): string;
  }

  interface PhoneModule {
    number(): string;
  }

  interface HelpersModule {
    arrayElement<T>(array: T[]): T;
    slugify(text: string): string;
  }

  interface Faker {
    string: StringModule;
    internet: InternetModule;
    person: PersonModule;
    lorem: LoremModule;
    date: DateModule;
    number: NumberModule;
    datatype: DatatypeModule;
    image: ImageModule;
    location: LocationModule;
    commerce: CommerceModule;
    company: CompanyModule;
    color: ColorModule;
    phone: PhoneModule;
    helpers: HelpersModule;
    seed(seed?: number): void;
  }

  export const faker: Faker;
}
