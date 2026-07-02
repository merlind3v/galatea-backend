import { Ctx, Start, Update, Action, Command } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { TelegramService } from '../services/telegram.service';
import { CONFIRMACION_LABELS } from '../constants/telegram-callbacks.constant';
import { NotionService } from '../../notion/services/notion.service';
import { PlantillaActividadOutputDto } from '../../notion/dto/output/plantilla-actividad.output.dto';
import { SchedulerService } from '../../scheduler/services/scheduler.service';

@Update()
export class TelegramUpdate {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly notionService: NotionService,
    private readonly schedulerService: SchedulerService,
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

  @Command('jobs')
  async onJobs(@Ctx() ctx: Context) {
    if (!ctx.chat) return;

    const jobs = this.schedulerService.listarJobs();
    const texto =
      jobs.length === 0
        ? 'No hay jobs programados.'
        : jobs
            .map((job) => `${job.horaInicio} - ${job.nombre} (${job.estado})`)
            .join('\n');

    await this.telegramService.sendMessage(ctx.chat.id, texto);
  }

  @Command('listo')
  async onListo(@Ctx() ctx: Context) {
    if (!ctx.chat) return;

    const nombre = await this.schedulerService.completarActual();

    await this.telegramService.sendMessage(
      ctx.chat.id,
      nombre
        ? `✅ Marcado como completado: ${nombre}`
        : 'No hay ninguna actividad en progreso ahora mismo.',
    );
  }

  @Command('restartjob')
  async onRestartJob(@Ctx() ctx: Context) {
    if (!ctx.chat) return;

    const agendaDeHoy = await this.notionService.getAgendaDeHoy();
    this.schedulerService.reiniciarJornada(agendaDeHoy);

    await this.telegramService.sendMessage(
      ctx.chat.id,
      `Scheduler reiniciado con ${agendaDeHoy.length} actividades de Agenda.`,
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

    await this.telegramService.sendMessagePlanConValidar(
      ctx.chat.id,
      this.formatPlantillas(plantillas),
      tipoDiaId,
    );
  }

  @Action(/^validacion:/)
  async onValidacion(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const [, tipoDiaId] = callbackQuery.data.split(':');
    const plantillas =
      await this.notionService.getPlantillasActividades(tipoDiaId);
    const agendaCreada = await this.notionService.crearAgenda(
      tipoDiaId,
      plantillas,
    );
    this.schedulerService.programarJornada(agendaCreada);

    const message = callbackQuery.message;
    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(`${originalText}\n\n✅ Validado`);
  }

  @Action(/^inicioconfirm:/)
  async onInicioConfirmado(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const [, agendaId] = callbackQuery.data.split(':');
    await this.schedulerService.confirmarInicio(agendaId);

    const message = callbackQuery.message;
    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(`${originalText}\n\n✅ Confirmado`);
  }

  @Action(/^finconfirm:completar:/)
  async onFinCompletar(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const [, , agendaId] = callbackQuery.data.split(':');
    await this.schedulerService.completarPorId(agendaId);

    const message = callbackQuery.message;
    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(`${originalText}\n\n✅ Completado`);
  }

  @Action(/^finconfirm:extender:/)
  async onFinExtenderMenu(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const [, , agendaId] = callbackQuery.data.split(':');

    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard([
        Markup.button.callback('15m', `finextender:${agendaId}:15`),
        Markup.button.callback('30m', `finextender:${agendaId}:30`),
        Markup.button.callback('1h', `finextender:${agendaId}:60`),
      ]).reply_markup,
    );
  }

  @Action(/^finextender:/)
  async onFinExtender(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const [, agendaId, minutosTexto] = callbackQuery.data.split(':');
    const minutos = Number(minutosTexto);
    await this.schedulerService.extenderActual(agendaId, minutos);

    const message = callbackQuery.message;
    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(`${originalText}\n\n⏱ Extendido ${minutos} min`);
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
