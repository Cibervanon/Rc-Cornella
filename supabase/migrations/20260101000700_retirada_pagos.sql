-- ============================================================================
--  007 · Retirada del módulo de pagos
-- ============================================================================
--  El club gestiona los pagos fuera de la aplicación: no hay domiciliación
--  SEPA, ni recibos, ni mandatos, ni cuotas por categoría. La app deja de
--  tocar dinero del todo.
--
--  Lo que se retira:
--    - tablas `invoices` y `mandates` (recibos y órdenes de domiciliación)
--    - columna `categories.cuota` (el precio por categoría)
--    - columna `season_history.facturas` (el archivo de recibos del cierre)
--
--  Se conservan íntegros los datos deportivos y de cumplimiento: fichas,
--  inscripciones, asistencia, partidos, documentos y firmas LOPIVI.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. Tablas de recibos y mandatos
-- ---------------------------------------------------------------------------
--  `drop table` se lleva consigo sus políticas RLS y sus índices: no hace
--  falta retirarlos aparte. `cascade` por si algo llegara a referenciarlas.
drop table if exists public.invoices cascade;
drop table if exists public.mandates cascade;


-- ---------------------------------------------------------------------------
--  2. El precio por categoría
-- ---------------------------------------------------------------------------
alter table public.categories drop column if exists cuota;


-- ---------------------------------------------------------------------------
--  3. El archivo de recibos del cierre de temporada
-- ---------------------------------------------------------------------------
--  La columna se creó en la migración 006 junto con `por_jugador`. El detalle
--  de minutos por jugador se queda (es historial deportivo); el archivo de
--  recibos deja de tener sentido sin pagos.
alter table public.season_history drop column if exists facturas;
