# Drive MX - Vercel Gmail

Proyecto limpio para Vercel.

Estructura:
- `index.html`: frontend
- `api/send-order-email.js`: API route de Vercel para enviar correos con Gmail
- `package.json`: dependencia `nodemailer`

No incluye Firebase Functions.

## Deploy en Vercel

Sube esta carpeta completa a Vercel.

La API funciona en:

`/api/send-order-email`

El panel admin del HTML guarda y usa:
- correo remitente
- contraseña de aplicación Gmail
- correo base receptor


## Nuevas funciones agregadas

### Buscador de número de guía
- Campo de búsqueda centrado en la portada.
- Búsqueda automática al escribir y botón Buscar.
- Si la guía existe, muestra tarjeta con imagen del producto, nombre, ID de producto, estado de envío y número de guía.
- Si la guía no existe, muestra “No se encontró el envío”.
- Si se borra el input, la pantalla vuelve al estado inicial.
- En el panel admin, al crear un envío ahora se puede asociar un producto existente.

### Soporte técnico interno
- Botón “Soporte Técnico” en la portada.
- Menú hamburguesa en la parte superior del panel admin con opción “Soporte Técnico”.
- Chat en tiempo real usando Firestore en `support_chats`.
- Cada usuario conserva un chat activo; al cerrarlo, se crea uno nuevo vacío.
- Botón “Solucionado” disponible únicamente en el panel de control/admin.











