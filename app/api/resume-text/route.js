import { authenticateRequest } from '@/lib/supabase/server-auth';
import { apiError, apiSuccess } from '@/lib/api/response';
import { MAX_RESUME_BYTES, fileTypeError } from '@/lib/resume/formats';
import { extractResumeText, ResumeParseError } from '@/lib/resume/extract';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth.response) return auth.response;
  const fileName = 'resume.' + request.headers.get('x-resume-extension');
  const contentType = request.headers.get('content-type');
  const typeError = fileTypeError(fileName, contentType);
  if (typeError) return apiError('UNSUPPORTED_FILE', typeError, 415);
  const tooLarge = () => apiError('FILE_TOO_LARGE', 'Resumes must be 5 MB or smaller.', 413);
  if (Number(request.headers.get('content-length')) > MAX_RESUME_BYTES) return tooLarge();
  if (!request.body) return apiError('EMPTY_FILE', 'The resume file is empty.', 400);
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of request.body) {
      size += chunk.length;
      if (size > MAX_RESUME_BYTES) return tooLarge();
      chunks.push(chunk);
    }
    const text = await extractResumeText(Buffer.concat(chunks), {fileName, contentType});
    return apiSuccess({text});
  } catch (error) {
    if (error instanceof ResumeParseError) return apiError('UNREADABLE_RESUME', error.message, 422);
    return apiError('READ_FAILED', 'The resume could not be read.', 500);
  }
}
