const MIME_TYPES = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    csv: 'text/csv',
};

/**
 * The mime type for a file name, from its extension, or null when it is not one we know.
 *
 * @param {String} fileName
 * @returns {String|null}
 */
export default function getMimeType(fileName) {
    const extension = String(fileName).split('.').pop().toLowerCase();

    return MIME_TYPES[extension] ?? null;
}
