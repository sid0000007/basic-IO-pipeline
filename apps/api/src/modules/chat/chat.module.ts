import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { StreamRegistry } from './stream-registry';
import { CancellationRegistry } from './cancellation-registry';

@Module({
  controllers: [ChatController],
  providers: [ChatService, StreamRegistry, CancellationRegistry],
})
export class ChatModule {}
