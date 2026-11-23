const { log, trazarDb } = require('../src/observabilidad');
const Database = require('better-sqlite3');

describe('Utilidades de observabilidad', () => {
  test('log() acepta todos los niveles sin lanzar errores', () => {
    for (const nivel of ['debug', 'info', 'warn', 'error', 'otro']) {
      expect(() => log(nivel, 'mensaje de prueba', { campo: 1 })).not.toThrow();
    }
  });

  test('trazarDb() conserva el resultado de run, get, all e iterate', () => {
    const db = trazarDb(new Database(':memory:'));
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    expect(db.prepare('INSERT INTO t (v) VALUES (?)').run('a').changes).toBe(1);
    expect(db.prepare('SELECT v FROM t WHERE id = ?').get(1)).toEqual({ v: 'a' });
    expect(db.prepare('SELECT * FROM t').all()).toHaveLength(1);
    expect([...db.prepare('SELECT * FROM t').iterate()]).toHaveLength(1);
  });

  test('trazarDb() propaga los errores de SQL', () => {
    const db = trazarDb(new Database(':memory:'));
    expect(() => db.prepare('SELECT * FROM t').all()).toThrow();
    db.exec('CREATE TABLE u (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    expect(() => db.prepare('INSERT INTO u (v) VALUES (?)').run(null)).toThrow(/NOT NULL/);
  });
});
