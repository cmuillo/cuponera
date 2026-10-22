const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePadronSearch } = require('../src/utils/inscripciones');

test('requiere al menos dos caracteres para buscar una persona en el padrón', () => {
  assert.equal(normalizePadronSearch(' A '), null);
});

test('normaliza el texto de búsqueda del padrón', () => {
  assert.equal(normalizePadronSearch('  María   López  '), 'María López');
});

test('limita el texto de búsqueda del padrón a 100 caracteres', () => {
  assert.equal(normalizePadronSearch('a'.repeat(101)), 'a'.repeat(100));
});
