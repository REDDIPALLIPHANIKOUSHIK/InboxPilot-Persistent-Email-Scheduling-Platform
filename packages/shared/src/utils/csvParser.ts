export interface ParsedLeadsResult {
  totalRows: number;
  validUnique: string[];
  invalid: string[];
  duplicates: string[];
}

// RFC 5322 simplified but practical email regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates whether a string is a syntactically valid email address
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Cleans an email string (removes surrounding quotes, angle brackets from 'Name <email@domain.com>')
 */
export function extractCleanEmail(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // If in format "Name <email@domain.com>" or "<email@domain.com>"
  const angleMatch = cleaned.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    cleaned = angleMatch[1].trim();
  }

  // Remove surrounding single or double quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim().toLowerCase();
  return cleaned;
}

/**
 * Parses CSV or plain text input and extracts emails with validation and deduplication
 */
export function parseLeadEmails(content: string): ParsedLeadsResult {
  if (!content || !content.trim()) {
    return {
      totalRows: 0,
      validUnique: [],
      invalid: [],
      duplicates: [],
    };
  }

  // Split into lines
  const rawLines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (rawLines.length === 0) {
    return {
      totalRows: 0,
      validUnique: [],
      invalid: [],
      duplicates: [],
    };
  }

  const seenEmails = new Set<string>();
  const validUnique: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];

  // Check if first line looks like a CSV header
  const firstLine = rawLines[0];
  const isLikelyCsv = firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t');

  let emailColIndex = -1;
  let hasHeader = false;

  if (isLikelyCsv) {
    const delimiter = firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : '\t';
    const headerCols = firstLine.split(delimiter).map((col) => col.trim().toLowerCase().replace(/^["']|["']$/g, ''));

    // Check if any header column name indicates email
    emailColIndex = headerCols.findIndex((col) =>
      ['email', 'e-mail', 'mail', 'email address', 'recipient', 'to'].includes(col)
    );

    if (emailColIndex !== -1) {
      hasHeader = true;
    } else {
      // Check if header itself contains a valid email
      const containsEmailInHeader = headerCols.some((col) => isValidEmail(extractCleanEmail(col)));
      if (!containsEmailInHeader) {
        // If row 1 doesn't have an email, it might be an arbitrary header row
        hasHeader = true;
        // Let's inspect line 2 to find which column holds emails
        if (rawLines.length > 1) {
          const sampleCols = rawLines[1].split(delimiter).map(extractCleanEmail);
          emailColIndex = sampleCols.findIndex((val) => isValidEmail(val));
        }
      }
    }
  }

  const linesToProcess = hasHeader ? rawLines.slice(1) : rawLines;
  const totalRows = linesToProcess.length;

  for (const line of linesToProcess) {
    let candidate = '';

    if (isLikelyCsv) {
      const delimiter = line.includes(',') ? ',' : line.includes(';') ? ';' : '\t';
      const cols = line.split(delimiter).map((c) => extractCleanEmail(c));

      if (emailColIndex !== -1 && emailColIndex < cols.length) {
        candidate = cols[emailColIndex];
      } else {
        // Find first column matching email pattern
        const found = cols.find((c) => isValidEmail(c));
        candidate = found || cols[0] || '';
      }
    } else {
      candidate = extractCleanEmail(line);
    }

    if (!candidate) {
      invalid.push(line);
      continue;
    }

    if (!isValidEmail(candidate)) {
      invalid.push(candidate);
    } else if (seenEmails.has(candidate)) {
      duplicates.push(candidate);
    } else {
      seenEmails.add(candidate);
      validUnique.push(candidate);
    }
  }

  return {
    totalRows,
    validUnique,
    invalid,
    duplicates,
  };
}
