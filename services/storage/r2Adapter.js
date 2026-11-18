const storage = require('./storageManager');

module.exports = {
  id: 'r2',
  contractMethods: ['signedUpload', 'signedDownload', 'delete', 'imageVariants', 'testConnection'],
  signedUpload: storage.getUploadUrl,
  signedDownload: storage.getDownloadUrl,
  delete: storage.deleteObject,
  imageVariants: storage.putImageVariants,
  testConnection: storage.testConnection,
};
