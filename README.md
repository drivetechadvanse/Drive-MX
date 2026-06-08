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

### Protección de Mis Asignaciones
- El panel de usuarios registrados muestra un menú hamburguesa con la opción “Mis Asignaciones”.
- La sección existente de asignaciones permanece sin cambios en estructura, lógica y datos.
- Antes de mostrar asignaciones se solicita una contraseña en modal.
- La contraseña se valida con Firebase Authentication contra la cuenta del administrador central configurada en `ADMIN_EMAIL` (`admin@drivemx.com`).
- Si la contraseña no coincide, se muestra “Acceso denegado” y no se renderiza la información de asignaciones.

## Funciones agregadas en esta versión

### Administración de productos por usuario
- El panel de usuario registrado incluye un módulo propio de Administración de Productos.
- Cada publicación creada desde el panel de usuario conserva metadatos de propietario y se replica en `user_products/{uid}/items/{productId}` para almacenamiento independiente.
- La publicación activa también se guarda en `products` para que la portada principal la muestre usando el flujo global ya existente.
- El usuario solo visualiza, edita, activa/desactiva o elimina publicaciones asociadas a su propio `uid`.

### Correo para notificaciones de venta
- El panel de usuario incluye el campo "Correo para notificaciones de venta".
- Cuando se confirma una venta de una publicación con vendedor asociado, se envía al correo registrado el mensaje:
  "Tu producto ha sido vendido. Comunícate al 5633535701 o 5617549756 para la recolección de tu paquete."

### Ventas Realizadas
- El panel central incluye la sección "Ventas Realizadas".
- Se registra automáticamente vendedor, correo, teléfono, costo vendido y fecha/hora en `completed_sales` cuando se confirma pago PayPal o transferencia marcada como pagada.

### Transferencias Pendientes
- Cada registro tiene botón individual "Eliminar".
- Antes de borrar se solicita confirmación.
- La interfaz se actualiza de forma inmediata y se elimina el documento en Firestore.



