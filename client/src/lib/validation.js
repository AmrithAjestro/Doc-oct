// Client-side checks mirror the server's rules so people see problems before submitting.
// The server stays the authority and validates everything again.

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

export function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'At least 8 characters';
  if (!/[A-Za-z]/.test(pw)) return 'Include a letter';
  if (!/\d/.test(pw)) return 'Include a number';
  return null;
}

export const phoneProblem = (v) => (v && !/^\+?[0-9\s-]{7,20}$/.test(v.trim()) ? 'Enter a valid phone number' : null);

export const CERTIFICATE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function fileProblem(file, types, maxMb) {
  if (!file) return 'Please choose a file';
  if (!types.includes(file.type)) return `Allowed: ${types.map((t) => t.split('/')[1].toUpperCase()).join(', ')}`;
  if (file.size > maxMb * 1024 * 1024) return `Must be ${maxMb} MB or smaller`;
  return null;
}
