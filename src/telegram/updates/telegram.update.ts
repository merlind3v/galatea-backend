import { Ctx, Start, Update, Action, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from '../services/telegram.service';
import {
  CONFIRMACION_LABELS,
  DIAS_LABELS,
} from '../constants/telegram-callbacks.constant';

@Update()
export class TelegramUpdate {
  constructor(private readonly telegramService: TelegramService) {}

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
    await this.handleSelectableCallback(ctx, DIAS_LABELS);
  }


  private async handleSelectableCallback(
    ctx: Context,
    labels: Record<string, string>,
    text?: string,
  ) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const [, valor] = callbackQuery.data.split(':');
    const label = labels[valor] ?? valor;

    const message = callbackQuery.message;
    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(`${originalText + (text ? text : '')}\n\n✅ ${label}`);
  }
}
