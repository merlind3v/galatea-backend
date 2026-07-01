export interface TareaInputDto {
  id: string;
  properties: {
    Nombre?: {
      type: string;
      title?: { plain_text: string }[];
    };
    Estado?: {
      type: string;
      select?: { name: string } | null;
    };
    Contexto?: {
      type: string;
      select?: { name: string } | null;
    };
    Depende_De?: {
      type: string;
      relation?: { id: string }[];
    };
    Tiempo_Estimado?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
  };
}
