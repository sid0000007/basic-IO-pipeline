import { describe, expect, it } from 'vitest';
import { redactPii } from '../../../src/common/redaction/pii-redactor';

describe('redactPii', () => {
  it('redacts an email', () => {
    expect(redactPii('Contact me at jane@example.com please')).toBe('Contact me at [email] please');
  });

  it('redacts an SSN', () => {
    expect(redactPii('SSN 123-45-6789 here')).toBe('SSN [ssn] here');
  });

  it('redacts a North American phone number with parens', () => {
    expect(redactPii('Call (555) 123-4567 today')).toBe('Call [phone] today');
  });

  it('redacts a phone number with dot separators', () => {
    expect(redactPii('Mobile 555.123.4567')).toBe('Mobile [phone]');
  });

  it('redacts a Luhn-valid credit card', () => {
    expect(redactPii('Card 4242 4242 4242 4242 saved')).toBe('Card [card] saved');
  });

  it('does not redact a Luhn-invalid 16-digit string', () => {
    expect(redactPii('Code 1234 5678 9012 3456')).toBe('Code 1234 5678 9012 3456');
  });

  it('redacts a Luhn-valid card without separators', () => {
    expect(redactPii('Number: 4242424242424242')).toBe('Number: [card]');
  });

  it('redacts mixed content', () => {
    const input =
      'Email jane@example.com SSN 123-45-6789 phone (555) 123-4567 card 4242424242424242';
    expect(redactPii(input)).toBe('Email [email] SSN [ssn] phone [phone] card [card]');
  });

  it('returns the input unchanged when no PII present', () => {
    expect(redactPii('Just a plain text message.')).toBe('Just a plain text message.');
  });
});
