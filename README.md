# 🎟️ Cuponera — Sistema de Gestión de Sorteos

Sistema web móvil y responsivo para gestión de sorteos, generación de cupones, reportes y tómbola digital.

## ✨ Funcionalidades

- **Configuración de Sorteos** — Crear, editar, activar/desactivar sorteos con fecha y descripción
- **Generación de Cupones** — Código único por participante (cédula + celular), con botón de WhatsApp
- **Historial de Cupones** — Búsqueda y reenvío por WhatsApp
- **Reportes** — Estadísticas por cédula/celular + PDF cuadrícula para imprimir/tómbola física
- **Tómbola Digital** — Ruleta animada HTML5 Canvas, modo único y extracción múltiple
- **Mi Cuenta** — Cambio de contraseña del administrador

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
```

## 🔐 Seguridad
- bcrypt (salt 12) · JWT (8h) · Rate limiting login · Helmet · SQL paramétrico

## 📱 WhatsApp
Links `wa.me/` con mensaje prellenado. Números colombianos de 10 dígitos: se agrega +57 automáticamente.

## 📄 PDF
A4, 3×5 = 15 cupones/página con bordes punteados para recorte.

## 🎰 Tómbola
Animación Canvas ease-out. Modo ganador único o extracción múltiple con historial.
Sistema que genera número de cupones para sorteos
