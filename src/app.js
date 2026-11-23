const path = require('path');
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');
const { sendResponse } = require('./utils/response');
const { log, middlewareMetricas } = require('./observabilidad');
const { version } = require('../package.json');

const tareasRouter = require('./routes/tareas');
const categoriasRouter = require('./routes/categorias');
const adminRouter = require('./routes/admin');
const healthRouter = require('./routes/health');
const alertasRouter = require('./routes/alertas');

// Mensaje de bienvenida de la ruta raiz.
// Para la demostracion del pipeline basta con cambiar este texto, hacer git push
// y ver como el nuevo mensaje aparece en http://<IP_EC2>/ sin entrar al servidor.
const MENSAJE_BIENVENIDA = 'API de gestion de tareas funcionando correctamente';

// La app de Express se construye aqui y se exporta SIN llamar a listen().
// Asi las pruebas (Supertest) pueden usarla directamente sin abrir un puerto.
const app = express();

app.disable('x-powered-by');
app.use(middlewareMetricas);
app.use(cors());
app.use(express.json({ limit: '100kb' }));

initDb();

// Frontend: archivos estaticos (HTML, CSS y JS) de la carpeta public/
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use('/static', express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

// Ruta raiz: un navegador recibe la interfaz web; un cliente de la API (curl, Postman,
// Supertest) recibe el JSON de bienvenida.
app.get('/', (req, res) => {
  if (req.accepts(['json', 'html']) === 'html') {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  sendResponse(res, 200, { mensaje: MENSAJE_BIENVENIDA, version });
});

app.use('/api/health', healthRouter);
app.use('/api/tareas', tareasRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/alertas', alertasRouter);
app.use('/api', adminRouter);

// Manejo de rutas no encontradas
app.use((req, res) => {
  sendResponse(res, 404, { mensaje: 'Ruta no encontrada' });
});

// Manejo de errores: JSON mal formado, body demasiado grande o errores inesperados.
// Siempre se responde con el schema normalizado { statusCode, data }.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return sendResponse(res, 400, { mensaje: 'El cuerpo de la peticion no es un JSON valido' });
  }
  if (err.type === 'entity.too.large') {
    return sendResponse(res, 413, { mensaje: 'El cuerpo de la peticion es demasiado grande' });
  }
  log('error', `Error no controlado: ${err.message}`, {
    'exception.type': err.name,
    'exception.stacktrace': String(err.stack || '').slice(0, 2000),
    'http.target': req.originalUrl
  });
  return sendResponse(res, 500, { mensaje: 'Error interno del servidor' });
});

module.exports = app;
