const fs = require('fs');
const path = require('path');

// Static config lives in app.json; this only wires in Firebase for
// Android push once google-services.json exists (see docs/push-notifications.md),
// so builds still work before Firebase is set up.
module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
  };
};
