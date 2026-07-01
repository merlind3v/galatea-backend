export interface MenuDiaInputDto {
  id: string;
  properties: {
    Nombre?: {
      type: string;
      title?: { plain_text: string }[];
    };
    Desayuno?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
    Almuerzo?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
    Cena?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
    Limpieza?: {
      type: string;
      rich_text?: { plain_text: string }[];
    };
  };
}
