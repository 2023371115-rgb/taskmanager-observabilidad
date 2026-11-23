// Pruebas de la interfaz web (frontend) contra la API real.
const { test, expect, crearTarea } = require('./helpers');

test.describe('Carga de la aplicacion', () => {
  test('muestra el titulo y el servicio en linea', async ({ app }) => {
    await expect(app).toHaveTitle('Gestor de Tareas');
    await expect(app.getByRole('heading', { name: 'Gestor de Tareas' })).toBeVisible();
    await expect(app.getByTestId('estado-servicio')).toHaveText('Servicio en línea');
  });

  test('el pie muestra la version y el commit desplegado', async ({ app }) => {
    await expect(app.getByTestId('version')).toContainText(require('../package.json').version);
    await expect(app.getByTestId('commit')).toContainText('commit');
  });

  test('carga las tres categorias iniciales en la lista y en el selector', async ({ app }) => {
    await expect(app.getByTestId('categoria')).toHaveCount(3);
    for (const nombre of ['Trabajo', 'Personal', 'Estudio']) {
      await expect(app.getByTestId('lista-categorias')).toContainText(nombre);
      await expect(app.getByTestId('select-categoria').locator('option', { hasText: nombre })).toHaveCount(1);
    }
  });

  test('sin tareas muestra el mensaje de lista vacia y el contador en 0', async ({ app }) => {
    await expect(app.getByTestId('lista-vacia')).toBeVisible();
    await expect(app.getByTestId('contador')).toHaveText('0 tareas');
  });

  test('no hay errores de JavaScript en la consola', async ({ page, api }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-listo', '1');
    expect(errores).toEqual([]);
  });

  test('los archivos estaticos responden 200', async ({ api }) => {
    for (const ruta of ['/static/app.js', '/static/styles.css']) {
      expect((await api.get(ruta)).status()).toBe(200);
    }
  });
});

test.describe('Crear tareas', () => {
  test('agrega una tarea sin categoria', async ({ app }) => {
    await crearTarea(app, 'Estudiar OpenTelemetry');
    await expect(app.getByTestId('tarea')).toHaveCount(1);
    await expect(app.getByTestId('contador')).toHaveText('1 tarea');
    await expect(app.getByTestId('aviso')).toHaveText('Tarea agregada');
  });

  test('agrega una tarea con categoria y muestra la etiqueta', async ({ app }) => {
    await crearTarea(app, 'Entregar proyecto final', 'Estudio');
    await expect(app.getByTestId('tarea-categoria')).toHaveText('Estudio');
  });

  test('el campo de titulo se limpia despues de agregar', async ({ app }) => {
    await crearTarea(app, 'Tarea temporal');
    await expect(app.getByTestId('input-titulo')).toHaveValue('');
  });

  test('agregar con Enter tambien funciona', async ({ app }) => {
    await app.getByTestId('input-titulo').fill('Con la tecla Enter');
    await app.getByTestId('input-titulo').press('Enter');
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Con la tecla Enter']);
  });

  test('ERROR: titulo vacio muestra el mensaje de la API', async ({ app }) => {
    await app.getByTestId('btn-agregar').click();
    await expect(app.getByTestId('aviso')).toHaveText('El campo titulo no puede estar vacio');
    await expect(app.getByTestId('aviso')).toHaveClass(/error/);
    await expect(app.getByTestId('tarea')).toHaveCount(0);
  });

  test('ERROR: titulo de solo espacios no se guarda', async ({ app }) => {
    await app.getByTestId('input-titulo').fill('     ');
    await app.getByTestId('btn-agregar').click();
    await expect(app.getByTestId('aviso')).toHaveClass(/error/);
    await expect(app.getByTestId('tarea')).toHaveCount(0);
  });

  test('las tareas persisten al recargar la pagina', async ({ app }) => {
    await crearTarea(app, 'Sobrevive al recargar');
    await app.reload();
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Sobrevive al recargar']);
  });

  test('varias tareas se listan en el orden en que se crearon', async ({ app }) => {
    for (const t of ['Primera', 'Segunda', 'Tercera']) await crearTarea(app, t);
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Primera', 'Segunda', 'Tercera']);
    await expect(app.getByTestId('contador')).toHaveText('3 tareas');
  });
});

test.describe('Completar y eliminar', () => {
  test('completar tacha la tarea y oculta su boton', async ({ app }) => {
    await crearTarea(app, 'Por completar');
    await app.getByTestId('btn-completar').click();
    await expect(app.getByTestId('tarea')).toHaveClass(/completada/);
    await expect(app.getByTestId('btn-completar')).toHaveCount(0);
    await expect(app.getByTestId('aviso')).toHaveText('Tarea completada');
  });

  test('eliminar quita la tarea de la lista', async ({ app }) => {
    await crearTarea(app, 'Por eliminar');
    await app.getByTestId('btn-eliminar').click();
    await expect(app.getByTestId('tarea')).toHaveCount(0);
    await expect(app.getByTestId('lista-vacia')).toBeVisible();
  });

  test('eliminar solo borra la tarea seleccionada', async ({ app }) => {
    await crearTarea(app, 'Se queda');
    await crearTarea(app, 'Se va');
    await app.getByRole('button', { name: 'Eliminar Se va' }).click();
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Se queda']);
  });
});

test.describe('Filtros', () => {
  test.beforeEach(async ({ app }) => {
    await crearTarea(app, 'Pendiente A');
    await crearTarea(app, 'Hecha B');
    await app.getByRole('button', { name: 'Completar Hecha B' }).click();
    await expect(app.getByTestId('tarea').filter({ hasText: 'Hecha B' })).toHaveClass(/completada/);
  });

  test('Pendientes muestra solo las no completadas', async ({ app }) => {
    await app.getByTestId('filtro-pendientes').click();
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Pendiente A']);
    await expect(app.getByTestId('filtro-pendientes')).toHaveClass(/activo/);
  });

  test('Completadas muestra solo las completadas', async ({ app }) => {
    await app.getByTestId('filtro-completadas').click();
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Hecha B']);
  });

  test('Todas vuelve a mostrar ambas', async ({ app }) => {
    await app.getByTestId('filtro-completadas').click();
    await app.getByTestId('filtro-todas').click();
    await expect(app.getByTestId('tarea')).toHaveCount(2);
  });
});

test.describe('Categorias', () => {
  test('agregar una categoria la muestra en la lista y en el selector', async ({ app }) => {
    await app.getByTestId('input-categoria').fill('Proyecto');
    await app.getByTestId('btn-agregar-categoria').click();
    await expect(app.getByTestId('categoria')).toHaveCount(4);
    await expect(app.getByTestId('select-categoria').locator('option', { hasText: 'Proyecto' })).toHaveCount(1);
  });

  test('ERROR: categoria duplicada muestra el conflicto', async ({ app }) => {
    await app.getByTestId('input-categoria').fill('trabajo');
    await app.getByTestId('btn-agregar-categoria').click();
    await expect(app.getByTestId('aviso')).toHaveText("Ya existe una categoria llamada 'trabajo'");
    await expect(app.getByTestId('categoria')).toHaveCount(3);
  });

  test('ERROR: nombre de categoria vacio', async ({ app }) => {
    await app.getByTestId('btn-agregar-categoria').click();
    await expect(app.getByTestId('aviso')).toHaveText('El campo nombre no puede estar vacio');
  });

  test('eliminar una categoria deja sus tareas sin categoria', async ({ app }) => {
    await crearTarea(app, 'Llamar al cliente', 'Trabajo');
    await app.getByRole('button', { name: 'Eliminar categoría Trabajo' }).click();
    await expect(app.getByTestId('categoria')).toHaveCount(2);
    await expect(app.getByTestId('tarea-titulo')).toHaveText(['Llamar al cliente']);
    await expect(app.getByTestId('tarea-categoria')).toHaveCount(0);
  });
});
