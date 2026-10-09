import {
  Controller,
  Header,
  MessageEvent,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CurrentIdentity } from '../../http/decorators/auth.decorators';
import { AuthGuard } from '../../http/guards/auth.guard';
import type { Identity } from '../../modules/auth/interfaces/auth-identity.interface';
import { RealtimeService } from '../../modules/realtime/services/realtime.service';

@Controller('api/v1/realtime')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse('stream')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  streamEvents(
    @CurrentIdentity() identity: Identity,
  ): Observable<MessageEvent> {
    return this.realtimeService.createEventStream(
      identity.organisation.id,
      identity.role,
      identity.id,
    );
  }
}
