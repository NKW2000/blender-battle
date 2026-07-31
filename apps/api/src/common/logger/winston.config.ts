import { utilities as nestWinstonUtilities } from 'nest-winston';
import winston from 'winston';

/**
 * Structured JSON in production so a log shipper can index fields; human-readable
 * colourised output in development. Same logger either way — only the formatter
 * differs, so log call sites never branch on environment.
 */
export function buildWinstonOptions(
  level: string,
  isProduction: boolean,
): winston.LoggerOptions {
  return {
    level,
    format: isProduction
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        )
      : winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          nestWinstonUtilities.format.nestLike('api', {
            colors: true,
            prettyPrint: true,
          }),
        ),
    transports: [new winston.transports.Console()],
    // Never let a logging failure take down the process.
    exitOnError: false,
  };
}
