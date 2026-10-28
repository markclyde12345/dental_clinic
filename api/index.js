const app = require('../server/server.js');

module.exports = (req, res) => {
  try {
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Serverless Function Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
};
