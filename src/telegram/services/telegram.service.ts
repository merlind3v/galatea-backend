import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';
import { CONFIRMACION_LABELS } from '../constants/telegram-callbacks.constant';
import { NotionService } from '../../notion/services/notion.service';

@Injectable()
export class TelegramService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly notionService: NotionService,
  ) {}

  async sendMessage(chatId: string | number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text);
  }

  async sendMessageConfirmation(chatId: string | number, text: string) {
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

  async sendMessagePlanConValidar(
    chatId: string | number,
    text: string,
    tipoDiaId: string,
  ) {
    return this.bot.telegram.sendMessage(
      chatId,
      text,
      Markup.inlineKeyboard([
        Markup.button.callback('Validar', `validacion:${tipoDiaId}`),
      ]),
    );
  }

  async sendMessagePlanification(chatId: string | number, text: string) {
    const tiposDia = await this.notionService.getTiposDia();

    return this.bot.telegram.sendMessage(
      chatId,
      text,
      Markup.inlineKeyboard(
        tiposDia.map((tipoDia) =>
          Markup.button.callback(tipoDia.nombre, `planificacion:${tipoDia.id}`),
        ),
      ),
    );
  }
}
