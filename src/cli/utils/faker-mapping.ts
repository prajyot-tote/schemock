/**
 * Faker mapping utility - maps schema fields to Faker.js calls
 *
 * @module cli/utils/faker-mapping
 * @category CLI
 */

import type { FieldDefinition } from '../../schema/types';
import type { SchemockConfig, FakerMapping } from '../types';

/**
 * Escape a string value for safe use in JavaScript string literals.
 * Escapes single quotes, backslashes, and newlines.
 *
 * @param value - The string value to escape
 * @returns Escaped string safe for JS single-quoted strings
 */
function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "\\'")    // Escape single quotes
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '\\r')   // Escape carriage returns
    .replace(/\t/g, '\\t');  // Escape tabs
}

/**
 * Default faker mappings
 */
const defaultMappings: FakerMapping[] = [
  // By hint - Person
  { hint: 'person.fullName', call: 'faker.person.fullName()' },
  { hint: 'person.firstName', call: 'faker.person.firstName()' },
  { hint: 'person.lastName', call: 'faker.person.lastName()' },
  { hint: 'person.bio', call: 'faker.lorem.paragraph()' },
  { hint: 'person.jobTitle', call: 'faker.person.jobTitle()' },

  // By hint - Internet
  { hint: 'internet.email', call: 'faker.internet.email()' },
  { hint: 'internet.url', call: 'faker.internet.url()' },
  { hint: 'internet.avatar', call: 'faker.image.avatar()' },
  { hint: 'internet.username', call: 'faker.internet.username()' },
  { hint: 'internet.password', call: 'faker.internet.password()' },

  // By hint - Lorem
  { hint: 'lorem.word', call: 'faker.lorem.word()' },
  { hint: 'lorem.sentence', call: 'faker.lorem.sentence()' },
  { hint: 'lorem.paragraph', call: 'faker.lorem.paragraph()' },
  { hint: 'lorem.paragraphs', call: 'faker.lorem.paragraphs(3)' },
  { hint: 'lorem.text', call: 'faker.lorem.text()' },

  // By hint - Image
  { hint: 'image.avatar', call: 'faker.image.avatar()' },
  { hint: 'image.url', call: 'faker.image.url()' },

  // By hint - Location
  { hint: 'location.city', call: 'faker.location.city()' },
  { hint: 'location.country', call: 'faker.location.country()' },
  { hint: 'location.streetAddress', call: 'faker.location.streetAddress()' },
  { hint: 'location.zipCode', call: 'faker.location.zipCode()' },
  { hint: 'location.latitude', call: 'faker.location.latitude()' },
  { hint: 'location.longitude', call: 'faker.location.longitude()' },

  // By hint - Commerce
  { hint: 'commerce.price', call: 'parseFloat(faker.commerce.price())' },
  { hint: 'commerce.productName', call: 'faker.commerce.productName()' },
  { hint: 'commerce.department', call: 'faker.commerce.department()' },

  // By hint - Company
  { hint: 'company.name', call: 'faker.company.name()' },
  { hint: 'company.catchPhrase', call: 'faker.company.catchPhrase()' },

  // By hint - Color
  { hint: 'color.rgb', call: 'faker.color.rgb()' },
  { hint: 'color.human', call: 'faker.color.human()' },

  // By hint - Date
  { hint: 'date.past', call: 'faker.date.past()' },
  { hint: 'date.future', call: 'faker.date.future()' },
  { hint: 'date.recent', call: 'faker.date.recent()' },
  { hint: 'date.birthdate', call: 'faker.date.birthdate()' },

  // By field name patterns
  { fieldName: /^email$/i, call: 'faker.internet.email()' },
  { fieldName: /^name$/i, call: 'faker.person.fullName()' },
  { fieldName: /firstName/i, call: 'faker.person.firstName()' },
  { fieldName: /lastName/i, call: 'faker.person.lastName()' },
  { fieldName: /phone/i, call: 'faker.phone.number()' },
  { fieldName: /avatar/i, call: 'faker.image.avatar()' },
  { fieldName: /image|photo|picture/i, call: 'faker.image.url()' },
  { fieldName: /url|link|website/i, call: 'faker.internet.url()' },
  { fieldName: /address/i, call: 'faker.location.streetAddress()' },
  { fieldName: /city/i, call: 'faker.location.city()' },
  { fieldName: /country/i, call: 'faker.location.country()' },
  { fieldName: /zip|postal/i, call: 'faker.location.zipCode()' },
  { fieldName: /price|cost|amount/i, call: 'parseFloat(faker.commerce.price())' },
  { fieldName: /title/i, call: 'faker.lorem.sentence({ min: 3, max: 8 })' },
  { fieldName: /description|content|body|text/i, call: 'faker.lorem.paragraphs(2)' },
  { fieldName: /bio|about/i, call: 'faker.lorem.paragraph()' },
  { fieldName: /color/i, call: 'faker.color.rgb()' },
  { fieldName: /slug/i, call: 'faker.helpers.slugify(faker.lorem.words(3))' },
  { fieldName: /token|key|secret/i, call: 'faker.string.alphanumeric(32)' },

  // By type (fallback)
  { type: 'uuid', call: 'faker.string.uuid()' },
  { type: 'email', call: 'faker.internet.email()' },
  { type: 'url', call: 'faker.internet.url()' },
  { type: 'string', call: 'faker.lorem.word()' },
  { type: 'text', call: 'faker.lorem.paragraphs(2)' },
  { type: 'number', call: 'faker.number.int({ min: 1, max: 1000 })' },
  { type: 'int', call: 'faker.number.int({ min: 1, max: 1000 })' },
  { type: 'float', call: 'faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })' },
  { type: 'boolean', call: 'faker.datatype.boolean()' },
  { type: 'date', call: 'faker.date.recent()' },
  { type: 'json', call: '{}' },
  { type: 'ref', call: 'faker.string.uuid()' },
];

/**
 * Convert a field definition to a Faker.js call string
 *
 * @example
 * ```typescript
 * fieldToFakerCall('email', { type: 'email' }, config)
 * // 'faker.internet.email()'
 *
 * fieldToFakerCall('status', { type: 'enum', values: ['active', 'inactive'] }, config)
 * // "faker.helpers.arrayElement(['active', 'inactive'])"
 * ```
 */
export function fieldToFakerCall(
  fieldName: string,
  field: FieldDefinition,
  config: SchemockConfig
): string {
  // Merge custom mappings with defaults (custom takes priority)
  const mappings = [...(config.fakerMappings || []), ...defaultMappings];

  // Handle special types first

  // Enum
  if (field.type === 'enum' || (field.values && field.values.length > 0)) {
    const values = (field.values as string[]).map((v) => `'${escapeJsString(v)}'`).join(', ');
    return `faker.helpers.arrayElement([${values}])`;
  }

  // Array
  if (field.type === 'array') {
    const itemCall = field.items ? fieldToFakerCall('item', field.items, config) : 'faker.lorem.word()';
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 5;
    return `Array.from({ length: faker.number.int({ min: ${min}, max: ${max} }) }, () => ${itemCall})`;
  }

  // Object
  if (field.type === 'object' && field.shape) {
    const props = Object.entries(field.shape)
      .map(([k, v]) => `${k}: ${fieldToFakerCall(k, v, config)}`)
      .join(', ');
    return `({ ${props} })`;
  }

  // Try hint first (highest priority)
  if (field.hint) {
    const match = mappings.find((m) => m.hint === field.hint);
    if (match) return match.call;
  }

  // Try field name pattern
  for (const mapping of mappings) {
    if (mapping.fieldName && mapping.fieldName.test(fieldName)) {
      return mapping.call;
    }
  }

  // Try type with constraints
  if (field.type === 'number' || field.type === 'int') {
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 1000;
    return `faker.number.int({ min: ${min}, max: ${max} })`;
  }
  if (field.type === 'float') {
    const min = field.constraints?.min ?? 0;
    const max = field.constraints?.max ?? 1000;
    return `faker.number.float({ min: ${min}, max: ${max}, fractionDigits: 2 })`;
  }
  if (field.type === 'string' && (field.constraints?.min || field.constraints?.max)) {
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 100;
    return `faker.string.alphanumeric({ length: { min: ${min}, max: ${max} } })`;
  }

  // Try type fallback
  const typeMatch = mappings.find((m) => m.type === field.type);
  if (typeMatch) return typeMatch.call;

  // Ultimate fallback
  return 'faker.lorem.word()';
}
