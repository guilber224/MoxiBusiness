-- Moxi Business — Migración 01: valores nuevos de enums.
-- ALTER TYPE ... ADD VALUE debe ejecutarse sola (no se puede usar el valor nuevo
-- en la misma transacción), por eso va en un archivo aparte.

alter type erp.movimiento_tipo add value if not exists 'VENTA';
alter type erp.movimiento_tipo add value if not exists 'COMPRA';
alter type erp.movimiento_tipo add value if not exists 'PRODUCCION';
alter type erp.movimiento_tipo add value if not exists 'ANULACION';
