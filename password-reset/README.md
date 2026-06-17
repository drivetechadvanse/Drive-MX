# Recuperación de contraseña

Este módulo agrega recuperación de contraseña con Firebase Authentication sin modificar la lógica existente de registro ni inicio de sesión.

## Archivos

- `password-reset.js`: inserta el enlace "¿Olvidaste tu contraseña?", abre el formulario y envía el correo con `sendPasswordResetEmail`.
- `password-reset.css`: estilos aislados del modal y enlace.
- `firebase-email-template.md`: guía para personalizar el correo desde Firebase Console.

## Personalización del correo

Firebase Authentication envía el enlace seguro y permite personalizar el nombre/logotipo del correo desde Firebase Console.
