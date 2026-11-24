// GitHub Pages serves the demo from /<repo>/, so the web export needs that base
// path (EXPO_BASE_URL, set by .github/workflows/demo.yml). Everything else lives in app.json.
module.exports = ({ config }) =>
  process.env.EXPO_BASE_URL
    ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL } }
    : config;
