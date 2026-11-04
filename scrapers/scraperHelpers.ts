/**
 * Decodes a URI-encoded value, returning the input unchanged when it is not
 * valid percent-encoding (decodeURIComponent throws on malformed sequences).
 */
export const decodeIfEncoded = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};
