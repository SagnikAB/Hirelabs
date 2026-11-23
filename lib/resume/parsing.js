import { extractResumeText, ResumeParseError } from './extract.js';
import { MIN_TEXT_LENGTH, buildProfile } from './profile.js';

export { detectFileKind, ResumeParseError } from './extract.js';

export async function parseResumeBytes(bytes, meta = {}) {
  const text = await extractResumeText(bytes, meta);
  const profile = buildProfile(text, meta.fileName);
  if (profile.parsedText.length < MIN_TEXT_LENGTH) {
    throw new ResumeParseError('No readable text of sufficient length was found to build a profile.');
  }
  return profile;
}
