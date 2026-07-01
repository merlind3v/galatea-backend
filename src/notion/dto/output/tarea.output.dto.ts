export interface TareaOutputDto {
  id: string;
  nombre: string;
  estado: string;
  contexto: string;
  dependeDeIds: string[];
  tiempoEstimadoMin: number;
}
