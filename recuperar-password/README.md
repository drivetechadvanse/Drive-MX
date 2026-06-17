# Módulo de recuperación de contraseña

Carpeta independiente para recuperación de contraseña con Firebase Authentication.

## Archivos

- `password-reset.js`: componente React sin JSX y servicio para enviar correos de recuperación mediante `sendPasswordResetEmail`.

## Funcionamiento

- Agrega el enlace `¿Olvidaste tu contraseña?` en la pantalla de inicio de sesión.
- Abre un formulario modal para ingresar el correo registrado.
- Envía un enlace seguro de restablecimiento usando Firebase Authentication.
- No modifica el flujo actual de registro ni inicio de sesión.
- Mantiene compatibilidad con usuarios existentes porque usa las cuentas ya registradas en Firebase Authentication.

## Personalización del correo

Firebase Authentication envía el correo usando la plantilla configurada en Firebase Console.
Para personalizar nombre, logo, asunto y contenido visual:

1. Abrir Firebase Console.
2. Ir a Authentication > Templates / Plantillas.
3. Seleccionar Password reset / Restablecimiento de contraseña.
4. Configurar el nombre de la app como `Drive MX`.
5. Agregar el logotipo oficial de la aplicación.
6. Guardar la plantilla.

El módulo fuerza idioma español con `auth.languageCode = 'es'` y muestra el logotipo/nombre dentro del formulario de recuperación.
