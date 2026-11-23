import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { ResumeParseError, detectFileKind, parseResumeBytes } from '../lib/resume/parsing.js';
import {
  buildProfile,
  buildRuleBasedDemoProfile,
  extractYears,
  RULE_BASED_DEMO_PARSER_ID,
} from '../lib/resume/profile.js';
import { contentTypeFor, validateResumeFile } from '../lib/resume/validation.js';
import { SAMPLE_RESUME_LINES, makeDocx, makePdf, makeZip } from './helpers/fixtures.js';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('parseResumeBytes', () => {
  it('reads UTF-16 text and Markdown without interpreting the content', async () => {
    const text = SAMPLE_RESUME_LINES.join('\n');
    const utf16 = Buffer.concat([Buffer.from([255,254]), Buffer.from(text,'utf16le')]);
    for (const [fileName, bytes] of [['resume.txt',utf16],['resume.md',Buffer.from(text)]]) {
      const profile = await parseResumeBytes(bytes, {fileName, contentType:'text/plain'});
      assert.match(profile.parsedText,/Kubernetes/);
    }
  });

  it('extracts ODT paragraphs and inline spans, and rejects a renamed DOCX', async () => {
    const odt = makeZip({
      mimetype:'application/vnd.oasis.opendocument.text',
      'content.xml':'<root xmlns:t="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><t:h>Jordan Example</t:h><t:p>Developed <t:span>Python</t:span> APIs and tested delivery systems.</t:p></root>',
    });
    const profile = await parseResumeBytes(odt, {fileName:'resume.odt'});
    assert.match(profile.parsedText,/Jordan Example\nDeveloped Python APIs/);
    await assert.rejects(parseResumeBytes(makeDocx(SAMPLE_RESUME_LINES), {fileName:'resume.odt'}),ResumeParseError);
  });

  it('rejects binary content labeled as plain text', async () => {
    await assert.rejects(parseResumeBytes(Buffer.from([0,1,2,3]), {fileName:'resume.txt'}), ResumeParseError);
  });

  it('parses a PDF resume into a structured profile', async () => {
    const profile = await parseResumeBytes(makePdf(SAMPLE_RESUME_LINES), { fileName: 'priya.pdf', contentType: PDF });

    assert.equal(profile.candidateName, 'Priya Raman');
    assert.equal(profile.candidateTitle, 'software engineer');
    assert.equal(profile.yearsExperience, 7);
    for (const skill of ['React', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes']) {
      assert.ok(profile.extractedSkills.includes(skill), `missing ${skill}`);
    }
    assert.ok(profile.profileCompleteness > 50);
  });

  it('parses a DOCX resume into a structured profile', async () => {
    const profile = await parseResumeBytes(makeDocx(SAMPLE_RESUME_LINES), { fileName: 'priya.docx', contentType: DOCX });

    assert.equal(profile.candidateName, 'Priya Raman');
    assert.equal(profile.yearsExperience, 7);
    assert.ok(profile.extractedSkills.includes('Kubernetes'));
    assert.match(profile.parsedText, /Deployed services on AWS/);
  });

  it('rejects unsupported file types', async () => {
    await assert.rejects(
      parseResumeBytes(new Uint8Array(Buffer.from('plain text resume')), { fileName: 'resume.exe' }),
      (error) => error instanceof ResumeParseError && /formats/.test(error.message)
    );
  });

  it('rejects a file whose content does not match its extension', async () => {
    await assert.rejects(
      parseResumeBytes(makeDocx(SAMPLE_RESUME_LINES), { fileName: 'resume.pdf', contentType: PDF }),
      (error) => error instanceof ResumeParseError && /not a valid PDF/.test(error.message)
    );
  });

  it('rejects a MIME type that contradicts the extension', async () => {
    await assert.rejects(
      parseResumeBytes(makePdf(SAMPLE_RESUME_LINES), { fileName: 'resume.pdf', contentType: 'image/png' }),
      /does not match its \.pdf extension/
    );
  });

  it('reports a malformed PDF as a readable error instead of crashing', async () => {
    const broken = new Uint8Array(Buffer.from('%PDF-1.4\nthis is not really a pdf\n%%EOF', 'latin1'));
    await assert.rejects(
      parseResumeBytes(broken, { fileName: 'broken.pdf', contentType: PDF }),
      (error) => error instanceof ResumeParseError
    );
  });

  it('reports a ZIP that is not a Word document as a readable error', async () => {
    const zip = makeZip({ 'notes.txt': 'hello' });
    await assert.rejects(
      parseResumeBytes(zip, { fileName: 'resume.docx', contentType: DOCX }),
      (error) => error instanceof ResumeParseError && /could not be read/.test(error.message)
    );
  });

  it('rejects documents with too little text (e.g. image-only PDFs)', async () => {
    await assert.rejects(
      parseResumeBytes(makePdf(['Hi']), { fileName: 'scan.pdf', contentType: PDF }),
      /No readable text/
    );
  });

  it('rejects empty and oversized files', async () => {
    await assert.rejects(parseResumeBytes(new Uint8Array(), { fileName: 'a.pdf' }), /empty/);
    await assert.rejects(parseResumeBytes(new Uint8Array(5 * 1024 * 1024 + 1), { fileName: 'a.pdf' }), /5 MB/);
  });
});

describe('detectFileKind', () => {
  it('identifies PDF and ZIP containers by magic bytes', () => {
    assert.equal(detectFileKind(makePdf(['x'])), 'pdf');
    assert.equal(detectFileKind(makeDocx(['x'])), 'docx');
    assert.equal(detectFileKind(new Uint8Array([1, 2, 3, 4, 5])), null);
  });
});

describe('validateResumeFile', () => {
  it('accepts PDF/DOCX within limits', () => {
    assert.equal(validateResumeFile({ name: 'cv.pdf', size: 1000, type: PDF }), null);
    assert.equal(validateResumeFile({ name: 'cv.DOCX', size: 1000, type: '' }), null);
  });

  it('rejects wrong extensions, mismatched MIME types, empty and large files', () => {
    assert.match(validateResumeFile({ name: 'cv.exe', size: 1000, type: 'application/octet-stream' }), /formats/);
    assert.match(validateResumeFile({ name: 'cv.pdf', size: 1000, type: 'image/png' }), /does not match/);
    assert.match(validateResumeFile({ name: 'cv.pdf', size: 0, type: PDF }), /empty/);
    assert.match(validateResumeFile({ name: 'cv.pdf', size: 6 * 1024 * 1024, type: PDF }), /5 MB/);
  });

  it('derives the stored content type from the extension', () => {
    assert.equal(contentTypeFor('a.pdf'), PDF);
    assert.equal(contentTypeFor('a.docx'), DOCX);
    assert.equal(contentTypeFor('a.exe'), null);
  });
});

describe('profile extraction', () => {
  it('ignores dates and phone numbers when reading years of experience', () => {
    assert.equal(extractYears('2019 - 2023, call 555 1234'), null);
    assert.equal(extractYears('3 years at Acme and 5+ yrs overall'), 5);
  });

  it('labels rule-based fallback profiles as demos, not trained model output', () => {
    const result = buildRuleBasedDemoProfile(SAMPLE_RESUME_LINES.join('\n'), 'priya.pdf');

    assert.equal(result.modelUsed, RULE_BASED_DEMO_PARSER_ID);
    assert.equal(result.value.candidateName, 'Priya Raman');
    assert.equal(result.value.candidateTitle, 'software engineer');
    assert.ok(result.value.extractedSkills.includes('Kubernetes'));
    assert.match(result.error, /not a trained model/);
  });

  it('falls back to the file name when no name line is found', () => {
    const profile = buildProfile('EXPERIENCE\nengineer@example.com\n'.repeat(5), 'jane_doe-resume.pdf');
    assert.equal(profile.candidateName, 'jane doe resume');
  });
});
