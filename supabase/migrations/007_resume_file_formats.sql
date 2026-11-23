-- Accept the canonical content types used by the resume uploader.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'text/plain', 'text/markdown'
]
where id = 'resumes';
