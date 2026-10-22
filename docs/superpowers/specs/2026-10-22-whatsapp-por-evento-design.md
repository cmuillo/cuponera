# Número de WhatsApp por evento

## Intención

Permitir que cada sorteo o actividad defina el número de WhatsApp que recibe
comprobantes de compra de cupones y de reserva de cupos, para separar la
operación de eventos con organizadores distintos.

## Enfoques considerados

1. **Número obligatorio por evento:** elimina ambigüedad, pero requeriría editar
   todos los eventos existentes antes de que puedan recibir comprobantes.
2. **Número por evento con respaldo global:** permite definir el destinatario
   por actividad y conserva el número global solo cuando el evento no tiene uno.
   **Seleccionado**, porque migra sin interrumpir eventos existentes.
3. **Número global únicamente:** comportamiento actual; no resuelve la
   operación de varios eventos.

## Diseño seleccionado

- Agregar `whatsapp_comprobantes` opcional a `sorteos`, validado con la misma
  normalización de teléfonos costarricenses ya usada por el sistema.
- Mostrar el campo “WhatsApp para comprobantes” en el formulario de
  **Sorteos y Actividades**, con texto que aclare que, vacío, usa la
  configuración global.
- Mantener el número global en Configuración del Sistema como respaldo
  temporal y para compatibilidad con eventos existentes.
- Las respuestas de inscripción de cupo limitado y compra de cupones
  adicionales resolverán el destinatario como:
  `sorteo.whatsapp_comprobantes || configuracion.whatsapp_comprobantes`.
- Las notificaciones administrativas dirigidas al participante conservan su
  destino actual (el teléfono del titular); este cambio afecta solo los
  comprobantes enviados por la persona al organizador.

## Límites

- No se modifican paquetes de cupones ni la opción global de permitir compras.
- No se borra aún la configuración global.
- No se cambia el historial, la tómbola ni los reportes.

## Validación

- Evento con número propio: respuestas públicas usan ese número.
- Evento sin número propio: respuestas públicas usan el global.
- Número inválido: POST/PUT de evento responde 400.
- Los eventos existentes sin columna siguen funcionando mediante el respaldo.
