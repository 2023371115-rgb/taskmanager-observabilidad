// =============================================================================
// Utilidades de observabilidad usadas por la aplicacion:
//   - log(): registro estructurado (consola + OpenTelemetry Logs)
//   - middlewareMetricas: metricas y log por peticion HTTP
//   - trazarDb(): spans para cada consulta a SQLite
// Con el SDK apagado (pruebas) la API de OpenTelemetry es no-op.
// =============================================================================
const otel = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const tracer = otel.trace.getTracer('taskmanager-api');
const meter = otel.metrics.getMeter('taskmanager-api');
const logger = logs.getLogger('taskmanager-api');

const NIVELES = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR
};

const silencioso = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// Registro estructurado. Se asocia automaticamente a la traza activa.
function log(nivel, mensaje, atributos = {}) {
  logger.emit({
    severityNumber: NIVELES[nivel] || SeverityNumber.INFO,
    severityText: nivel.toUpperCase(),
    body: mensaje,
    attributes: atributos
  });
  if (!silencioso) {
    const linea = JSON.stringify({ ts: new Date().toISOString(), nivel, mensaje, ...atributos });
    (nivel === 'error' ? console.error : console.log)(linea);
  }
}

// ---------------------------------------------------------------- metricas HTTP
const peticiones = meter.createCounter('app_http_requests_total', {
  description: 'Peticiones HTTP atendidas por endpoint y codigo de estado'
});
const errores = meter.createCounter('app_http_errors_total', {
  description: 'Respuestas HTTP con codigo 4xx o 5xx'
});
const latencia = meter.createHistogram('app_http_request_duration_ms', {
  description: 'Tiempo de respuesta de cada peticion HTTP',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500] }
});

// Ruta "plantilla" (p. ej. /api/tareas/:id) para no crear una serie por cada id.
function rutaDe(req) {
  if (req.route && req.route.path) {
    const ruta = (req.baseUrl || '') + (req.route.path === '/' ? '' : req.route.path);
    return ruta || '/';
  }
  return req.path.startsWith('/static/') ? '/static/*' : 'sin_ruta';
}

function middlewareMetricas(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const atributos = {
      'http.method': req.method,
      'http.route': rutaDe(req),
      'http.status_code': res.statusCode
    };
    peticiones.add(1, atributos);
    latencia.record(ms, atributos);
    if (res.statusCode >= 400) errores.add(1, atributos);

    if (atributos['http.route'] !== '/static/*' && req.get('user-agent') !== 'docker-healthcheck') {
      const nivel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      log(nivel, `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)} ms)`, {
        ...atributos,
        'http.target': req.originalUrl,
        'http.duration_ms': Math.round(ms * 100) / 100,
        'http.user_agent': req.get('user-agent') || ''
      });
    }
  });
  next();
}

// ---------------------------------------------------------------- trazas de SQLite
const SQL_OPERACION = /^\s*(\w+)/;

function conSpan(sql, metodo, fn) {
  const operacion = (SQL_OPERACION.exec(sql) || [, 'SQL'])[1].toUpperCase();
  return tracer.startActiveSpan(`sqlite ${operacion}`, {
    kind: otel.SpanKind.CLIENT,
    attributes: {
      'db.system': 'sqlite',
      'db.operation': operacion,
      'db.statement': sql.replace(/\s+/g, ' ').trim().slice(0, 500),
      'db.method': metodo
    }
  }, (span) => {
    try {
      const resultado = fn();
      if (Array.isArray(resultado)) span.setAttribute('db.rows', resultado.length);
      else if (resultado && typeof resultado.changes === 'number') span.setAttribute('db.changes', resultado.changes);
      return resultado;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: otel.SpanStatusCode.ERROR, message: err.message });
      log('error', `Error en la base de datos: ${err.message}`, { 'db.statement': sql.slice(0, 200) });
      throw err;
    } finally {
      span.end();
    }
  });
}

// Envuelve db.prepare() de better-sqlite3 para que cada run/get/all genere un span.
function trazarDb(db) {
  const prepareOriginal = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = prepareOriginal(sql);
    return {
      run: (...args) => conSpan(sql, 'run', () => stmt.run(...args)),
      get: (...args) => conSpan(sql, 'get', () => stmt.get(...args)),
      all: (...args) => conSpan(sql, 'all', () => stmt.all(...args)),
      iterate: (...args) => stmt.iterate(...args)
    };
  };
  return db;
}

module.exports = { log, middlewareMetricas, trazarDb, tracer };
