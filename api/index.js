let app;
let initError = null;

try {
  app = require('../server/server.js');
} catch (e) {
  initError = e;
  console.error('[Vercel Server Init Error]', e);
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: 'Server Initialization Failed',
      message: initError.message,
      stack: initError.stack
    });
  }

  try {
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Server Runtime Error]', err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Server Runtime Error',
        message: err.message,
        stack: err.stack
      });
    }
  }
};
