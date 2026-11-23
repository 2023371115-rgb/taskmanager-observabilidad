// =============================================================================
// Instrumentacion con OpenTelemetry (OTLP/HTTP) hacia OpenObserve.
//
// Se carga ANTES que Express (primera linea de server.js) para que las
// instrumentaciones de http y express puedan envolver esos modulos.
// Solo se activa si existe OTEL_EXPORTER_OTLP_ENDPOINT; en las pruebas (Jest)
// no se carga y la API de OpenTelemetry funciona como no-op.
//
// Variables de entorno estandar que leen los exportadores:
//   OTEL_EXPORTER_OTLP_ENDPOINT  p. ej. http://openobserve:5080/api/default
//   OTEL_EXPORTER_OTLP_HEADERS   p. ej. Authorization=Basic <base64>,stream-name=default
// =============================================================================
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!endpoint) {
  module.exports = { activo: false, apagar: async () => {} };
} else {
  const { NodeSDK, metrics, logs, resources } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
  const { version } = require('../package.json');

  const resource = new resources.Resource({
    'service.name': process.env.OTEL_SERVICE_NAME || 'taskmanager-api',
    'service.version': version,
    'service.namespace': 'taskmanager',
    'deployment.environment': process.env.NODE_ENV || 'development',
    'vcs.commit': process.env.GIT_SHA || 'local',
    'host.name': process.env.HOST_NAME || require('os').hostname()
  });

  const intervalo = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 10000);

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new metrics.PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: intervalo
    }),
    logRecordProcessors: [new logs.BatchLogRecordProcessor(new OTLPLogExporter())],
    instrumentations: [
      new HttpInstrumentation({
        // Los archivos estaticos del frontend y el HEALTHCHECK de Docker generan
        // mucho ruido; no se trazan.
        ignoreIncomingRequestHook: (req) =>
          req.url.startsWith('/static/') || req.headers['user-agent'] === 'docker-healthcheck'
      }),
      // Solo se trazan routers y manejadores; los middlewares (cors, json...) se omiten
      new ExpressInstrumentation({ ignoreLayersType: ['middleware'] })
    ]
  });

  sdk.start();
  console.log(`OpenTelemetry activo: exportando trazas, metricas y logs a ${endpoint}`);

  module.exports = {
    activo: true,
    apagar: () => sdk.shutdown().catch((e) => console.error('Error al cerrar OpenTelemetry', e))
  };
}
