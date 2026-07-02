import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { NotionService } from '../../notion/services/notion.service';
import { TelegramService } from '../../telegram/services/telegram.service';
import { AgendaOutputDto } from '../../notion/dto/output/agenda.output.dto';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  private colaDelDia: AgendaOutputDto[] = [];
  private proximaProgramada: AgendaOutputDto | undefined;
  private pendienteInicio: AgendaOutputDto | undefined;
  private pendienteFin: AgendaOutputDto | undefined;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly notionService: NotionService,
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  programarJornada(agendaDelDia: AgendaOutputDto[]): void {
    this.cancelarTodo();
    this.colaDelDia = [...agendaDelDia].sort((a, b) =>
      a.horaInicio.localeCompare(b.horaInicio),
    );
    this.arrancarPrimeraDeLaCola();
  }

  reiniciarJornada(agendaActual: AgendaOutputDto[]): void {
    this.programarJornada(agendaActual);
  }

  listarJobs(): { nombre: string; horaInicio: string; estado: string }[] {
    const resultado: { nombre: string; horaInicio: string; estado: string }[] =
      [];

    if (this.proximaProgramada) {
      resultado.push({
        nombre: this.proximaProgramada.nombre,
        horaInicio: this.proximaProgramada.horaInicio,
        estado: 'activo',
      });
    }

    if (this.pendienteInicio) {
      resultado.push({
        nombre: this.pendienteInicio.nombre,
        horaInicio: this.pendienteInicio.horaInicio,
        estado: 'esperando que confirmes el inicio',
      });
    }

    if (this.pendienteFin) {
      resultado.push({
        nombre: this.pendienteFin.nombre,
        horaInicio: this.pendienteFin.horaInicio,
        estado: 'en progreso',
      });
    }

    for (const agenda of this.colaDelDia) {
      resultado.push({
        nombre: agenda.nombre,
        horaInicio: agenda.horaInicio,
        estado: 'en cola',
      });
    }

    return resultado;
  }

  async confirmarInicio(agendaId: string): Promise<void> {
    if (!this.pendienteInicio || this.pendienteInicio.id !== agendaId) return;

    const agenda = this.pendienteInicio;
    this.pendienteInicio = undefined;
    this.cancelarRecordatorio(agendaId);

    await this.notionService.registrarEventoBitacora(
      agenda.id,
      agenda.nombre,
      'En Progreso',
    );

    this.pendienteFin = agenda;
    this.programarFin(agenda, this.calcularDelayMs(agenda.horaFin));
  }

  async completarActual(): Promise<string | undefined> {
    return this.pendienteFin
      ? this.completarInterno(this.pendienteFin)
      : undefined;
  }

  async completarPorId(agendaId: string): Promise<string | undefined> {
    if (!this.pendienteFin || this.pendienteFin.id !== agendaId) {
      return undefined;
    }
    return this.completarInterno(this.pendienteFin);
  }

  async extenderActual(agendaId: string, minutos: number): Promise<void> {
    if (!this.pendienteFin || this.pendienteFin.id !== agendaId) return;

    await this.notionService.registrarEventoBitacora(
      this.pendienteFin.id,
      this.pendienteFin.nombre,
      'En Progreso',
      minutos,
    );

    this.programarFin(this.pendienteFin, minutos * 60 * 1000);
  }

  private async completarInterno(agenda: AgendaOutputDto): Promise<string> {
    this.cancelarJobFin(agenda.id);
    this.pendienteFin = undefined;

    const desvioMin = this.calcularDesvioMin(agenda.horaFin);
    await this.notionService.registrarEventoBitacora(
      agenda.id,
      agenda.nombre,
      'Completado',
      desvioMin,
    );

    this.arrancarSiguienteInmediato();
    return agenda.nombre;
  }

  private arrancarPrimeraDeLaCola(): void {
    this.descartarVencidas();

    const siguiente = this.colaDelDia.shift();
    if (!siguiente) {
      this.logger.log('No hay actividades para programar hoy');
      return;
    }

    this.proximaProgramada = siguiente;

    const delayMs = this.calcularDelayMs(siguiente.horaInicio);
    const nombreJob = `inicio-${siguiente.id}`;

    const timeout = setTimeout(() => {
      this.schedulerRegistry.deleteTimeout(nombreJob);
      this.proximaProgramada = undefined;
      void this.iniciarConfirmacion(siguiente);
    }, delayMs);

    this.schedulerRegistry.addTimeout(nombreJob, timeout);
    this.logger.log(
      `Programada "${siguiente.nombre}" a las ${siguiente.horaInicio} (en ${Math.round(delayMs / 60000)} min)`,
    );
  }

  private arrancarSiguienteInmediato(): void {
    const siguiente = this.colaDelDia.shift();
    if (!siguiente) {
      this.logger.log('No quedan más actividades en la cola de hoy');
      return;
    }

    void this.iniciarConfirmacion(siguiente);
  }

  private async iniciarConfirmacion(agenda: AgendaOutputDto): Promise<void> {
    this.pendienteInicio = agenda;
    await this.enviarConfirmacionInicio(agenda);
    this.programarRecordatorio(agenda.id);
  }

  private async enviarConfirmacionInicio(
    agenda: AgendaOutputDto,
  ): Promise<void> {
    await this.telegramService.sendMessageConfirmarInicio(
      agenda.id,
      agenda.nombre,
    );
  }

  private programarRecordatorio(agendaId: string): void {
    const minutos = this.configService.getOrThrow<number>('RETRY_INTERVAL_MIN');
    const nombreInterval = `recordatorio-${agendaId}`;

    const interval = setInterval(
      () => {
        if (!this.pendienteInicio || this.pendienteInicio.id !== agendaId) {
          this.schedulerRegistry.deleteInterval(nombreInterval);
          return;
        }
        void this.enviarConfirmacionInicio(this.pendienteInicio);
      },
      minutos * 60 * 1000,
    );

    this.schedulerRegistry.addInterval(nombreInterval, interval);
  }

  private cancelarRecordatorio(agendaId: string): void {
    const nombreInterval = `recordatorio-${agendaId}`;
    if (this.schedulerRegistry.doesExist('interval', nombreInterval)) {
      this.schedulerRegistry.deleteInterval(nombreInterval);
    }
  }

  private programarFin(agenda: AgendaOutputDto, delayMs: number): void {
    this.cancelarJobFin(agenda.id);
    const nombreJob = `fin-${agenda.id}`;

    const timeout = setTimeout(() => {
      this.schedulerRegistry.deleteTimeout(nombreJob);
      void this.telegramService.sendMessageCheckpointFin(
        agenda.id,
        agenda.nombre,
      );
    }, delayMs);

    this.schedulerRegistry.addTimeout(nombreJob, timeout);
  }

  private cancelarJobFin(agendaId: string): void {
    const nombreJob = `fin-${agendaId}`;
    if (this.schedulerRegistry.doesExist('timeout', nombreJob)) {
      this.schedulerRegistry.deleteTimeout(nombreJob);
    }
  }

  private cancelarTodo(): void {
    for (const nombre of this.schedulerRegistry.getTimeouts()) {
      this.schedulerRegistry.deleteTimeout(nombre);
    }
    for (const nombre of this.schedulerRegistry.getIntervals()) {
      this.schedulerRegistry.deleteInterval(nombre);
    }

    this.colaDelDia = [];
    this.proximaProgramada = undefined;
    this.pendienteInicio = undefined;
    this.pendienteFin = undefined;
    this.logger.log(
      'Se cancelaron todos los jobs y se reinició la cola del día',
    );
  }

  private descartarVencidas(): void {
    const ahoraMin = this.minutosAhora();

    while (this.colaDelDia.length > 0) {
      const [proxima] = this.colaDelDia;
      if (this.minutosDesdeTexto(proxima.horaInicio) >= ahoraMin) break;

      this.logger.warn(
        `Se ignora "${proxima.nombre}" (${proxima.horaInicio}) — la hora ya pasó`,
      );
      this.colaDelDia.shift();
    }
  }

  private minutosAhora(): number {
    const ahora = new Date();
    return ahora.getHours() * 60 + ahora.getMinutes();
  }

  private minutosDesdeTexto(horaTexto: string): number {
    const [horas, minutos] = horaTexto.split(':').map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) return 0;
    return horas * 60 + minutos;
  }

  private calcularDelayMs(horaTexto: string): number {
    const [horas, minutos] = horaTexto.split(':').map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) return 0;

    const objetivo = new Date();
    objetivo.setHours(horas, minutos, 0, 0);

    return Math.max(0, objetivo.getTime() - Date.now());
  }

  private calcularDesvioMin(horaPlanificada: string): number {
    const [horas, minutos] = horaPlanificada.split(':').map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) return 0;

    const planificado = new Date();
    planificado.setHours(horas, minutos, 0, 0);

    return Math.round((Date.now() - planificado.getTime()) / 60000);
  }
}
