# Módulo de cartera Drive MX

Este módulo mantiene la lógica de cartera fuera del `index.html` principal.

## Archivos

- `wallet.js`: servicios Firestore, reglas de recarga, comisiones, movimientos, validaciones, carga de PayPal y componentes visuales React sin JSX.

## Colecciones Firestore usadas

Todas se guardan bajo `artifacts/{projectId}/public/data`:

- `wallets/{uid}`: saldo independiente por usuario.
- `wallets/{uid}/movements/{movementId}`: historial individual de movimientos.
- `wallet_recharges/{rechargeId}`: bitácora administrativa de recargas PayPal.
- `wallet_commissions/{commissionId}`: bitácora administrativa de comisiones descontadas.
- `wallet_settings/config`: porcentaje global de comisión.

## Reglas principales

- Saldo inicial: `$0 MXN`.
- Primera recarga obligatoria: mínimo `$500 MXN` para activar cartera.
- Recargas posteriores: cualquier monto mayor a `$0 MXN`.
- Las recargas usan el mismo `PayPal Client ID` configurado en el Panel de Control.
- Las comisiones se descuentan automáticamente al registrarse una venta de una publicación de usuario.
- Si la cartera no está activada o no alcanza para cubrir la comisión estimada, se bloquean nuevas publicaciones/ventas.
