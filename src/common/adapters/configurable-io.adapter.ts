import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { buildSocketIoCorsOptions } from '../utils/cors.util';

/** Socket.IO con CORS alineado a variables de entorno (no hardcodeado). */
export class ConfigurableIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly nodeEnv: string,
    private readonly corsOriginsRaw: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: buildSocketIoCorsOptions(this.nodeEnv, this.corsOriginsRaw),
    });
  }
}
