/**
 * Extracts filename from any path (Windows or Unix)
 * Handles: "D:\\path\\file.pdf", "/unix/path/file.pdf", "file.pdf"
 * @param {string} filePath - The file path
 * @returns {string} The filename
 */
export const extractFilename = (filePath) => {
  // Split by both forward and back slashes, return last segment
  return filePath.split(/[\\/]/).pop() || filePath;
};