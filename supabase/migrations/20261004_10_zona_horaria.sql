-- 10 · Las fechas de suscripción se calculan con la hora de Bolivia (UTC-4).
-- Con UTC, un pago aprobado después de las 20:00 contaba desde "mañana".
alter function public.suscripcion_revisar_pago(uuid, boolean, text) set timezone = 'America/La_Paz';
alter function public.suscripcion_solicitar_pago(uuid, int, text, text) set timezone = 'America/La_Paz';
alter function public.suscripcion_actual() set timezone = 'America/La_Paz';
