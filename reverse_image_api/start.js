// start.js
// 1) Disable GCE metadata probing at load time
process.env.GOOGLE_CLOUD_DISABLE_GCE_METADATA = 'true';

// 2) Monkey-patch gcp-metadata to short-circuit its isAvailable() check
require('gcp-metadata').isAvailable = async () => false;

// 3) Now load your real app
require('./src/app');
