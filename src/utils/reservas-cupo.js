function parseTipoInscripcion(body) {
  const tipoInscripcion = body.tipo_inscripcion;

  if (tipoInscripcion === 'normal') {
    return {
      tipo_inscripcion: 'normal',
      capacidad_total: null,
      precio_espacio: null,
    };
  }

  if (tipoInscripcion !== 'cupo_limitado') {
    return { error: 'El tipo de inscripción no es válido.' };
  }

  const capacidadTotal = Number(body.capacidad_total);
  if (!Number.isInteger(capacidadTotal) || capacidadTotal <= 0) {
    return { error: 'La cantidad total de espacios debe ser mayor a cero.' };
  }

  const precioEspacio = Number(body.precio_espacio);
  if (!Number.isInteger(precioEspacio) || precioEspacio <= 0) {
    return { error: 'El precio por espacio debe ser mayor a cero.' };
  }

  return {
    tipo_inscripcion: 'cupo_limitado',
    capacidad_total: capacidadTotal,
    precio_espacio: precioEspacio,
  };
}

function calcularReserva(acompanante, precioEspacio) {
  const espacios_reservados = acompanante ? 2 : 1;
  return {
    espacios_reservados,
    monto_total: espacios_reservados * precioEspacio,
  };
}

module.exports = { parseTipoInscripcion, calcularReserva };
