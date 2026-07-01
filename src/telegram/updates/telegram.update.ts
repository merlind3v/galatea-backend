import { Ctx, Start, Update, On, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramService } from '../services/telegram.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly telegramService: TelegramService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await ctx.reply('¡Hola! El bot está conectado correctamente.');
  }

  @Command('botones')
  async onBotones(@Ctx() ctx: Context) {
    if (!ctx.chat) return;

    await this.telegramService.sendMessageWithButtons(
      ctx.chat.id,
      'Elegí una opción:',
      [
        { text: 'Confirmar', callbackData: 'Confirmar' },
        { text: 'Cancear', callbackData: 'Cancelar' },
      ],
    );
  }

  @On('callback_query')
  async onCallbackQuery(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    await ctx.answerCbQuery();

    const message = callbackQuery.message;
    const keyboard =
      message && 'reply_markup' in message
        ? message.reply_markup?.inline_keyboard
        : undefined;

    const selectedButton = keyboard
      ?.flat()
      .find(
        (button) =>
          'callback_data' in button &&
          button.callback_data === callbackQuery.data,
      );
    if (!selectedButton) return;

    const originalText = message && 'text' in message ? message.text : '';

    await ctx.editMessageText(`${originalText}\n\n✅ ${selectedButton.text}`);
  }
}

