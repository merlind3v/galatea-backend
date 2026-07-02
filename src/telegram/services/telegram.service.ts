import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';
import { CONFIRMACION_LABELS } from '../constants/telegram-callbacks.constant';
import { NotionService } from '../../notion/services/notion.service';

@Injectable()
export class TelegramService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly notionService: NotionService,
    private readonly configService: ConfigService,
  ) {}

  async sendMessage(chatId: string | number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text);
  }

  async sendMessageProactivo(text: string) {
    const chatId = this.configService.getOrThrow<string>('TELEGRAM_CHAT_ID');
    return this.sendMessage(chatId, text);
  }

  async sendMessageConfirmarInicio(agendaId: string, nombreActividad: string) {
    const chatId = this.configService.getOrThrow<string>('TELEGRAM_CHAT_ID');

    return this.bot.telegram.sendMessage(
      chatId,
      `⏰ ¿Arrancaste con: ${nombreActividad}?`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Sí, arranqué', `inicioconfirm:${agendaId}`),
      ]),
    );
  }

  async sendMessageCheckpointFin(agendaId: string, nombreActividad: string) {
    const chatId = this.configService.getOrThrow<string>('TELEGRAM_CHAT_ID');

    return this.bot.telegram.sendMessage(
      chatId,
      `⏱ ¿Cómo va "${nombreActividad}"?`,
      Markup.inlineKeyboard([
        Markup.button.callback(
          '✅ Completado',
          `finconfirm:completar:${agendaId}`,
        ),
        Markup.button.callback('⏱ Extender', `finconfirm:extender:${agendaId}`),
      ]),
    );
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
