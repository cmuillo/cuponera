const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAcompanante } = require('../src/utils/inscripciones');

test('exige el nombre del acompañante cuando se marca la casilla', () => {
  assert.deepEqual(parseAcompanante({ acompanante: true, acompanante_nombre: '   ' }), {
    error: 'Debe indicar el nombre de su acompañante.',
  });
});

test('conserva el nombre del acompañante cuando se marca la casilla', () => {
  assert.deepEqual(parseAcompanante({ acompanante: true, acompanante_nombre: '  Ana Rojas ' }), {
    acompanante: true,
    acompanante_nombre: 'Ana Rojas',
  });
});

test('descarta el nombre cuando la casilla no está marcada', () => {
  assert.deepEqual(parseAcompanante({ acompanante: false, acompanante_nombre: 'Ana Rojas' }), {
    acompanante: false,
    acompanante_nombre: null,
  });
});

test('rechaza un nombre de acompañante demasiado largo', () => {
  assert.deepEqual(parseAcompanante({ acompanante: true, acompanante_nombre: 'a'.repeat(256) }), {
    error: 'El nombre del acompañante es demasiado largo.',
  });
});
