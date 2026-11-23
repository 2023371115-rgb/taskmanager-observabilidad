const { test: base, expect } = require('@playwright/test');

// Antes de cada prueba se vacia la base de datos con el endpoint de la propia API,
// para que todas empiecen con las 3 categorias iniciales y sin tareas.
const test = base.extend({
  api: async ({ request }, use) => {
    const res = await request.delete('/api/reset', { headers: { 'x-confirm-reset': 'true' } });
    expect(res.status()).toBe(200);
    await use(request);
  },
  app: async ({ page, api }, use) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-listo', '1');
    await use(page);
  }
});

async function crearTarea(page, titulo, categoria) {
  await page.getByTestId('input-titulo').fill(titulo);
  if (categoria) await page.getByTestId('select-categoria').selectOption({ label: categoria });
  await page.getByTestId('btn-agregar').click();
  await expect(page.getByTestId('tarea-titulo').filter({ hasText: titulo })).toBeVisible();
}

module.exports = { test, expect, crearTarea };
