import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const secret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!apiKey || apiKey !== secret) {
      throw new UnauthorizedException('API Key inválida');
    }

    return true;
  }
}