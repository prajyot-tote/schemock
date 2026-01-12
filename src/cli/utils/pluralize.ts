/**
 * Pluralization utility for entity names
 *
 * @module cli/utils/pluralize
 * @category CLI
 */

import type { PluralizeConfig } from '../types';

/**
 * Irregular plural forms (singular -> plural)
 */
const irregulars: Record<string, string> = {
  person: 'people',
  child: 'children',
  man: 'men',
  woman: 'women',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  goose: 'geese',
  ox: 'oxen',
  leaf: 'leaves',
  life: 'lives',
  knife: 'knives',
  wife: 'wives',
  self: 'selves',
  elf: 'elves',
  loaf: 'loaves',
  potato: 'potatoes',
  tomato: 'tomatoes',
  cactus: 'cacti',
  focus: 'foci',
  fungus: 'fungi',
  nucleus: 'nuclei',
  syllabus: 'syllabi',
  analysis: 'analyses',
  diagnosis: 'diagnoses',
  thesis: 'theses',
  crisis: 'crises',
  phenomenon: 'phenomena',
  criterion: 'criteria',
  datum: 'data',
};

/**
 * Reverse irregular forms (plural -> singular)
 */
const irregularsReverse: Record<string, string> = Object.fromEntries(
  Object.entries(irregulars).map(([k, v]) => [v, k])
);

/**
 * Words that don't change in plural form
 */
const uncountables = new Set([
  'sheep',
  'fish',
  'deer',
  'species',
  'series',
  'news',
  'money',
  'rice',
  'information',
  'equipment',
]);

/**
 * Check if character is a vowel
 */
function isVowel(char: string): boolean {
  return 'aeiou'.includes(char?.toLowerCase() ?? '');
}

/**
 * Convert a plural word to its singular form
 *
 * @example
 * ```typescript
 * singularize('users') // 'user'
 * singularize('categories') // 'category'
 * singularize('people') // 'person'
 * singularize('user') // 'user' (already singular)
 * ```
 */
export function singularize(word: string): string {
  const lower = word.toLowerCase();

  // Check reverse irregulars
  if (irregularsReverse[lower]) {
    return irregularsReverse[lower];
  }

  // Check uncountables
  if (uncountables.has(lower)) {
    return lower;
  }

  // Check if it's a known singular (in irregulars map)
  if (irregulars[lower]) {
    return lower; // Already singular
  }

  // Reverse plural rules (order matters - most specific first)

  // -ies -> -y (categories -> category)
  if (lower.endsWith('ies') && lower.length > 3) {
    const base = lower.slice(0, -3);
    // Verify the base + y wouldn't be a vowel+y (which doesn't pluralize to -ies)
    if (base.length > 0 && !isVowel(base[base.length - 1])) {
      return base + 'y';
    }
  }

  // -ves -> -f or -fe (leaves -> leaf, knives -> knife)
  if (lower.endsWith('ves') && lower.length > 3) {
    const base = lower.slice(0, -3);
    // Common -ves words that become -fe
    const feWords = ['kni', 'wi', 'li']; // knife, wife, life
    if (feWords.some((w) => base.endsWith(w))) {
      return base + 'fe';
    }
    return base + 'f';
  }

  // -oes -> -o (potatoes -> potato, but not "does" -> "do")
  if (lower.endsWith('oes') && lower.length > 3) {
    const base = lower.slice(0, -2);
    // Skip short words like "does", "goes", "toes"
    if (base.length > 2) {
      return base;
    }
  }

  // -ses, -xes, -zes, -ches, -shes -> remove -es
  if (
    (lower.endsWith('ses') ||
      lower.endsWith('xes') ||
      lower.endsWith('zes') ||
      lower.endsWith('ches') ||
      lower.endsWith('shes')) &&
    lower.length > 3
  ) {
    return lower.slice(0, -2);
  }

  // -s -> remove -s (users -> user)
  // But not -ss (class, boss, etc. - these are singular)
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 1) {
    return lower.slice(0, -1);
  }

  // Default: return as-is (assume already singular)
  return lower;
}

/**
 * Convert a word to its plural form
 *
 * This function is idempotent - calling it on an already-plural word
 * returns the same word (e.g., pluralize('users') === 'users').
 *
 * @example
 * ```typescript
 * pluralize('user') // 'users'
 * pluralize('users') // 'users' (idempotent)
 * pluralize('category') // 'categories'
 * pluralize('categories') // 'categories' (idempotent)
 * pluralize('person') // 'people'
 * pluralize('people') // 'people' (idempotent)
 * pluralize('staff', { custom: { staff: 'staff' } }) // 'staff'
 * ```
 */
export function pluralize(word: string, config?: PluralizeConfig): string {
  const lower = word.toLowerCase();

  // Check custom overrides first
  if (config?.custom?.[lower]) {
    return config.custom[lower];
  }

  // First, singularize the word to handle already-plural inputs
  // This makes pluralize() idempotent: pluralize('users') === 'users'
  const singular = singularize(lower);

  // Check irregulars (using the singularized form)
  if (irregulars[singular]) {
    return irregulars[singular];
  }

  // Check uncountables
  if (uncountables.has(singular)) {
    return singular;
  }

  // Apply plural rules to the singular form
  if (singular.endsWith('y') && !isVowel(singular[singular.length - 2])) {
    return singular.slice(0, -1) + 'ies';
  }
  if (
    singular.endsWith('s') ||
    singular.endsWith('x') ||
    singular.endsWith('z') ||
    singular.endsWith('ch') ||
    singular.endsWith('sh')
  ) {
    return singular + 'es';
  }
  if (singular.endsWith('f')) {
    return singular.slice(0, -1) + 'ves';
  }
  if (singular.endsWith('fe')) {
    return singular.slice(0, -2) + 'ves';
  }

  return singular + 's';
}

/**
 * Convert string to PascalCase
 *
 * @example
 * ```typescript
 * toPascalCase('user') // 'User'
 * toPascalCase('blog-post') // 'BlogPost'
 * toPascalCase('my_entity') // 'MyEntity'
 * ```
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase
 *
 * @example
 * ```typescript
 * toCamelCase('user') // 'user'
 * toCamelCase('blog-post') // 'blogPost'
 * toCamelCase('MyEntity') // 'myEntity'
 * ```
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert string to snake_case
 *
 * @example
 * ```typescript
 * toSnakeCase('userId') // 'user_id'
 * toSnakeCase('BlogPost') // 'blog_post'
 * toSnakeCase('myEntity') // 'my_entity'
 * ```
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[-\s]+/g, '_');
}

/**
 * Convert string to a safe JavaScript property name
 *
 * Handles hyphenated names, spaces, and other characters that
 * would make a string invalid as a JS identifier.
 *
 * @example
 * ```typescript
 * toSafePropertyName('user') // 'user'
 * toSafePropertyName('post-detail') // 'postDetail'
 * toSafePropertyName('user-profile') // 'userProfile'
 * toSafePropertyName('my entity') // 'myEntity'
 * ```
 */
export function toSafePropertyName(str: string): string {
  // If the string is already a valid identifier (no special chars), return as-is
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str)) {
    return str;
  }
  // Otherwise, convert to camelCase
  return toCamelCase(str);
}
