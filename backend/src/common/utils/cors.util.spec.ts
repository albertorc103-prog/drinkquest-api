import { buildCorsOptions, mergeCorsOrigins } from './cors.util';

describe('cors.util', () => {
  it('mergeCorsOrigins includes Render API, dev hosts and env list', () => {
    const merged = mergeCorsOrigins(
      'https://app.example.com',
      'https://drinkquest-api.onrender.com',
    );
    expect(merged).toContain('https://drinkquest-api.onrender.com');
    expect(merged).toContain('http://localhost:3000');
    expect(merged).toContain('https://app.example.com');
  });

  it('allows Swagger origin in production when appPublicUrl is set', (done) => {
    const options = buildCorsOptions(
      'production',
      'https://app.example.com',
      'https://drinkquest-api.onrender.com',
    );
    const originFn = options.origin;
    expect(typeof originFn).toBe('function');
    if (typeof originFn !== 'function') {
      done.fail('origin must be a callback');
      return;
    }
    originFn('https://drinkquest-api.onrender.com', (err, allowed) => {
      expect(err).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });

  it('development with empty CORS_ORIGINS allows any origin', () => {
    const options = buildCorsOptions('development', '');
    expect(options.origin).toBe(true);
  });
});
