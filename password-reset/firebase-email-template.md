# Personalizar correo de recuperación en Firebase Authentication

Firebase Authentication no permite cambiar completamente el diseño HTML del correo desde el frontend. Para mostrar el nombre y logotipo de la aplicación:

1. Abre Firebase Console.
2. Entra al proyecto `drivemx-paqueteria`.
3. Ve a Authentication > Templates / Plantillas.
4. Selecciona Password reset / Restablecimiento de contraseña.
5. Configura:
   - Nombre de la app: Drive MX
   - Logotipo de la app: logotipo oficial de Drive MX
   - Asunto y mensaje amigable para recuperación.
6. Guarda los cambios.

El módulo ya envía el correo oficial seguro de Firebase Authentication y mantiene compatibilidad con usuarios existentes.
