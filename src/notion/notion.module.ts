import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';
import { NotionService } from './services/notion.service';
import { NOTION_CLIENT } from './constants/notion.constants';

@Module({
  providers: [
    {
      provide: NOTION_CLIENT,
      useFactory: (configService: ConfigService) =>
        new Client({
          auth: configService.getOrThrow<string>('NOTION_API_KEY'),
        }),
      inject: [ConfigService],
    },
    NotionService,
  ],
  exports: [NOTION_CLIENT, NotionService],
})
export class NotionModule {}
