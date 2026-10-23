import { describe, it, expect } from 'vitest';
import { parseLeadEmails, isValidEmail, extractCleanEmail } from './csvParser.js';

describe('isValidEmail', () => {
  it('identifies valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.domain.co')).toBe(true);
    expect(isValidEmail('test_123@domain.org')).toBe(true);
  });

  it('rejects invalid email formats', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('plainaddress')).toBe(false);
    expect(isValidEmail('@missingusername.com')).toBe(false);
    expect(isValidEmail('username@.com')).toBe(false);
    expect(isValidEmail('username@domain..com')).toBe(false);
  });
});

describe('extractCleanEmail', () => {
  it('extracts emails from angle brackets and removes quotes', () => {
    expect(extractCleanEmail('John Doe <john@example.com>')).toBe('john@example.com');
    expect(extractCleanEmail('"jane@example.com"')).toBe('jane@example.com');
    expect(extractCleanEmail('  test@domain.com  ')).toBe('test@domain.com');
  });
});

describe('parseLeadEmails', () => {
  it('parses plain text newline-separated emails and deduplicates', () => {
    const raw = `
      alice@test.com
      bob@test.com
      alice@test.com
      invalid-email
      charlie@test.com
    `;
    const result = parseLeadEmails(raw);

    expect(result.validUnique).toEqual(['alice@test.com', 'bob@test.com', 'charlie@test.com']);
    expect(result.duplicates).toEqual(['alice@test.com']);
    expect(result.invalid).toEqual(['invalid-email']);
    expect(result.totalRows).toBe(5);
  });

  it('parses standard CSV with header row', () => {
    const csv = `Email,Name,Company
alice@test.com,Alice,Acme
bob@test.com,Bob,Beta
invalid-email,Bad,None
alice@test.com,Alice,Acme`;

    const result = parseLeadEmails(csv);
    expect(result.validUnique).toEqual(['alice@test.com', 'bob@test.com']);
    expect(result.duplicates).toEqual(['alice@test.com']);
    expect(result.invalid).toEqual(['invalid-email']);
    expect(result.totalRows).toBe(4);
  });

  it('handles CSV without clear header by scanning columns', () => {
    const csv = `Acme,alice@test.com,Active
Beta,bob@test.com,Active`;

    const result = parseLeadEmails(csv);
    expect(result.validUnique).toEqual(['alice@test.com', 'bob@test.com']);
  });
});
