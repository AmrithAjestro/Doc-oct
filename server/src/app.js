const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/config');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
// Logos are shown by the React app, which may run on another origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.ALLOWED_ORIGINS.includes(origin)),
    credentials: true
  })
);
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
if (!config.IS_PRODUCTION) app.use(morgan('dev'));

// Only branding is public. Certificates are served through an authorised route.
app.use('/uploads/branding', express.static(path.join(config.UPLOAD_DIR, 'branding'), { maxAge: '7d', fallthrough: false }));

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
