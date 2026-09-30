/// Name and value sanitization matching Beacon API constraints.
export function sanitizeName(name: string): string {
  let result = name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (result.length === 0 || !/^[a-zA-Z]/.test(result)) {
    result = `e_${result}`;
  }
  return result.length > 40 ? result.slice(0, 40) : result;
}

export function sanitizeValue(value?: string | null): string {
  if (value === null || value === undefined || value.length === 0) return '';
  return value.length > 100 ? value.slice(0, 100) : value;
}
