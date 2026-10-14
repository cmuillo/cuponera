const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCompraAdicionales } = require('../src/utils/config');

test('interpreta la configuración de compras adicionales desactivada', () => {
  assert.equal(parseCompraAdicionales('false'), false);
  assert.equal(parseCompraAdicionales(false), false);
  assert.equal(parseCompraAdicionales('true'), true);
  assert.equal(parseCompraAdicionales(undefined), true);
});
