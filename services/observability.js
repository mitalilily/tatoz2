const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

let Sentry;
try { Sentry = require('@sentry/node'); } catch (_) { Sentry = null; }

let metrics;
try {
  const client = require('prom-client');
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'tatoz_' });
  metrics = {
    registry,
    requests: new client.Counter({ name: 'tatoz_http_requests_total', help: 'HTTP requests handled', labelNames: ['method', 'route', 'status'], registers: [registry] }),
    latency: new client.Histogram({ name: 'tatoz_http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route'], registers: [registry], buckets: [0.05, 0.1, 0.3, 0.5, 0.8, 1, 2, 5] }),
    integrationFailures: new client.Counter({ name: 'tatoz_integration_failures_total', help: 'Provider integration failures', labelNames: ['provider', 'event'], registers: [registry] }),
  };
} catch (_) {
  metrics = null;
}

const init = () => {
  if (Sentry && process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development', tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.05, beforeSend(event) { if (event.request) { delete event.request.data; delete event.request.cookies; } return event; } });
};

const telemetryMiddleware = (req, res, next) => {
  const tracer = trace.getTracer('tatoz-api');
  const start = process.hrtime.bigint();
  tracer.startActiveSpan(`${req.method} ${req.path}`, span => {
    span.setAttribute('http.request_id', req.requestId || '');
    res.once('finish', () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      span.setAttribute('http.status_code', res.statusCode);
      if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      if (metrics) {
        const route = req.route?.path || req.path || 'unknown';
        metrics.requests.inc({ method: req.method, route, status: String(res.statusCode) });
        metrics.latency.observe({ method: req.method, route }, seconds);
      }
    });
    next();
  });
};

const captureError = (error, req) => {
  if (Sentry && process.env.SENTRY_DSN) Sentry.withScope(scope => { scope.setTag('request_id', req?.requestId || ''); scope.setUser(req?.user ? { id: String(req.user._id), role: req.user.role } : null); Sentry.captureException(error); });
};

const metricsHandler = async (req, res) => {
  if (process.env.METRICS_TOKEN && req.headers.authorization !== `Bearer ${process.env.METRICS_TOKEN}`) return res.status(401).send('Unauthorized');
  res.set('Content-Type', metrics?.registry.contentType || 'text/plain');
  res.send(metrics ? await metrics.registry.metrics() : '# metrics unavailable\n');
};

const countIntegrationFailure = (provider, event = 'failure') => { if (metrics) metrics.integrationFailures.inc({ provider, event }); };

module.exports = { init, telemetryMiddleware, captureError, metricsHandler, countIntegrationFailure };
