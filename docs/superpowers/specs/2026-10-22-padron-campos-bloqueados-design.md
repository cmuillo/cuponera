# Campos bloqueados para inscripción con padrón

## Intención

Evitar que una persona modifique su nombre o cédula después de elegir un
registro del listado autorizado. El celular y los datos de acompañante se
mantienen editables para completar la inscripción.

## Enfoques considerados

1. **Deshabilitar Nombre y Cédula tras elegir una persona:** mantiene los
   datos visibles y permite escoger otra persona desde el buscador.
   **Seleccionado** por corresponder al comportamiento solicitado.
2. **Ocultar Nombre y Cédula:** reduce el formulario, pero impide revisar los
   datos que se enviarán.

## Diseño seleccionado

- Solo para actividades con `restringir_padron` activo.
- Al seleccionar una persona del buscador público, `inscNombre` e
  `inscCedula` se rellenan y se deshabilitan.
- El campo de búsqueda permanece disponible; seleccionar otro resultado
  reemplaza ambos valores bloqueados.
- Celular, acompañante y nombre del acompañante no cambian.
- El servidor conserva su validación actual de que la cédula pertenece al
  padrón autorizado; este ajuste no altera el contrato de la API.

## Validación

- Actividad con padrón: seleccionar un resultado bloquea Nombre y Cédula.
- Actividad sin padrón: ambos campos continúan editables.
- Una nueva selección reemplaza los valores y conserva el bloqueo.
