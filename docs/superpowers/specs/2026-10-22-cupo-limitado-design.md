# Reservas de cupo limitado

## Intención

Permitir que una actividad o sorteo funcione como un evento con capacidad
limitada y pago por asistencia, sin convertir esas reservas en cupones
participantes de la tómbola. Una persona se inscribe desde la ventana pública
existente, aparta su espacio y, si corresponde, el de un acompañante. La reserva
reduce la disponibilidad inmediatamente y permanece reservada hasta que el
administrador confirme el pago o elimine la reserva.

## Objetivos

- Configurar, por actividad, el modo **Cupo limitado**, la capacidad total y el
  precio por espacio.
- Mostrar en la ventana pública una barra y texto de disponibilidad.
- Crear una única reserva por persona inscrita: un espacio para el titular o dos
  al incluir acompañante.
- Calcular el importe con base en los espacios reservados.
- Dejar la reserva en pago pendiente, con un enlace de WhatsApp para enviar el
  comprobante al número configurado del sistema.
- Administrar reservas desde Historial con los mismos flujos visibles que los
  pagos pendientes: confirmar pago, enviar notificación por WhatsApp y eliminar.
- Excluir siempre las reservas de la generación, el historial de ganadores y la
  tómbola de cupones.
- Evitar sobreventas incluso si varias personas intentan reservar los últimos
  espacios simultáneamente.

## No objetivos

- No se permiten cantidades libres de espacios por una sola inscripción.
- No existe expiración automática de reservas pendientes.
- No se generan cupones participantes a partir de una reserva.
- No se modifica el comportamiento de sorteos sin cupo limitado.

## Configuración administrativa

Al crear o editar un sorteo/actividad, la inscripción pública tendrá un tipo:

- **Inscripción normal**: comportamiento actual, con cupón de inscripción.
- **Cupo limitado**: revela dos campos obligatorios:
  - **Cantidad total de espacios**: entero positivo.
  - **Precio por espacio**: entero positivo en colones.

El modo de acceso (libre o padrón previo) se mantiene disponible en ambos tipos.
Para una actividad de cupo limitado, el monto mínimo por cupón no interviene en
la reserva.

Los valores existentes permanecerán en inscripción normal para preservar la
conducta actual.

Una vez que existan reservas:

- El precio por espacio se podrá modificar, pero aplica exclusivamente a nuevas
  reservas; cada reserva conserva su monto total original.
- La capacidad total solo podrá reducirse hasta el número de espacios ya
  reservados (pendientes y confirmados).
- La actividad no podrá eliminarse mientras tenga reservas; podrá desactivarse
  para impedir nuevas reservas sin afectar el historial existente.

## Flujo público

La ventana `/inscripcion?sorteo=<id>` mantiene los campos de titular y, cuando
el acceso es por padrón, el buscador de personas disponibles.

Para cupo limitado mostrará, antes del formulario:

- Texto: `X de Y espacios disponibles`.
- Barra de progreso proporcional a los espacios ocupados.
- Aviso de actividad llena si no queda disponibilidad.

Al marcar acompañante, el formulario exige su nombre como hoy y actualiza el
resumen a **2 espacios** y **precio por 2 espacios**. Sin acompañante se reserva
un espacio. El servidor vuelve a calcular ambos valores; el navegador no es
fuente de verdad.

Al enviar:

1. Se crea una reserva pendiente y se consumen uno o dos espacios.
2. Se muestra una confirmación con espacios, monto, estado *Pago pendiente* y
   botón **Enviar comprobante por WhatsApp**.
3. El mensaje de WhatsApp contiene actividad, titular, cédula, espacios
   apartados y monto a pagar.
4. La reserva no genera cupón ni puede acceder a la pestaña de compra adicional.

Una inscripción normal conserva el flujo y la pestaña de compras actual.

## Persistencia y consistencia

Se añadirá una tabla `reservas_cupo` separada de `cupones`, con:

- actividad (`sorteo_id`), titular (cédula, nombre y teléfono), acompañante y
  nombre de acompañante;
- `espacios_reservados`, `monto_total`, `estado_pago` (`pendiente` o
  `confirmado`);
- fechas de creación y actualización;
- unicidad por actividad y cédula.

La actividad incluirá columnas para el tipo de inscripción, capacidad total y
precio por espacio. Las migraciones serán no destructivas.

La creación de una reserva se hará dentro de una transacción con bloqueo de la
fila de actividad. Se contará la suma de espacios de todas las reservas
pendientes y confirmadas, se verificará disponibilidad y solo entonces se
insertará. Eliminar una reserva libera todos sus espacios.

El monto total queda almacenado en cada reserva, de modo que los cambios
posteriores en el precio por espacio no alteran pagos pendientes ni confirmados.

El padrón público excluirá tanto inscripciones normales como reservas de cupo
para que una persona ya registrada no se vuelva a ofrecer.

## Historial y notificaciones

Historial tendrá una vista unificada o un filtro adicional que muestre cupones
y reservas. Una reserva mostrará actividad, titular, acompañante, número de
espacios, monto y estado de pago; no mostrará código de cupón.

Para una reserva pendiente se podrá:

- confirmar el pago;
- reenviar el enlace/recordatorio de comprobante;
- eliminar la reserva, liberando sus espacios.

Para una reserva confirmada se podrá enviar por WhatsApp una notificación de
**pago verificado y espacio reservado**, reutilizando el número del titular.

## Reportes

Los reportes de cupos limitados incluirán las reservas junto a sus espacios,
monto y estado de pago. Los totales distinguirán reservas pendientes,
confirmadas y espacios ocupados. El conteo de asistentes seguirá siendo titular
+ acompañante; en esta modalidad coincide con los espacios reservados.

## Validación

Pruebas unitarias y de integración deberán cubrir:

- cálculo de uno o dos espacios;
- rechazo si falta capacidad;
- concurrencia en el último espacio;
- creación pendiente, confirmación y eliminación que libera cupo;
- exclusión del padrón después de reservar;
- ausencia de cupones y ganadores para reservas;
- información y barra de disponibilidad en la interfaz pública.
