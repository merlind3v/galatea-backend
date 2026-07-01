import { Ctx, Start, Update, Action, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from '../services/telegram.service';
import { CONFIRMACION_LABELS } from '../constants/telegram-callbacks.constant';
import { NotionService } from '../../notion/services/notion.service';
import { PlantillaActividadOutputDto } from '../../notion/dto/output/plantilla-actividad.output.dto';

@Update()
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly notionService: NotionService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await ctx.reply('¡Hola! El bot está conectado correctamente.');
  }

  @Command('plan')
  async onPlanificacion(@Ctx() ctx: Context) {
    if (!ctx.chat) return;
    await this.telegramService.sendMessagePlanification(
      ctx.chat.id,
      '¡Bienvenido a la planificación!',
    );
  }

  @Command('conf')
  async onSendConfirmation(@Ctx() ctx: Context) {
    if (!ctx.chat) return;
    await this.telegramService.sendMessageConfirmation(
      ctx.chat.id,
      'Elige una opción:',
    );
  }

  @Action(/^confirmacion:/)
  async onConfirmation(@Ctx() ctx: Context) {
    await this.handleSelectableCallback(ctx, CONFIRMACION_LABELS);
  }

  @Action(/^planificacion:/)
  async onPlanificacionSeleccion(@Ctx() ctx: Context) {
    const tiposDia = await this.notionService.getTiposDia();
    const labels = Object.fromEntries(
      tiposDia.map((tipoDia) => [tipoDia.id, tipoDia.nombre]),
    );
    const tipoDiaId = await this.handleSelectableCallback(ctx, labels);
    if (!tipoDiaId || !ctx.chat) return;

    const plantillas =
      await this.notionService.getPlantillasActividades(tipoDiaId);

    await this.telegramService.sendMessage(
      ctx.chat.id,
      this.formatPlantillas(plantillas),
    );
  }

  private formatPlantillas(plantillas: PlantillaActividadOutputDto[]): string {
    if (plantillas.length === 0) {
      return 'No hay actividades planificadas para este tipo de día.';
    }

    return plantillas
      .map(
        (plantilla) =>
          `${plantilla.horaInicio}-${plantilla.horaFin}\n${plantilla.nombre}\n${plantilla.tipoActividad.join(', ')}\n-`,
      )
      .join('\n');
  }

  private async handleSelectableCallback(
    ctx: Context,
    labels: Record<string, string>,
    text?: string,
  ): Promise<string | undefined> {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return undefined;

    await ctx.answerCbQuery();

    const [, valor] = callbackQuery.data.split(':');
    const label = labels[valor] ?? valor;

    const message = callbackQuery.message;
    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(
      `${originalText + (text ? text : '')}\n\n✅ ${label}`,
    );

    return valor;
  }
}
