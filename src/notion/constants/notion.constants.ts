export const NOTION_CLIENT = 'NOTION_CLIENT';

export const CONFIG_MENU_POR_TIPO_ACTIVIDAD: Record<
  string,
  { campo: 'desayuno' | 'almuerzo' | 'cena' | 'limpieza'; prefijo?: string }
> = {
  PREPARAR_DESAYUNO: { campo: 'desayuno', prefijo: 'preparar: ' },
  PREPARAR_ALMUERZO: { campo: 'almuerzo', prefijo: 'preparar: ' },
  PREPARAR_CENA: { campo: 'cena', prefijo: 'preparar: ' },
  LIMPIEZA_MANTENIMIENTO: { campo: 'limpieza' },
};

export const CONTEXTO_POR_TIPO_ACTIVIDAD: Record<string, string> = {
  OFICINA: 'Oficina',
  TALLER: 'Taller',
};

export const ESTADO_TAREA_COMPLETADO = 'Completado';

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;
