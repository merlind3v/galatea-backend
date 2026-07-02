export interface AgendaInputDto {
  id: string;
  properties: {
    Nombre?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
    Hora_Inicio?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
    Hora_Fin?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
  };
}
