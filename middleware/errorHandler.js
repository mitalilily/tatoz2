const errorHandler = (err, req, res, next) => {
  require('../services/observability').captureError(err, req);
  let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    const value = err.keyValue ? err.keyValue[field] : '';
    const label = field.charAt(0).toUpperCase() + field.slice(1);
    message = `Duplicate ${label}${value ? ` "${value}"` : ''} — this ${field} is already registered`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // Multer upload limits/filter failures should be client errors, not opaque
  // 500s (which otherwise make retry storms likely for large uploads).
  if (err.name === 'MulterError') {
    statusCode = 400;
    const messages = {
      LIMIT_FILE_SIZE: 'Uploaded file is too large',
      LIMIT_FILE_COUNT: 'Too many files in one request',
      LIMIT_UNEXPECTED_FILE: 'Unexpected upload field',
      LIMIT_FIELD_COUNT: 'Too many form fields',
    };
    message = messages[err.code] || 'Upload failed';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.publicCode ? { code: err.publicCode } : {}),
    ...(err.details ? { errors: err.details } : {}),
    requestId: req.requestId,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = { errorHandler, notFound };
