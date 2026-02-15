export class KisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KisConfigError";
  }
}

export class KisNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "KisNetworkError";
  }
}

export class KisApiError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = "KisApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
