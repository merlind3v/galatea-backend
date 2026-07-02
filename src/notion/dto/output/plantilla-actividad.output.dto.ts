export interface TareaConHorarioDto {
  nombre: string;
  horaInicio: string;
  horaFin: string;
}

export interface PlantillaActividadOutputDto {
  id: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  tipoActividad: string[];
  tareas: TareaConHorarioDto[];
}
