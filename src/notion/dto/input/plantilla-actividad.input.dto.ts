export interface PlantillaActividadInputDto {
  id: string;
  properties: {
    Nombre?: {
      type: string;
      title?: { plain_text: string }[];
    };
    Hora_Planificada?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
    Duracion_Min?: {
      type: string;
      number?: number | null;
    };
    Tipo_Actividad?: {
      type: string;
      relation?: { id: string }[];
    };
  };
}
