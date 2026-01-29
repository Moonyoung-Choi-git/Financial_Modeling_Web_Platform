import { createHash } from 'crypto';

/**
 * JSON Canonicalization Rule (RFC 8785 style):
 * 1. Object keys are sorted lexicographically.
 * 2. No whitespace (compact).
 * 3. Recursive processing.
 */
export function canonicalize(obj: any): string {
  // 1. Primitives or null
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  // 2. Arrays: Process elements recursively
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalize(item)).join(',') + ']';
  }

  // 3. Objects: Sort keys and process values recursively
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => {
    return JSON.stringify(key) + ':' + canonicalize(obj[key]);
  });
  return '{' + parts.join(',') + '}';
}

export function computeHash(data: any, algo: string = 'sha256'): string {
  const canonicalString = canonicalize(data);
  return createHash(algo).update(canonicalString).digest('hex');
}