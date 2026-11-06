/**
 * Serializes a value so it can be embedded inside an inline <script> element.
 * JSON.stringify alone does not escape "</script>", so a string containing it would end the script early.
 * The escapes below are valid JSON string escapes, so JSON.parse still returns the original value.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export const serializeForScript = (value: unknown): string => JSON.stringify(value)
   .replace(/</g, '\\u003c')
   .replace(/>/g, '\\u003e')
   .replace(/&/g, '\\u0026')
   .split(LINE_SEPARATOR).join('\\u2028')
   .split(PARAGRAPH_SEPARATOR).join('\\u2029');

export default serializeForScript;
