// Requires the version-bound document RPC migration before deployment.
function driverDocumentLabel(path, status) {
  if (!path) return status
    ? `Legacy record: ${status}. No specific uploaded file is linked to this review. K&E must verify the document before relying on this status.`
    : 'No document submitted.';
  return `Current document: ${status || 'awaiting review'}. A replacement will need a new review.`;
}
function createDriverDocumentUploader(client, userId, expectedPaths) {
  const staged = new Map();
  return async function submitDocument(type, file) {
    if (!['license', 'insurance', 'registration'].includes(type)) throw new Error('Unsupported document type.');
    let item = staged.get(type);
    if (!item || item.file !== file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      item = { file, path: `${userId}/${type}-${crypto.randomUUID()}.${/^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin'}`, expected: expectedPaths[type] || null, uploaded: false, submitted: false };
      staged.set(type, item);
    }
    if (item.submitted) return item.path;
    if (!item.uploaded) {
      const { error } = await client.storage.from('driver-documents').upload(item.path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      // A lost upload response can leave the immutable object present. Only retry
      // this exact staged path/file; never overwrite a document during recovery.
      if (error && !['409', 'Duplicate'].includes(String(error.statusCode || error.code))) throw error;
      item.uploaded = true;
    }
    const { data, error } = await client.rpc('submit_driver_document', {
      p_document_type: type, p_object_path: item.path, p_expected_path: item.expected
    });
    if (error) throw error;
    if (!data || data.document_path !== item.path || !['pending', 'approved', 'attention'].includes(data.review_status)) throw new Error('Could not confirm the saved document version. Retry without selecting a new file.');
    item.submitted = true;
    expectedPaths[type] = item.path;
    return item.path;
  };
}
