/**
 * Code builder utility for generating formatted code
 *
 * @module cli/utils/code-builder
 * @category CLI
 */

/**
 * Helper class for building generated code with proper indentation
 *
 * @example
 * ```typescript
 * const code = new CodeBuilder();
 * code.line("import { foo } from 'bar';");
 * code.line();
 * code.block('export function myFunc() {', () => {
 *   code.line('return 42;');
 * });
 * console.log(code.toString());
 * ```
 */
export class CodeBuilder {
  private _lines: string[] = [];
  private indentLevel = 0;
  private indentStr = '  '; // 2 spaces

  /**
   * Increase indentation level
   */
  indent(): this {
    this.indentLevel++;
    return this;
  }

  /**
   * Decrease indentation level
   */
  dedent(): this {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
    return this;
  }

  /**
   * Add a line of code
   */
  line(content: string = ''): this {
    if (content === '') {
      this._lines.push('');
    } else {
      this._lines.push(this.indentStr.repeat(this.indentLevel) + content);
    }
    return this;
  }

  /**
   * Add multiple lines of code
   */
  addLines(content: string[]): this {
    for (const line of content) {
      this.line(line);
    }
    return this;
  }

  /**
   * Add a single-line comment
   */
  comment(text: string): this {
    return this.line(`// ${text}`);
  }

  /**
   * Add a JSDoc comment
   */
  docComment(text: string): this {
    return this.line(`/** ${text} */`);
  }

  /**
   * Add a multi-line JSDoc comment
   */
  multiDocComment(lines: string[]): this {
    this.line('/**');
    for (const line of lines) {
      this.line(` * ${line}`);
    }
    this.line(' */');
    return this;
  }

  /**
   * Add a code block with automatic indentation
   */
  block(opener: string, fn: () => void, closer: string = '}'): this {
    this.line(opener);
    this.indent();
    fn();
    this.dedent();
    this.line(closer);
    return this;
  }

  /**
   * Add raw content without indentation
   */
  raw(content: string): this {
    this._lines.push(content);
    return this;
  }

  /**
   * Get the generated code as a string
   */
  toString(): string {
    return this._lines.join('\n');
  }

  /**
   * Clear all content
   */
  clear(): this {
    this._lines = [];
    this.indentLevel = 0;
    return this;
  }

  /**
   * Get current indentation level
   */
  getIndentLevel(): number {
    return this.indentLevel;
  }
}
