// Pruebas del backend (API REST) con el cliente HTTP de Playwright.
const { test, expect } = require('./helpers');

test.describe('API: salud y raiz', () => {
  test('GET /api/health reporta ok y la base de datos', async ({ api }) => {
    const res = await api.get('/api/health');
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.status).toBe('ok');
    expect(data.database).toBe('ok');
    expect(data).toHaveProperty('commit');
  });

  test('GET / con Accept JSON devuelve el mensaje de bienvenida', async ({ api }) => {
    const res = await api.get('/', { headers: { Accept: 'application/json' } });
    expect(res.headers()['content-type']).toContain('application/json');
    expect((await res.json()).data.mensaje).toBeTruthy();
  });

  test('GET / desde el navegador devuelve HTML', async ({ api }) => {
    const res = await api.get('/', { headers: { Accept: 'text/html' } });
    expect(res.headers()['content-type']).toContain('text/html');
  });

  test('ruta inexistente responde 404 normalizado', async ({ api }) => {
    const res = await api.get('/api/no-existe');
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ statusCode: 404, data: { mensaje: 'Ruta no encontrada' } });
  });
});

test.describe('API: ciclo de vida de una tarea', () => {
  test('crear, consultar, actualizar, completar y eliminar', async ({ api }) => {
    let res = await api.post('/api/tareas', { data: { titulo: 'Desde Playwright', categoria_id: 2 } });
    expect(res.status()).toBe(201);
    const tarea = (await res.json()).data;
    expect(tarea.categoria_nombre).toBe('Personal');

    res = await api.get(`/api/tareas/${tarea.id}`);
    expect((await res.json()).data.titulo).toBe('Desde Playwright');

    res = await api.put(`/api/tareas/${tarea.id}`, { data: { titulo: 'Editada' } });
    expect((await res.json()).data.titulo).toBe('Editada');

    res = await api.patch(`/api/tareas/${tarea.id}/completar`);
    expect((await res.json()).data.completada).toBe(1);

    res = await api.patch(`/api/tareas/${tarea.id}/completar`);
    expect(res.status()).toBe(409);

    res = await api.delete(`/api/tareas/${tarea.id}`);
    expect(res.status()).toBe(200);
    expect((await api.get(`/api/tareas/${tarea.id}`)).status()).toBe(404);
  });

  test('el filtro ?completada solo acepta 0 o 1', async ({ api }) => {
    expect((await api.get('/api/tareas?completada=0')).status()).toBe(200);
    expect((await api.get('/api/tareas?completada=si')).status()).toBe(400);
  });
});

test.describe('API: validaciones', () => {
  const casos = [
    ['titulo faltante', {}, 'El campo titulo es requerido'],
    ['titulo numerico', { titulo: 123 }, 'El campo titulo debe ser texto'],
    ['titulo vacio', { titulo: '' }, 'El campo titulo no puede estar vacio'],
    ['categoria inexistente', { titulo: 'x', categoria_id: 99 }, 'La categoria 99 no existe'],
    ['categoria invalida', { titulo: 'x', categoria_id: -1 }, 'El campo categoria_id debe ser un entero positivo']
  ];
  for (const [nombre, cuerpo, mensaje] of casos) {
    test(`ERROR: ${nombre} -> 400`, async ({ api }) => {
      const res = await api.post('/api/tareas', { data: cuerpo });
      expect(res.status()).toBe(400);
      expect((await res.json()).data.mensaje).toBe(mensaje);
    });
  }

  test('ERROR: id no numerico -> 400', async ({ api }) => {
    expect((await api.get('/api/tareas/abc')).status()).toBe(400);
  });

  test('ERROR: reset sin confirmacion -> 400', async ({ api }) => {
    expect((await api.delete('/api/reset')).status()).toBe(400);
  });
});

test.describe('API: categorias', () => {
  test('crear, renombrar y eliminar una categoria', async ({ api }) => {
    let res = await api.post('/api/categorias', { data: { nombre: 'Salud' } });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()).data;
    res = await api.put(`/api/categorias/${id}`, { data: { nombre: 'Bienestar' } });
    expect((await res.json()).data.nombre).toBe('Bienestar');
    expect((await api.delete(`/api/categorias/${id}`)).status()).toBe(200);
  });

  test('ERROR: nombre duplicado sin importar mayusculas -> 409', async ({ api }) => {
    expect((await api.post('/api/categorias', { data: { nombre: 'ESTUDIO' } })).status()).toBe(409);
  });
});

test.describe('Integracion frontend + backend', () => {
  test('una tarea creada por la API aparece en la interfaz', async ({ api, page }) => {
    await api.post('/api/tareas', { data: { titulo: 'Creada por la API', categoria_id: 1 } });
    await page.goto('/');
    await expect(page.getByTestId('tarea-titulo')).toHaveText(['Creada por la API']);
    await expect(page.getByTestId('tarea-categoria')).toHaveText('Trabajo');
  });

  test('una tarea creada en la interfaz queda guardada en la API', async ({ api, page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-listo', '1');
    await page.getByTestId('input-titulo').fill('Creada en la interfaz');
    await page.getByTestId('btn-agregar').click();
    await expect(page.getByTestId('tarea')).toHaveCount(1);
    const tareas = (await (await api.get('/api/tareas')).json()).data;
    expect(tareas.map((t) => t.titulo)).toEqual(['Creada en la interfaz']);
  });

  test('completar en la interfaz se refleja en la API', async ({ api, page }) => {
    const { data } = await (await api.post('/api/tareas', { data: { titulo: 'Sincronizada' } })).json();
    await page.goto('/');
    await page.getByTestId('btn-completar').click();
    await expect(page.getByTestId('tarea')).toHaveClass(/completada/);
    expect((await (await api.get(`/api/tareas/${data.id}`)).json()).data.completada).toBe(1);
  });
});
