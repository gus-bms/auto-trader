import pino from "pino";
import type { Logger, LoggerOptions } from "pino";

export function createLogger(service: string): Logger {
  const options: LoggerOptions = {
    name: service,
    level: process.env.LOG_LEVEL ?? "info"
  };

  if (process.env.NODE_ENV === "development") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true
      }
    };
  }

  return pino(options);
}
