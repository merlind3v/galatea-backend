import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  collectPaginatedAPI,
  isFullDatabase,
  isFullPage,
} from '@notionhq/client';
import {
  CONFIG_MENU_POR_TIPO_ACTIVIDAD,
  CONTEXTO_POR_TIPO_ACTIVIDAD,
  DIAS_SEMANA,
  ESTADO_TAREA_COMPLETADO,
  NOTION_CLIENT,
} from '../constants/notion.constants';
import { TipoDiaInputDto } from '../dto/input/tipo-dia.input.dto';
import { TipoDiaOutputDto } from '../dto/output/tipo-dia.output.dto';
import { PlantillaActividadInputDto } from '../dto/input/plantilla-actividad.input.dto';
import { PlantillaActividadOutputDto } from '../dto/output/plantilla-actividad.output.dto';
import { TipoActividadInputDto } from '../dto/input/tipo-actividad.input.dto';
import { TipoActividadOutputDto } from '../dto/output/tipo-actividad.output.dto';
import { MenuDiaInputDto } from '../dto/input/menu-dia.input.dto';
import { MenuDiaOutputDto } from '../dto/output/menu-dia.output.dto';
import { TareaInputDto } from '../dto/input/tarea.input.dto';
import { TareaOutputDto } from '../dto/output/tarea.output.dto';

@Injectable()
export class NotionService {
  constructor(
    @Inject(NOTION_CLIENT) private readonly notion: Client,
    private readonly configService: ConfigService,
  ) {}

  async getTiposDia(): Promise<TipoDiaOutputDto[]> {
    const dataSourceId = await this.getDataSourceId(
      this.configService.getOrThrow<string>('NOTION_DB_TIPOS_DIA'),
    );

    const pages = await collectPaginatedAPI(this.notion.dataSources.query, {
      data_source_id: dataSourceId,
    });

    return pages.filter(isFullPage).map((page) => this.toTipoDiaDto(page));
  }

  async getPlantillasActividades(
    tipoDiaId: string,
  ): Promise<PlantillaActividadOutputDto[]> {
    const dataSourceId = await this.getDataSourceId(
      this.configService.getOrThrow<string>('NOTION_DB_PLANTILLAS'),
    );

    const [pages, tiposActividad, menuDelDia, todasLasTareas] =
      await Promise.all([
        collectPaginatedAPI(this.notion.dataSources.query, {
          data_source_id: dataSourceId,
          filter: {
            property: 'Tipo_Dia',
            relation: { contains: tipoDiaId },
          },
        }),
        this.getTiposActividad(),
        this.getMenuDelDia(DIAS_SEMANA[new Date().getDay()]),
        this.getTareas(),
      ]);

    const nombresPorTipoActividadId = new Map(
      tiposActividad.map((tipoActividad) => [
        tipoActividad.id,
        tipoActividad.nombre,
      ]),
    );

    const tareasPorContexto = new Map<string, TareaOutputDto[]>(
      [...new Set(Object.values(CONTEXTO_POR_TIPO_ACTIVIDAD))].map(
        (contexto) => [
          contexto,
          this.tareasElegibles(todasLasTareas, contexto),
        ],
      ),
    );

    return pages
      .filter(isFullPage)
      .map((page) =>
        this.toPlantillaActividadDto(
          page,
          nombresPorTipoActividadId,
          menuDelDia,
          tareasPorContexto,
        ),
      )
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }

  async getTareas(): Promise<TareaOutputDto[]> {
    const dataSourceId = await this.getDataSourceId(
      this.configService.getOrThrow<string>('NOTION_DB_TAREAS'),
    );

    const pages = await collectPaginatedAPI(this.notion.dataSources.query, {
      data_source_id: dataSourceId,
    });

    return pages.filter(isFullPage).map((page) => this.toTareaDto(page));
  }

  private tareasElegibles(
    tareas: TareaOutputDto[],
    contexto: string,
  ): TareaOutputDto[] {
    const estadoPorId = new Map(
      tareas.map((tarea) => [tarea.id, tarea.estado]),
    );

    return tareas.filter(
      (tarea) =>
        tarea.contexto === contexto &&
        tarea.estado !== ESTADO_TAREA_COMPLETADO &&
        tarea.dependeDeIds.every(
          (id) => estadoPorId.get(id) === ESTADO_TAREA_COMPLETADO,
        ),
    );
  }

  async getMenuDelDia(dia: string): Promise<MenuDiaOutputDto | undefined> {
    const dataSourceId = await this.getDataSourceId(
      this.configService.getOrThrow<string>('NOTION_DB_MENU_SEMANA'),
    );

    const pages = await collectPaginatedAPI(this.notion.dataSources.query, {
      data_source_id: dataSourceId,
    });

    return pages
      .filter(isFullPage)
      .map((page) => this.toMenuDiaDto(page))
      .find((menu) => menu.dia === dia);
  }

  async getTiposActividad(): Promise<TipoActividadOutputDto[]> {
    const dataSourceId = await this.getDataSourceId(
      this.configService.getOrThrow<string>('NOTION_DB_TIPO_ACTIVIDAD'),
    );

    const pages = await collectPaginatedAPI(this.notion.dataSources.query, {
      data_source_id: dataSourceId,
    });

    return pages
      .filter(isFullPage)
      .map((page) => this.toTipoActividadDto(page));
  }

  private toPlantillaActividadDto(
    page: PlantillaActividadInputDto,
    nombresPorTipoActividadId: Map<string, string>,
    menuDelDia: MenuDiaOutputDto | undefined,
    tareasPorContexto: Map<string, TareaOutputDto[]>,
  ): PlantillaActividadOutputDto {
    const nombre = page.properties.Nombre;
    const horaPlanificada = page.properties.Hora_Planificada;
    const duracionMin = page.properties.Duracion_Min;
    const tipoActividad = page.properties.Tipo_Actividad;

    const horaInicio =
      horaPlanificada?.type === 'rich_text' && horaPlanificada.rich_text
        ? horaPlanificada.rich_text.map((text) => text.plain_text).join('')
        : '';

    const minutos =
      duracionMin?.type === 'number' && typeof duracionMin.number === 'number'
        ? duracionMin.number
        : 0;

    const nombresTipoActividad =
      tipoActividad?.type === 'relation' && tipoActividad.relation
        ? tipoActividad.relation
            .map((relacion) => nombresPorTipoActividadId.get(relacion.id))
            .filter((nombreTipo): nombreTipo is string => Boolean(nombreTipo))
        : [];

    const nombreOriginal =
      nombre?.type === 'title' && nombre.title
        ? nombre.title.map((text) => text.plain_text).join('')
        : '';

    return {
      id: page.id,
      nombre: this.resolverNombreActividad(
        nombreOriginal,
        nombresTipoActividad,
        menuDelDia,
        tareasPorContexto,
        horaInicio,
      ),
      horaInicio,
      horaFin: this.sumarMinutos(horaInicio, minutos),
      tipoActividad: nombresTipoActividad,
    };
  }

  private resolverNombreActividad(
    nombreOriginal: string,
    nombresTipoActividad: string[],
    menuDelDia: MenuDiaOutputDto | undefined,
    tareasPorContexto: Map<string, TareaOutputDto[]>,
    horaInicio: string,
  ): string {
    const segmentos: string[] = [];

    if (menuDelDia) {
      for (const tipo of nombresTipoActividad) {
        const config = CONFIG_MENU_POR_TIPO_ACTIVIDAD[tipo];
        if (!config) continue;

        const valor = menuDelDia[config.campo];
        if (valor) segmentos.push(`${config.prefijo ?? ''}${valor}`);
      }
    }

    for (const tipo of nombresTipoActividad) {
      const contexto = CONTEXTO_POR_TIPO_ACTIVIDAD[tipo];
      if (!contexto) continue;

      const tareas = tareasPorContexto.get(contexto) ?? [];
      if (tareas.length === 0) continue;

      segmentos.push(this.formatearTareasConHorario(tareas, horaInicio));
    }

    return segmentos.length > 0 ? segmentos.join('\n') : nombreOriginal;
  }

  private formatearTareasConHorario(
    tareas: TareaOutputDto[],
    horaInicio: string,
  ): string {
    let horaActual = horaInicio;

    return tareas
      .map((tarea) => {
        const horaFinTarea = this.sumarMinutos(
          horaActual,
          tarea.tiempoEstimadoMin,
        );
        const linea = `${horaActual}-${horaFinTarea} ${tarea.nombre}`;
        horaActual = horaFinTarea;
        return linea;
      })
      .join('\n');
  }

  private toTareaDto(page: TareaInputDto): TareaOutputDto {
    const nombre = page.properties.Nombre;
    const estado = page.properties.Estado;
    const contexto = page.properties.Contexto;
    const dependeDe = page.properties.Depende_De;
    const tiempoEstimado = page.properties.Tiempo_Estimado;

    const tiempoEstimadoTexto =
      tiempoEstimado?.type === 'rich_text' && tiempoEstimado.rich_text
        ? tiempoEstimado.rich_text.map((text) => text.plain_text).join('')
        : '';

    return {
      id: page.id,
      nombre:
        nombre?.type === 'title' && nombre.title
          ? nombre.title.map((text) => text.plain_text).join('')
          : '',
      estado:
        estado?.type === 'select' && estado.select ? estado.select.name : '',
      contexto:
        contexto?.type === 'select' && contexto.select
          ? contexto.select.name
          : '',
      dependeDeIds:
        dependeDe?.type === 'relation' && dependeDe.relation
          ? dependeDe.relation.map((relacion) => relacion.id)
          : [],
      tiempoEstimadoMin: this.minutosDesdeTexto(tiempoEstimadoTexto),
    };
  }

  private minutosDesdeTexto(horaTexto: string): number {
    const [horas, mins] = horaTexto.split(':').map(Number);
    if (Number.isNaN(horas) || Number.isNaN(mins)) return 0;
    return horas * 60 + mins;
  }

  private toMenuDiaDto(page: MenuDiaInputDto): MenuDiaOutputDto {
    const nombre = page.properties.Nombre;
    const desayuno = page.properties.Desayuno;
    const almuerzo = page.properties.Almuerzo;
    const cena = page.properties.Cena;
    const limpieza = page.properties.Limpieza;

    return {
      id: page.id,
      dia:
        nombre?.type === 'title' && nombre.title
          ? nombre.title.map((text) => text.plain_text).join('')
          : '',
      desayuno:
        desayuno?.type === 'rich_text' && desayuno.rich_text
          ? desayuno.rich_text.map((text) => text.plain_text).join('')
          : '',
      almuerzo:
        almuerzo?.type === 'rich_text' && almuerzo.rich_text
          ? almuerzo.rich_text.map((text) => text.plain_text).join('')
          : '',
      cena:
        cena?.type === 'rich_text' && cena.rich_text
          ? cena.rich_text.map((text) => text.plain_text).join('')
          : '',
      limpieza:
        limpieza?.type === 'rich_text' && limpieza.rich_text
          ? limpieza.rich_text.map((text) => text.plain_text).join('')
          : '',
    };
  }

  private toTipoActividadDto(
    page: TipoActividadInputDto,
  ): TipoActividadOutputDto {
    const nombre = page.properties.Nombre;
    return {
      id: page.id,
      nombre:
        nombre?.type === 'title' && nombre.title
          ? nombre.title.map((text) => text.plain_text).join('')
          : '',
    };
  }

  private sumarMinutos(hora: string, minutos: number): string {
    const [horas, mins] = hora.split(':').map(Number);
    if (Number.isNaN(horas) || Number.isNaN(mins)) return '';

    const totalMinutos = (horas * 60 + mins + minutos) % (24 * 60);
    const horaFin = Math.floor(totalMinutos / 60);
    const minFin = totalMinutos % 60;

    return `${String(horaFin).padStart(2, '0')}:${String(minFin).padStart(2, '0')}`;
  }

  private toTipoDiaDto(page: TipoDiaInputDto): TipoDiaOutputDto {
    const nombre = page.properties.Nombre;
    return {
      id: page.id,
      nombre:
        nombre?.type === 'title' && nombre.title
          ? nombre.title.map((text) => text.plain_text).join('')
          : '',
    };
  }

  private async getDataSourceId(databaseId: string): Promise<string> {
    const database = await this.notion.databases.retrieve({
      database_id: databaseId,
    });

    if (!isFullDatabase(database) || database.data_sources.length === 0) {
      throw new Error(
        `La base de Notion ${databaseId} no tiene data sources disponibles`,
      );
    }

    return database.data_sources[0].id;
  }
}
