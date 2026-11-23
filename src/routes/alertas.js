const express = require('express');
const router = express.Router();
const { sendResponse } = require('../utils/response');
const { log } = require('../observabilidad');

// Receptor de alertas de OpenObserve (destino tipo webhook).
// Cada alerta recibida se registra como log de nivel WARN, de modo que tambien
// queda visible en OpenObserve, y se guardan las ultimas 50 en memoria.
const MAX_ALERTAS = 50;
const alertas = [];

router.post('/', (req, res) => {
  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  const alerta = {
    recibida_en: new Date().toISOString(),
    nombre: String(cuerpo.alert_name || cuerpo.nombre || 'alerta'),
    detalle: cuerpo
  };
  alertas.unshift(alerta);
  alertas.length = Math.min(alertas.length, MAX_ALERTAS);
  log('warn', `Alerta recibida de OpenObserve: ${alerta.nombre}`, {
    'alerta.nombre': alerta.nombre,
    'alerta.detalle': JSON.stringify(cuerpo).slice(0, 2000)
  });
  sendResponse(res, 201, { mensaje: 'Alerta registrada', total: alertas.length });
});

router.get('/', (req, res) => {
  sendResponse(res, 200, alertas);
});

module.exports = router;
