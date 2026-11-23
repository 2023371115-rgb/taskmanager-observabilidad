// OpenTelemetry debe cargarse antes que Express
const telemetria = require('./telemetry');
const app = require('./app');
const { iniciarServidorSocket } = require('./socketServer');
const { log } = require('./observabilidad');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  log('info', `Servidor HTTP corriendo en el puerto ${PORT}`, {
    'app.commit': process.env.GIT_SHA || 'local',
    'app.port': Number(PORT)
  });
});

const socketServer = iniciarServidorSocket();

// Apagado ordenado: 'docker stop' envia SIGTERM. Se dejan de aceptar conexiones
// nuevas y se terminan las que estan en curso antes de salir.
function apagar(senal) {
  console.log(`${senal} recibido, cerrando servidores...`);
  socketServer.close();
  server.close(() => telemetria.apagar().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
