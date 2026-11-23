const request = require('supertest');
const app = require('../src/app');

describe('Webhook de alertas de OpenObserve', () => {
  test('POST /api/alertas registra la alerta -> 201', async () => {
    const res = await request(app).post('/api/alertas').send({ alert_name: 'errores_5xx', rows: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data.mensaje).toBe('Alerta registrada');
  });

  test('GET /api/alertas devuelve la mas reciente primero', async () => {
    await request(app).post('/api/alertas').send({ alert_name: 'cpu_alta' });
    const res = await request(app).get('/api/alertas');
    expect(res.status).toBe(200);
    expect(res.body.data[0].nombre).toBe('cpu_alta');
    expect(res.body.data[0].detalle).toEqual({ alert_name: 'cpu_alta' });
  });

  test('una alerta sin nombre se registra como "alerta"', async () => {
    await request(app).post('/api/alertas').send({});
    const res = await request(app).get('/api/alertas');
    expect(res.body.data[0].nombre).toBe('alerta');
  });

  test('solo se guardan las ultimas 50 alertas', async () => {
    for (let i = 0; i < 55; i++) await request(app).post('/api/alertas').send({ alert_name: `a${i}` });
    const res = await request(app).get('/api/alertas');
    expect(res.body.data).toHaveLength(50);
    expect(res.body.data[0].nombre).toBe('a54');
  });
});

describe('Frontend servido por Express', () => {
  test('GET / con Accept text/html devuelve la interfaz', async () => {
    const res = await request(app).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Gestor de Tareas');
  });

  test('GET /static/app.js devuelve el JavaScript del frontend', async () => {
    const res = await request(app).get('/static/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });
});
