# 🎟️ Cuponera — Sistema de Gestión de Sorteos

Sistema web móvil y responsivo para gestión de sorteos, generación de cupones, reportes y tómbola digital.

## ✨ Funcionalidades

- **Sorteos y Actividades** — Crear, editar, activar/desactivar sorteos con fecha y descripción
- **Inscripción pública (invitados)** — Ventana sin login donde la persona se inscribe sola y obtiene su cupón, con casilla de acompañante y compra de cupones adicionales
- **Padrón por Excel** — Restringir una actividad a un listado previo de cédulas cargado desde `.xlsx`/`.csv`
- **Generación de Cupones** — Código único por participante (cédula + celular), con botón de WhatsApp
- **Historial de Cupones** — Búsqueda, reenvío por WhatsApp y confirmación de pagos pendientes
- **Reportes** — Estadísticas por cédula/celular, exportación a Excel con acompañantes + PDF cuadrícula para imprimir/tómbola física
- **Tómbola Digital** — Ruleta animada HTML5 Canvas, modo único y extracción múltiple
- **Configuración del Sistema** — Número de WhatsApp para comprobantes y paquetes de cupones
- **Mi Cuenta** — Cambio de contraseña del administrador

## 🎫 Inscripción pública de invitados

Cada sorteo puede habilitarse en modo **inscripción pública**. Al activarlo se obtiene un enlace
copiable desde *Sorteos y Actividades*:

```
https://tu-dominio/inscripcion?sorteo=<id>
```

Esa ventana no requiere login y tiene dos pestañas:

1. **Inscripción** — Nombre, cédula, teléfono y casilla *"Asistiré con un acompañante"*.
   Al marcar esa casilla se abre un campo para escribir el **nombre del acompañante**, que es
   obligatorio mientras la casilla esté marcada. Al enviar se genera automáticamente **1 cupón**
   (estado de pago *confirmado*).
2. **Comprar cupones** — Requiere estar inscrito previamente: la persona digita su cédula, el
   sistema la valida y muestra los paquetes configurados (por defecto ₡5.000 = 1 cupón,
   ₡8.000 = 2 cupones, ₡10.000 = 3 cupones). Tras *Generar cupones* aparece el botón
   **Enviar comprobante**, un link `wa.me` al número definido en *Configuración*.
   Estos cupones quedan en estado **pendiente de pago** hasta que un administrador los
   confirme desde el *Historial*.

La opción **Permitir compra de cupones adicionales** de *Configuración del Sistema* permite
desactivar completamente este flujo cuando la actividad solo requiere confirmar asistencia.
Al desactivarla, la pestaña no se muestra en la ventana pública y la API también rechaza
intentos de compra.

### Tipo de acceso

Al crear o editar un sorteo con inscripción pública se elige entre:

- **Libre** — cualquier persona puede inscribirse.
- **Listado previo (padrón)** — solo cédulas presentes en el padrón. El listado se carga desde
  un archivo Excel/CSV: se detecta automáticamente la columna de cédula y la de nombre (o se
  asume columna A = cédula, columna B = nombre). Las cédulas se normalizan quitando espacios y
  guiones, de modo que `1-1111-1111` y `111111111` se consideran la misma. En la ventana
  pública aparece un buscador por nombre; solo muestra personas autorizadas que aún no se han
  inscrito y, al seleccionar una, completa su nombre y cédula.

## 📊 Exportación de reportes

En *Reportes* el botón **Exportar Excel** genera un `.xlsx` con dos hojas:

- **Participantes** — Nombre, cédula, teléfono, **acompañante**, **nombre del acompañante**,
  cantidad de cupones, códigos y sorteo.
- **Resumen** — Totales de cupones, participantes, acompañantes y **personas a asistir**
  (participantes + acompañantes).

## 🚀 Despliegue en Railway

### 1. Subir a GitHub y conectar en railway.app

### 2. Agregar PostgreSQL
Railway → tu proyecto → **New → Database → Add PostgreSQL** (inyecta `DATABASE_URL` automáticamente)

### 3. Configurar variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `JWT_SECRET` | Clave secreta JWT (larga y aleatoria) | `m1_clave_super_secreta_2024_abc123` |
| `ADMIN_USER` | Usuario administrador | `admin` |
| `ADMIN_PASSWORD` | Contraseña inicial | `MiClave2024!` |
| `NODE_ENV` | Ambiente | `production` |

`DATABASE_URL` y `PORT` son asignados automáticamente por Railway.

## 💻 Desarrollo Local

```bash
npm install
cp .env.example .env   # Editar con datos locales
npm run dev            # http://localhost:3000
npm test               # Pruebas unitarias (node:test)
```

## 🔐 Seguridad
- bcrypt (salt 12) · JWT (8h) · Rate limiting login · Helmet · SQL paramétrico
- Las rutas públicas de inscripción (`/api/inscripciones`) no requieren token pero tienen
  rate limiting propio (60 solicitudes por IP cada 15 minutos).

## 📱 WhatsApp
Links `wa.me/` con mensaje prellenado. Números costarricenses de 8 dígitos: se agrega +506 automáticamente.
El número que recibe los comprobantes de compra se define en **Configuración del Sistema**
(se guarda en la base de datos, no requiere variables de entorno).

## 📄 PDF
A4, 3×5 = 15 cupones/página con bordes punteados para recorte.

## 🎰 Tómbola
Animación Canvas ease-out. Modo ganador único o extracción múltiple con historial.
Sistema que genera número de cupones para sorteos
