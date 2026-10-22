const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTipoInscripcion, calcularReserva } = require('../src/utils/reservas-cupo');

test('requiere capacidad y precio positivos para cupo limitado', () => {
  assert.deepEqual(parseTipoInscripcion({
    tipo_inscripcion: 'cupo_limitado', capacidad_total: 0, precio_espacio: 5000,
  }), { error: 'La cantidad total de espacios debe ser mayor a cero.' });
});

test('rechaza un precio no positivo para cupo limitado', () => {
  assert.deepEqual(parseTipoInscripcion({
    tipo_inscripcion: 'cupo_limitado', capacidad_total: 10, precio_espacio: 0,
  }), { error: 'El precio por espacio debe ser mayor a cero.' });
});

test('normaliza las opciones de inscripción normal sin capacidad ni precio', () => {
  assert.deepEqual(parseTipoInscripcion({
    tipo_inscripcion: 'normal', capacidad_total: 100, precio_espacio: 5000,
  }), {
    tipo_inscripcion: 'normal',
    capacidad_total: null,
    precio_espacio: null,
  });
});

test('rechaza tipos de inscripción fuera de los modos permitidos', () => {
  assert.deepEqual(parseTipoInscripcion({
    tipo_inscripcion: 'otro', capacidad_total: 10, precio_espacio: 5000,
  }), { error: 'El tipo de inscripción no es válido.' });
});

test('calcula un espacio y un precio sin acompañante', () => {
  assert.deepEqual(calcularReserva(false, 5000), {
    espacios_reservados: 1, monto_total: 5000,
  });
});

test('calcula dos espacios y dos precios con acompañante', () => {
  assert.deepEqual(calcularReserva(true, 5000), {
    espacios_reservados: 2, monto_total: 10000,
  });
});
