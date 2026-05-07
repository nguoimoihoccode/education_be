import {
  formatPortInUseMessage,
  resolveServerPort,
} from './server-port.util';

describe('server port utilities', () => {
  it('defaults to port 3000', () => {
    expect(resolveServerPort(undefined)).toBe(3000);
  });

  it('uses the configured PORT value', () => {
    expect(resolveServerPort('3001')).toBe(3001);
  });

  it('rejects invalid PORT values', () => {
    expect(() => resolveServerPort('abc')).toThrow('Invalid PORT');
    expect(() => resolveServerPort('0')).toThrow('Invalid PORT');
  });

  it('formats a clear port-in-use message', () => {
    expect(formatPortInUseMessage(3000)).toContain(
      'Port 3000 is already in use',
    );
    expect(formatPortInUseMessage(3000)).toContain('PORT=3001 npm run start:dev');
  });
});
