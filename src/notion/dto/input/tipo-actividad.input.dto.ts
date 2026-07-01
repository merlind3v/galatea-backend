export interface TipoActividadInputDto {
  id: string;
  properties: {
    Nombre?: {
      type: string;
      title?: { plain_text: string }[];
    };
  };
}
