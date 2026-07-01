import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { NotionModule } from './notion/notion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().default(3000),
        NODE_OPTIONS: Joi.string().optional(),
        WEBHOOK_SECRET: Joi.string().required(),
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        TELEGRAM_CHAT_ID: Joi.string().required(),
        NOTION_API_KEY: Joi.string().optional(),
        NOTION_DB_TIPOS_DIA: Joi.string().optional(),
        NOTION_DB_PLANTILLAS: Joi.string().optional(),
        NOTION_DB_TIPO_ACTIVIDAD: Joi.string().optional(),
        NOTION_DB_MENU_SEMANA: Joi.string().optional(),
        NOTION_DB_REGISTRO_DIARIO: Joi.string().optional(),
        NOTION_DB_REGISTRO_ACTIVIDADES: Joi.string().optional(),
        NOTION_DB_OBJETIVOS: Joi.string().optional(),
        NOTION_DB_RESULTADOS_CLAVE: Joi.string().optional(),
        NOTION_DB_PROYECTOS: Joi.string().optional(),
        NOTION_DB_ETAPAS: Joi.string().optional(),
        NOTION_DB_TAREAS: Joi.string().optional(),
        RETRY_INTERVAL_MIN: Joi.number().default(5),
      }),
    }),
    TelegramModule,
    NotionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
