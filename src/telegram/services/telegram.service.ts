import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';

@Injectable()
export class TelegramService {
  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async sendMessage(chatId: string | number, text: string) {
    return this.bot.telegram.sendMessage(chatId, text);
  }

  async sendMessageWithButtons(
    chatId: string | number,
    text: string,
    buttons: { text: string; callbackData: string }[],
  ) {
    return this.bot.telegram.sendMessage(
      chatId,
      text,
      Markup.inlineKeyboard(
        buttons.map((button) =>
          Markup.button.callback(button.text, button.callbackData),
        ),
      ),
    );
  }
}
