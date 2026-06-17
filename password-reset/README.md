# Módulo de recuperación de contraseña

Este módulo agrega la recuperación de contraseña por correo electrónico sin modificar el registro ni el inicio de sesión existentes.

## Archivos

- `password-reset.js`: inyecta el enlace **¿Olvidaste tu contraseña?**, muestra el formulario y llama a Firebase Authentication con `sendPasswordResetEmail`.

## Integración

El sistema principal solo importa el módulo:

```js
import "./password-reset/password-reset.js";
```

## Comportamiento

1. En la pantalla **Panel Staff** se agrega el enlace **¿Olvidaste tu contraseña?**.
2. El enlace abre un formulario para ingresar el correo registrado.
3. Firebase Authentication envía el correo con el enlace seguro de restablecimiento.
4. Después de cambiar la contraseña mediante el enlace de Firebase, el usuario puede iniciar sesión normalmente.

El mensaje de confirmación es intencionalmente genérico para no revelar si una cuenta existe o no.
