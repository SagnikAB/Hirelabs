import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import { fileExtension, validateResumeFile } from './formats.js';
import { cleanResumeText } from './text.js';

export class ResumeParseError extends Error {
  constructor(message) { super(message); this.name = 'ResumeParseError'; }
}

export function detectFileKind(bytes) {
  const header = Buffer.from(bytes.subarray(0, 8));
  if (header.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) return 'docx'; // ZIP, also used by ODT
  if (header.toString('hex') === 'd0cf11e0a1b11ae1') return 'doc';
  return null;
}

async function readPdf(bytes) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({data: new Uint8Array(bytes)});
  try { return (await parser.getText({pageJoiner: ''})).text; }
  finally { await parser.destroy(); }
}

function readPlain(bytes) {
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  const text = new TextDecoder(encoding, {fatal: true}).decode(bytes);
  for (const ch of text) {
    if (ch < ' ' && !'\n\t\r\f'.includes(ch)) throw new Error('Binary input');
  }
  return text;
}

async function readEntry(entry, limit) {
  if (!entry) throw new Error('Missing ODT entry');
  const chunks = [];
  let size = 0;
  return new Promise((resolve, reject) => {
    const stream = entry.internalStream('nodebuffer');
    stream.on('error', reject);
    stream.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        stream.pause();
        reject(new Error('ODT entry too large'));
      } else {
        chunks.push(chunk);
      }
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.resume();
  });
}

async function readOdt(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  if ((await readEntry(zip.file('mimetype'), 100)).trim() !== 'application/vnd.oasis.opendocument.text') throw new Error('Invalid ODT');
  const xml = new SaxesParser({xmlns: true});
  const textNs = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
  const parts = [];
  let paragraphDepth = 0;
  const paragraph = tag => tag.uri === textNs && ['p','h'].includes(tag.local);
  xml.on('doctype', () => { throw new Error('Unexpected doctype'); });
  xml.on('opentag', tag => {
    if (paragraph(tag)) paragraphDepth++;
    if (!paragraphDepth || tag.uri !== textNs) return;
    if (tag.local === 's' || tag.local === 'tab') parts.push(' ');
    if (tag.local === 'line-break') parts.push('\n');
  });
  xml.on('closetag', tag => { if (paragraph(tag)) { parts.push('\n'); paragraphDepth--; } });
  const append = value => { if (paragraphDepth) parts.push(value); };
  xml.on('text', append);
  xml.on('cdata', append);
  xml.write(await readEntry(zip.file('content.xml'), 16 * 1024 * 1024)).close();
  return parts.join('');
}

export async function extractResumeText(bytes, {fileName, contentType} = {}) {
  const error = validateResumeFile({name: fileName, type: contentType, size: bytes?.length});
  if (error) throw new ResumeParseError(error);
  const extension = fileExtension(fileName);
  const expected = {pdf:'pdf', doc:'doc', docx:'docx', odt:'docx', txt:null, md:null}[extension];
  if (detectFileKind(bytes) !== expected) throw new ResumeParseError(`This file is not a valid ${extension.toUpperCase()} document.`);
  let raw;
  try {
    switch (extension) {
      case 'pdf': raw = await readPdf(bytes); break;
      case 'docx': raw = (await mammoth.extractRawText({buffer: Buffer.from(bytes)})).value; break;
      case 'doc': {
        const doc = await new WordExtractor().extract(Buffer.from(bytes));
        raw = [doc.getHeaders({includeFooters:false}), doc.getBody(), doc.getTextboxes(), doc.getFooters()].filter(Boolean).join('\n');
        break;
      }
      case 'odt': raw = await readOdt(bytes); break;
      default: raw = readPlain(bytes);
    }
  } catch {
    throw new ResumeParseError(`The ${extension.toUpperCase()} could not be read. Check that the file opens and is not password-protected.`);
  }
  const text = cleanResumeText(raw);
  if (!text) throw new ResumeParseError(extension === 'pdf'
    ? 'No readable text was found. This PDF may be scanned. Upload a searchable PDF or paste the resume text.'
    : 'No readable text was found in the resume.');
  return text;
}
