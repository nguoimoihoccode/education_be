const DEFAULT_PORT = 3000;

export function resolveServerPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT "${value}". PORT must be an integer between 1 and 65535.`,
    );
  }

  return port;
}

export function formatPortInUseMessage(port: number): string {
  const suggestedPort = port === 3000 ? 3001 : Math.min(port + 1, 65535);

  return [
    `Port ${port} is already in use.`,
    `Stop the existing process on port ${port}, or start this backend on another port:`,
    `PORT=${suggestedPort} npm run start:dev`,
  ].join('\n');
}
