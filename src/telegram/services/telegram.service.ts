import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';
import { CONFIRMACION_LABELS, DIAS_LABELS } from '../constants/telegram-callbacks.constant';

@Injectable()
export class TelegramService {
  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async sendMessage(chatId: string | number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text);
  }

  async sendMessageConfirmation(
    chatId: string | number,
    text: string,
  ) {
    return this.bot.telegram.sendMessage(
      chatId,
      text,
      Markup.inlineKeyboard(
        Object.entries(CONFIRMACION_LABELS).map(([valor, label]) =>
          Markup.button.callback(label, `confirmacion:${valor}`),
        ),
      ),
    );
  }

  async sendMessagePlanification(chatId: string | number, text: string) {
    return this.bot.telegram.sendMessage(
      chatId,
      text,
      Markup.inlineKeyboard(
        Object.entries(DIAS_LABELS).map(([valor, label]) =>
          Markup.button.callback(label, `planificacion:${valor}`),
        ),
      ),
    );
  }
}
