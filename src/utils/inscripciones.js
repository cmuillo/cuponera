/** Normaliza y valida los datos de acompañante de una inscripción. */
function parseAcompanante(body) {
  const acompanante = body.acompanante === true;
  if (!acompanante) {
    return { acompanante: false, acompanante_nombre: null };
  }

  const nombre = String(body.acompanante_nombre || '').trim();
  if (!nombre) {
    return { error: 'Debe indicar el nombre de su acompañante.' };
  }
  if (nombre.length > 255) {
    return { error: 'El nombre del acompañante es demasiado largo.' };
  }
  return { acompanante: true, acompanante_nombre: nombre };
}

function normalizePadronSearch(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ').substring(0, 100);
  return text.length >= 2 ? text : null;
}

module.exports = { parseAcompanante, normalizePadronSearch };
